-- Applied after the migrations, mirroring the privileges Supabase hands the
-- anon and authenticated roles by default. Without these the local harness
-- fails every query on a schema error and RLS is never actually exercised —
-- which would make a policy test pass for entirely the wrong reason.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

grant execute on all functions in schema public to authenticated, service_role;

-- The migrations revoke on top of this; re-apply those so ordering cannot
-- quietly hand the client something a migration took away.
revoke execute on function public.seed_default_skills(uuid) from public, anon, authenticated;
revoke execute on function public.apply_xp(uuid, int) from public, anon, authenticated;
revoke select on public.integration_accounts from authenticated, anon;
grant select (user_id, provider, scopes, connected_at)
  on public.integration_accounts to authenticated;
revoke insert, update, delete on public.integration_accounts from authenticated, anon;
