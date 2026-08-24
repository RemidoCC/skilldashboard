-- Skill Unit is a single-user app: no public signup.
-- Two gates. This one is the hard one — the database refuses to create any
-- account other than the owner's, even if the auth endpoint is reachable.
-- The app layer has a matching check in lib/auth/allowlist.ts.

create or replace function public.enforce_single_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) is distinct from 'remi.gommans@gmail.com' then
    raise exception 'Registratie is gesloten.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_account on auth.users;
create trigger enforce_single_account
  before insert on auth.users
  for each row execute function public.enforce_single_account();

-- Give a brand new account its eight skills straight away, so the first
-- screen after the magic link is never empty.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_skills(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
