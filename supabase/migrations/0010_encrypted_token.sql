-- The refresh token, encrypted at rest.
--
-- RLS keeps this column away from the client (0008), but RLS is a property of
-- the connection, not of the bytes: a dump, a restored backup, or one careless
-- service-role query hands the token over in the clear. It is now stored as
-- AES-256-GCM ciphertext, keyed from TOKEN_ENCRYPTION_KEY in the environment,
-- so a copy of the database on its own is worth nothing.
--
-- The constraint is the point of this migration. Without it, a future code
-- path could write a plaintext token and nothing would notice until someone
-- read the table. With it, the database refuses.

alter table public.integration_accounts
  drop constraint if exists refresh_token_encrypted;

-- Any row written before this migration is plaintext and cannot be salvaged:
-- there is no key it was written under. Dropping it costs one reconnect and is
-- the only honest way to make the constraint true.
delete from public.integration_accounts
 where refresh_token !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$';

alter table public.integration_accounts
  add constraint refresh_token_encrypted
  check (refresh_token ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$');

comment on column public.integration_accounts.refresh_token is
  'AES-256-GCM ciphertext: v1.<iv>.<tag>.<ciphertext>, base64url. See lib/server/secrets.ts. Never plaintext.';
