-- Foundation: a private schema for internal helpers (never exposed through the
-- Data API) and small pure functions shared by later migrations.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Trimmed, length-capped text from a jsonb payload; NULL when blank.
create function private.clean_text(p_payload jsonb, p_key text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(coalesce(p_payload ->> p_key, '')), p_max), '')
$$;

-- Postcode shape per store: US ZIP / ZIP+4, India 6-digit PIN (no leading zero).
create function private.valid_postcode(p_market text, p_postcode text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_market
    when 'US' then coalesce(p_postcode ~ '^[0-9]{5}(-[0-9]{4})?$', false)
    when 'IN' then coalesce(p_postcode ~ '^[1-9][0-9]{5}$', false)
    else false
  end
$$;

-- Generic updated_at stamp for BEFORE UPDATE triggers.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
