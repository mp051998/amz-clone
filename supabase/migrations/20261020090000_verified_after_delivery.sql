/**
 * "Verified purchase" on reviews and "verified" on answers now need an order containing the
 * product to have been delivered, not just placed. Delivery is booked at placement, so a shopper
 * could review a product as a verified buyer the moment they ordered it (and cancel before it
 * shipped, keeping the badge), while the order page only offers a review once it has arrived.
 *
 * A review's flag is worked out again whenever its author edits it. Reviews and answers already
 * marked verified without a delivered order lose the mark.
 */

/** The shopper has a delivered order (placed, delivery time passed) containing the product. */
create function private.has_received(p_user uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = p_user
      and o.status = 'placed'
      and o.delivered_at <= now()
      and oi.product_id = p_product
  )
$$;

revoke execute on function private.has_received(uuid, text) from public, anon, authenticated;

-- Customer writes keep the moderation columns as they were (on insert: none).
-- The moderation functions set app.review_moderation to pass through.
create or replace function public.reviews_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 or current_setting('app.review_moderation', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id := v_uid;
    new.seeded := false;
    new.helpful_count := 0;
    new.created_at := now();
    new.author_name := left(coalesce(
      nullif(btrim(new.author_name), ''),
      (select pr.display_name from public.profiles pr where pr.id = v_uid),
      'Customer'
    ), 60);
    new.hidden_at := null;
    new.hidden_reason := null;
    new.moderated_at := null;
  else
    new.user_id := old.user_id;
    new.product_id := old.product_id;
    new.seeded := old.seeded;
    new.helpful_count := old.helpful_count;
    new.created_at := old.created_at;
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
    new.moderated_at := old.moderated_at;
  end if;

  new.verified := private.has_received(v_uid, new.product_id);
  new.updated_at := now();
  return new;
end
$$;

/**
 * Answer someone's question (one answer per shopper per question). The answer is
 * verified when one of the caller's orders containing the product has been delivered.
 */
create or replace function public.answer_question(p_question uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_body    text := private.qa_text(p_body);
  v_product text;
  v_a       public.product_answers;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select q.product_id into v_product from public.product_questions q where q.id = p_question for update;
  if not found then
    raise exception 'question_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 2 and 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'body';
  end if;
  if exists (select 1 from public.product_answers a where a.question_id = p_question and a.user_id = v_uid) then
    raise exception 'duplicate' using errcode = 'P0001', detail = 'answer';
  end if;

  insert into public.product_answers (question_id, user_id, author_name, body, verified)
  values (
    p_question, v_uid, private.qa_author(v_uid), v_body,
    private.has_received(v_uid, v_product)
  )
  returning * into v_a;
  update public.product_questions q set answer_count = q.answer_count + 1 where q.id = p_question;
  return private.answer_json(v_a);
end
$$;

-- no auth.uid() here, so the review trigger passes this through: only the flag changes, and the
-- rating rollup nets to zero
update public.reviews r
   set verified = false
 where r.verified and not r.seeded and r.user_id is not null
   and not private.has_received(r.user_id, r.product_id);

update public.product_answers a
   set verified = false
  from public.product_questions q
 where q.id = a.question_id and a.verified
   and not private.has_received(a.user_id, q.product_id);
