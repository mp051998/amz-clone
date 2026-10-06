-- Whether an account already uses an email address. The server checks before it
-- changes an account's email through the Auth admin API, which answers a taken
-- address with a bare "Error updating user". Service role only: it would
-- otherwise tell anyone which addresses have accounts.
create function public.email_in_use(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)))
$$;

revoke execute on function public.email_in_use(text) from public, anon, authenticated;
grant execute on function public.email_in_use(text) to service_role;
