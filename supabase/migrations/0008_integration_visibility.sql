-- Beheer has to answer one question — is Google connected — and it could not.
--
-- integration_accounts had RLS on with no policy at all, which locks the
-- signed-in client out of every column including the harmless ones. The screen
-- would then report "not connected" forever, however many times you linked it.
--
-- The fix keeps the guarantee that matters. RLS decides rows, GRANT decides
-- columns, so the two together let the client see that a row exists while the
-- refresh token stays unreadable.
--
-- Note the shape: the table-level SELECT has to go first. A column-level
-- REVOKE cannot subtract from a table-wide grant — Postgres treats
-- `grant select on <table>` as covering every column, present and future — so
-- revoking the column alone leaves the token readable. Granting the safe
-- columns explicitly is the only form that actually holds.

create policy own_rows on public.integration_accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke select on public.integration_accounts from authenticated, anon;
grant select (user_id, provider, scopes, connected_at)
  on public.integration_accounts to authenticated;

-- Linking and unlinking go through route handlers on the service role, so the
-- client never needs to write here either.
revoke insert, update, delete on public.integration_accounts from authenticated, anon;
