-- ===========================================================================
-- Report an answer: shoppers flag answers, admins keep or delete them
-- ===========================================================================
-- Reviews could be reported, answers to product questions couldn't. Now:
--   * A signed-in shopper reports someone else's answer once (report_answer),
--     with a reason. Reporting it again changes nothing.
--   * product_answers.open_reports counts reports filed since the answer was
--     last moderated, so the admin queue can list what needs a look.
--   * Admins keep an answer (admin_keep_answer), which resolves its reports:
--     it takes new reporters to flag it again. Or they delete it, as before.

alter table public.product_answers
  add column open_reports integer not null default 0 check (open_reports >= 0),
  add column moderated_at timestamptz;

comment on column public.product_answers.open_reports is 'Reports filed since moderated_at (all of them, before any).';
comment on column public.product_answers.moderated_at is 'Last admin decision; reports filed before it are resolved.';

create index product_answers_reported_idx on public.product_answers (question_id) where open_reports > 0;

create table public.answer_reports (
  answer_id  uuid not null references public.product_answers (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text not null default 'other' check (reason in ('spam', 'offensive', 'off_topic', 'other')),
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

create index answer_reports_user_idx on public.answer_reports (user_id);

alter table public.answer_reports enable row level security;

create policy "see own answer reports, or all as an admin" on public.answer_reports
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.answer_reports from anon;
revoke insert, update, delete, truncate on public.answer_reports from authenticated;

/**
 * Report someone else's answer. The first report from a shopper counts; another
 * one from them is ignored. Returns whether this call filed it.
 */
create function public.report_answer(p_answer uuid, p_reason text default 'other')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_reason text := coalesce(p_reason, 'other');
  v_new    boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_reason not in ('spam', 'offensive', 'off_topic', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  select a.user_id into v_owner from public.product_answers a where a.id = p_answer for update;
  if not found then
    raise exception 'answer_not_found' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'own_answer' using errcode = 'P0001';
  end if;

  insert into public.answer_reports (answer_id, user_id, reason)
  values (p_answer, v_uid, v_reason)
  on conflict (answer_id, user_id) do nothing;
  v_new := found;
  if v_new then
    update public.product_answers a set open_reports = a.open_reports + 1 where a.id = p_answer;
  end if;
  return jsonb_build_object('answer_id', p_answer, 'reported', true, 'new', v_new);
end
$$;

/** Keep an answer shoppers reported: its reports so far are resolved. Admins only. */
create function public.admin_keep_answer(p_answer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.product_answers;
begin
  perform private.require_admin();
  update public.product_answers a
     set open_reports = 0, moderated_at = now()
   where a.id = p_answer
  returning * into v_row;
  if v_row.id is null then
    raise exception 'answer_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'open_reports', v_row.open_reports, 'moderated_at', v_row.moderated_at);
end
$$;

revoke execute on function public.report_answer(uuid, text) from public, anon;
revoke execute on function public.admin_keep_answer(uuid) from public, anon;
grant execute on function public.report_answer(uuid, text) to authenticated, service_role;
grant execute on function public.admin_keep_answer(uuid) to authenticated, service_role;
