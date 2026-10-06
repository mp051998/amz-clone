# Sourced by .github/workflows/supabase-migrations.yml.
#
# hosted <supabase command...> runs a CLI command against the hosted project and
# retries if the login failed because another run reset the CLI's temporary login
# role. Without SUPABASE_DB_PASSWORD, every command re-creates cli_login_postgres
# with a fresh password, so two runs at once can void each other's (SQLSTATE 28P01).
# A failed login happens before any SQL runs, so a retry is safe. Other errors are
# not retried. Stdout is only passed on from the attempt that counts.
hosted() {
  local out err attempt rc delay="${HOSTED_RETRY_DELAY:-15}"
  out=$(mktemp)
  err=$(mktemp)
  for attempt in 1 2 3 4; do
    rc=0
    "$@" >"$out" 2>"$err" || rc=$?
    cat "$err" >&2
    if [ "$rc" = 0 ] || [ "$attempt" = 4 ] || ! grep -s 28P01 "$out" "$err" >/dev/null; then
      cat "$out"
      return "$rc"
    fi
    echo "::warning::Another run reset the CLI login role; retrying in $((attempt * delay))s" >&2
    sleep $((attempt * delay))
  done
}
