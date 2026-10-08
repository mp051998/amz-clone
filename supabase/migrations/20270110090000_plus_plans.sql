/*
 * Plus plans and renewal, as on Amazon's "Manage membership" (a demo: nothing is billed). A
 * member is on one of the plans their store sells (monthly or annual; amazon.in also sells 3
 * months), and the membership renews at the end of each period. A member can:
 *   - switch plans, from the next renewal on (the period they're in keeps its plan);
 *   - turn renewal off, keeping the benefits until the period ends, and back on before then;
 *   - still end it at once (leave_plus).
 * public.run_plus_renewals() (service role, every five minutes on pg_cron) ends the memberships
 * whose renewal is off once their period is over, and starts the next period of the others.
 */

alter table public.markets
  add column plus_plans text[] not null default array['monthly', 'annual']
    check (cardinality(plus_plans) > 0 and plus_plans <@ array['monthly', 'quarterly', 'annual']);
update public.markets set plus_plans = array['monthly', 'quarterly', 'annual'] where id = 'IN';

create function private.plus_period(p_plan text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_plan when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end
$$;

alter table public.plus_members
  -- the store the membership is billed in, whose plans it's on
  add column market_id text not null default 'US' references public.markets (id),
  add column plan text not null default 'monthly' check (plan in ('monthly', 'quarterly', 'annual')),
  -- the plan the next period is on, when the member has switched
  add column next_plan text check (next_plan in ('monthly', 'quarterly', 'annual')),
  add column renews_at timestamptz,
  add column auto_renew boolean not null default true,
  add constraint plus_members_switch_check check (next_plan is distinct from plan);

-- existing members: monthly, billed in the store they last ordered from, renewing on the first
-- monthly anniversary of joining that's still to come
update public.plus_members pm
   set market_id = coalesce((select o.market_id from public.orders o where o.user_id = pm.user_id order by o.created_at desc limit 1), 'US'),
       renews_at = (select min(t) from generate_series(pm.joined_at + interval '1 month', now() + interval '1 month', interval '1 month') t where t > now());

alter table public.plus_members alter column renews_at set not null;

/** A membership as the API returns it. */
create function private.plus_json(p public.plus_members)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'joined_at', p.joined_at, 'delivery_day', p.delivery_day, 'market_id', p.market_id, 'plan', p.plan,
    'next_plan', p.next_plan, 'renews_at', p.renews_at, 'auto_renew', p.auto_renew)
$$;

/** Whether a store sells a plan; invalid_input (detail 'plan') when it doesn't. */
create function private.check_plus_plan(p_market text, p_plan text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.markets m where m.id = p_market and p_plan = any (m.plus_plans)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'plan';
  end if;
end
$$;

drop function public.join_plus();

/**
 * Join Plus on a plan the store sells (monthly when none is given); the first period starts
 * now. Joining again changes nothing. Returns the membership.
 */
create function public.join_plus(p_market text default 'US', p_plan text default 'monthly')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.plus_members;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform private.check_plus_plan(p_market, coalesce(p_plan, 'monthly'));
  insert into public.plus_members (user_id, market_id, plan, renews_at)
  values (v_uid, p_market, coalesce(p_plan, 'monthly'), now() + private.plus_period(coalesce(p_plan, 'monthly')))
  on conflict (user_id) do nothing;
  select * into v_row from public.plus_members pm where pm.user_id = v_uid;
  return private.plus_json(v_row);
end
$$;

revoke execute on function public.join_plus(text, text) from public, anon;
grant execute on function public.join_plus(text, text) to authenticated;

/**
 * Switch the caller's plan from their next renewal on; their current plan cancels a switch.
 * Members only (plus_required). Returns the membership.
 */
create function public.set_plus_plan(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.plus_members;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.plus_members pm where pm.user_id = v_uid for update;
  if not found then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  perform private.check_plus_plan(v_row.market_id, p_plan);
  update public.plus_members pm
     set next_plan = nullif(p_plan, pm.plan)
   where pm.user_id = v_uid
  returning * into v_row;
  return private.plus_json(v_row);
end
$$;

revoke execute on function public.set_plus_plan(text) from public, anon;
grant execute on function public.set_plus_plan(text) to authenticated;

/**
 * Turn the caller's renewal on or off. Off, the membership ends when the period does, keeping
 * every benefit until then. Members only (plus_required). Returns the membership.
 */
create function public.set_plus_renewal(p_renew boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.plus_members;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_renew is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'renew';
  end if;
  update public.plus_members pm set auto_renew = p_renew where pm.user_id = v_uid returning * into v_row;
  if not found then
    raise exception 'plus_required' using errcode = '42501';
  end if;
  return private.plus_json(v_row);
end
$$;

revoke execute on function public.set_plus_renewal(boolean) from public, anon;
grant execute on function public.set_plus_renewal(boolean) to authenticated;

/**
 * End the memberships whose period is over with renewal off, and start the next period of the
 * others that are due (on the plan they switched to, if any). Returns { ended, renewed }.
 */
create function public.run_plus_renewals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ended   integer;
  v_renewed integer := 0;
  v_n       integer;
begin
  delete from public.plus_members pm where not pm.auto_renew and pm.renews_at <= now();
  get diagnostics v_ended = row_count;
  -- a membership more than a period overdue renews once for each
  loop
    update public.plus_members pm
       set plan = coalesce(pm.next_plan, pm.plan),
           next_plan = null,
           renews_at = pm.renews_at + private.plus_period(coalesce(pm.next_plan, pm.plan))
     where pm.auto_renew and pm.renews_at <= now();
    get diagnostics v_n = row_count;
    exit when v_n = 0;
    v_renewed := v_renewed + v_n;
  end loop;
  return jsonb_build_object('ended', v_ended, 'renewed', v_renewed);
end
$$;

revoke execute on function public.run_plus_renewals() from public, anon, authenticated;
grant execute on function public.run_plus_renewals() to service_role;

select cron.schedule('plus-renewals', '*/5 * * * *', 'select public.run_plus_renewals()');
