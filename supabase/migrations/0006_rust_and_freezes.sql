-- Two gaps left open in phase 1, closed here.
--
-- 1. Rust had nowhere to live. The ledger is supposed to be the source of
--    truth for all history, so a decay that only ever touched skills.level
--    made recalculate_levels a partial rebuild. Rust now writes a log entry
--    with a negative amount, exactly large enough to drop one level to zero
--    XP, and the replay walks levels downward as well as upward. The diary
--    gains an honest line, and a rebuild reproduces the real state.
--
-- 2. Streak freezes had no home at all. One row per earned freeze, carrying
--    the week that earned it and the day it was spent, so "show clearly when
--    a freeze was spent" is a column rather than a guess.

alter table public.log_entries
  drop constraint log_entries_source_check;

alter table public.log_entries
  add constraint log_entries_source_check
  check (source in ('manual','timer','quick','calendar','mail','quest','rust'));

create table public.streak_freezes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Monday of the completed week that earned this freeze.
  earned_week date not null,
  -- The day it covered. Null while the freeze is still held.
  spent_on    date,
  created_at  timestamptz not null default now(),
  -- One freeze per completed week. The cap of three held at once is a rule
  -- about granting, not about storage, so it lives in the domain layer.
  unique (user_id, earned_week)
);

create index streak_freezes_held_idx
  on public.streak_freezes (user_id, spent_on);

alter table public.streak_freezes enable row level security;

create policy own_rows on public.streak_freezes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The replay now walks in both directions. A negative entry borrows from the
-- level below rather than being clamped away, which is what makes a rust
-- entry reconstructible. Level 1 is the floor of the walk itself; the
-- floor_level promise is enforced when the rust amount is computed, so no
-- entry in the ledger can breach it.
create or replace function public.recalculate_levels(p_user uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s        record;
  e        record;
  v_level  int;
  v_xp     int;
  v_floor  int;
  v_need   int;
begin
  for s in
    select id from public.skills where user_id = p_user
  loop
    v_level := 1;
    v_xp    := 0;
    v_floor := 0;

    for e in
      select xp
        from public.log_entries
       where user_id = p_user and skill_id = s.id
       order by created_at, id
    loop
      v_xp := v_xp + e.xp;

      loop
        v_need := public.xp_needed(v_level);
        exit when v_xp < v_need;
        v_xp    := v_xp - v_need;
        v_level := v_level + 1;
        if v_level % 5 = 0 then
          v_floor := v_level;
        end if;
      end loop;

      while v_xp < 0 and v_level > 1 loop
        v_level := v_level - 1;
        v_xp    := v_xp + public.xp_needed(v_level);
      end loop;

      -- Level 1 cannot be undercut.
      if v_xp < 0 then
        v_xp := 0;
      end if;
    end loop;

    update public.skills
       set level       = v_level,
           xp          = v_xp,
           floor_level = greatest(floor_level, v_floor)
     where id = s.id;
  end loop;
end;
$$;

-- apply_xp gains the same downward walk, so a rust entry written through
-- log_completion lands on exactly the state a rebuild would produce.
create or replace function public.apply_xp(p_skill uuid, p_gain int)
returns public.skills
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s      public.skills;
  v_need int;
begin
  select * into s from public.skills where id = p_skill for update;
  if not found then
    raise exception 'Onbekende vaardigheid.' using errcode = '22023';
  end if;

  s.xp := s.xp + p_gain;

  loop
    v_need := public.xp_needed(s.level);
    exit when s.xp < v_need;
    s.xp    := s.xp - v_need;
    s.level := s.level + 1;
    if s.level % 5 = 0 then
      s.floor_level := greatest(s.floor_level, s.level);
    end if;
  end loop;

  while s.xp < 0 and s.level > 1 loop
    s.level := s.level - 1;
    s.xp    := s.xp + public.xp_needed(s.level);
  end loop;

  if s.xp < 0 then
    s.xp := 0;
  end if;

  update public.skills
     set level = s.level, xp = s.xp, floor_level = s.floor_level
   where id = p_skill
  returning * into s;

  return s;
end;
$$;

revoke execute on function public.apply_xp(uuid, int) from public, anon, authenticated;
