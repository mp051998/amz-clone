-- ===========================================================================
-- Two-step verification
-- ===========================================================================
-- Shoppers can turn on two-step verification (an authenticator app, TOTP, through
-- Supabase Auth's MFA). Once it's on, signing in with a password only gets a first-step
-- (aal1) session; entering a code from the app upgrades it to aal2.
--
-- The app keeps a first-step session on the code page, but the database also refuses
-- one outright, so a password alone can't read or change anything through the API:
-- PostgREST runs enforce_two_step_verification() before every request, and it raises
-- two_step_required for an aal1 token whose user has a verified factor. Guests, the
-- service role and shoppers without two-step verification pass straight through.

create function public.enforce_two_step_verification()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', '') = 'aal1'
     and exists (
       select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
     ) then
    raise exception 'two_step_required' using errcode = '42501',
      hint = 'Enter the code from your authenticator app to finish signing in.';
  end if;
end
$$;

revoke execute on function public.enforce_two_step_verification() from public;
grant execute on function public.enforce_two_step_verification() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.enforce_two_step_verification';
notify pgrst, 'reload config';
