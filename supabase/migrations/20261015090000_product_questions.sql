/*
 * Customer questions & answers on product pages. Signed-in shoppers ask a
 * question about a product and answer other shoppers' questions; answers from
 * someone with a placed order containing the product are marked "verified".
 * Answers can be voted helpful (once per shopper, never your own).
 *
 * Everyone reads questions and answers. All writes go through the functions
 * below, which set the author, verification and counters, so none of them can
 * be forged; a shopper can delete their own question or answer, and an admin
 * any.
 */

create table public.product_questions (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references public.products (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  author_name  text not null check (char_length(author_name) between 1 and 60),
  body         text not null check (char_length(body) between 10 and 300),
  answer_count integer not null default 0 check (answer_count >= 0),
  created_at   timestamptz not null default now()
);

create index product_questions_product_idx on public.product_questions (product_id, answer_count desc, created_at desc);
create index product_questions_user_idx on public.product_questions (user_id);

create table public.product_answers (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.product_questions (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  author_name   text not null check (char_length(author_name) between 1 and 60),
  body          text not null check (char_length(body) between 2 and 1000),
  verified      boolean not null default false,
  helpful_count integer not null default 0 check (helpful_count >= 0),
  created_at    timestamptz not null default now()
);

create index product_answers_question_idx on public.product_answers (question_id, helpful_count desc, created_at);
create index product_answers_user_idx on public.product_answers (user_id);
-- one answer per shopper per question
create unique index product_answers_one_per_user on public.product_answers (question_id, user_id) where user_id is not null;

create table public.answer_votes (
  answer_id  uuid not null references public.product_answers (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

create index answer_votes_user_idx on public.answer_votes (user_id);

alter table public.product_questions enable row level security;
alter table public.product_answers enable row level security;
alter table public.answer_votes enable row level security;

create policy "questions are public" on public.product_questions
  for select to anon, authenticated using (true);
create policy "answers are public" on public.product_answers
  for select to anon, authenticated using (true);
create policy "see own answer votes" on public.answer_votes
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.product_questions from anon, authenticated;
revoke insert, update, delete, truncate on public.product_answers from anon, authenticated;
revoke all on public.answer_votes from anon;
revoke insert, update, delete, truncate on public.answer_votes from authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

/** The name shown on a shopper's questions and answers (their profile name). */
create function private.qa_author(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(pr.display_name), ''), 'Customer'), 60)
  from (select 1) one
  left join public.profiles pr on pr.id = p_uid
$$;

/** Text as stored: trimmed, inner runs of whitespace kept (line breaks are allowed in answers). */
create function private.qa_text(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(coalesce(p_body, ''), E' \t\r\n')
$$;

create function private.question_json(q public.product_questions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id, 'product_id', q.product_id, 'user_id', q.user_id, 'author_name', q.author_name,
    'body', q.body, 'answer_count', q.answer_count, 'created_at', q.created_at
  )
$$;

create function private.answer_json(a public.product_answers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'question_id', a.question_id, 'user_id', a.user_id, 'author_name', a.author_name,
    'body', a.body, 'verified', a.verified, 'helpful_count', a.helpful_count, 'created_at', a.created_at
  )
$$;

-- ---------------------------------------------------------------------------
-- writes
-- ---------------------------------------------------------------------------

/** Ask a question about a product on sale. The same question twice from one shopper is a `duplicate`. */
create function public.ask_question(p_product text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := private.qa_text(p_body);
  v_q    public.product_questions;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products p where p.id = p_product) then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.products p where p.id = p_product and p.archived_at is not null) then
    raise exception 'product_unavailable' using errcode = 'P0001', detail = p_product;
  end if;
  if char_length(v_body) not between 10 and 300 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'body';
  end if;
  if exists (
    select 1 from public.product_questions q
    where q.product_id = p_product and q.user_id = v_uid and lower(q.body) = lower(v_body)
  ) then
    raise exception 'duplicate' using errcode = 'P0001', detail = 'body';
  end if;

  insert into public.product_questions (product_id, user_id, author_name, body)
  values (p_product, v_uid, private.qa_author(v_uid), v_body)
  returning * into v_q;
  return private.question_json(v_q);
end
$$;

/**
 * Answer someone's question (one answer per shopper per question). The answer is
 * verified when the caller has a placed order containing the product.
 */
create function public.answer_question(p_question uuid, p_body text)
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
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.user_id = v_uid and o.status = 'placed' and oi.product_id = v_product
    )
  )
  returning * into v_a;
  update public.product_questions q set answer_count = q.answer_count + 1 where q.id = p_question;
  return private.answer_json(v_a);
end
$$;

/** Delete a question (yours, or any as an admin), with its answers. */
create function public.delete_question(p_question uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.product_questions q
  where q.id = p_question and (q.user_id = v_uid or public.is_admin());
  if not found then
    raise exception 'question_not_found' using errcode = 'P0002';
  end if;
end
$$;

/** Delete an answer (yours, or any as an admin). */
create function public.delete_answer(p_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.product_answers a
  where a.id = p_answer and (a.user_id = v_uid or public.is_admin())
  returning a.question_id into v_q;
  if v_q is null then
    raise exception 'answer_not_found' using errcode = 'P0002';
  end if;
  update public.product_questions q set answer_count = greatest(q.answer_count - 1, 0) where q.id = v_q;
end
$$;

/** Toggle the caller's helpful vote on an answer; returns the new state and count. */
create function public.toggle_answer_helpful(p_answer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_voted boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select a.user_id into v_owner from public.product_answers a where a.id = p_answer for update;
  if not found then
    raise exception 'answer_not_found' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'own_answer' using errcode = 'P0001';
  end if;

  delete from public.answer_votes v where v.answer_id = p_answer and v.user_id = v_uid;
  v_voted := not found;
  if v_voted then
    insert into public.answer_votes (answer_id, user_id) values (p_answer, v_uid);
  end if;
  update public.product_answers a
     set helpful_count = greatest(a.helpful_count + case when v_voted then 1 else -1 end, 0)
   where a.id = p_answer
  returning a.helpful_count into v_count;

  return jsonb_build_object('answer_id', p_answer, 'helpful', v_voted, 'helpful_count', v_count);
end
$$;

revoke execute on function private.qa_author(uuid) from public, anon, authenticated;
revoke execute on function private.qa_text(text) from public, anon, authenticated;
revoke execute on function private.question_json(public.product_questions) from public, anon, authenticated;
revoke execute on function private.answer_json(public.product_answers) from public, anon, authenticated;

revoke execute on function public.ask_question(text, text) from public, anon;
revoke execute on function public.answer_question(uuid, text) from public, anon;
revoke execute on function public.delete_question(uuid) from public, anon;
revoke execute on function public.delete_answer(uuid) from public, anon;
revoke execute on function public.toggle_answer_helpful(uuid) from public, anon;
grant execute on function public.ask_question(text, text) to authenticated, service_role;
grant execute on function public.answer_question(uuid, text) to authenticated, service_role;
grant execute on function public.delete_question(uuid) to authenticated, service_role;
grant execute on function public.delete_answer(uuid) to authenticated, service_role;
grant execute on function public.toggle_answer_helpful(uuid) to authenticated, service_role;
