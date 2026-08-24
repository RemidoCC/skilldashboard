-- Trigger functions have no business being callable over the REST API. They
-- would fail without a trigger context, but the surface should not exist at
-- all, so take EXECUTE away from every client-facing role.
--
-- The guards let this run against the test harness too, which skips 0003
-- (the auth triggers) so that fixtures can create users freely.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'enforce_single_account') then
    revoke execute on function public.enforce_single_account() from public, anon, authenticated;
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_new_user') then
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
end
$$;

-- apply_xp is an internal step of log_completion. Clients go through
-- log_completion so the ledger entry and the level change stay together;
-- calling apply_xp directly would move a level with nothing to show for it.
revoke execute on function public.apply_xp(uuid, int) from public, anon, authenticated;
