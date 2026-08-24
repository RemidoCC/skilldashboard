-- Recording a completion touches two things: the ledger and the derived level.
-- Doing it in one function keeps them from drifting apart if a request dies
-- halfway, and gives the offline queue something it can safely replay.

-- Advances one skill by a gain, cascading levels and claiming floors.
-- The same walk as recalculate_levels, applied incrementally.
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

  s.xp := greatest(s.xp + p_gain, 0);

  loop
    v_need := public.xp_needed(s.level);
    exit when s.xp < v_need;
    s.xp    := s.xp - v_need;
    s.level := s.level + 1;
    if s.level % 5 = 0 then
      s.floor_level := greatest(s.floor_level, s.level);
    end if;
  end loop;

  update public.skills
     set level = s.level, xp = s.xp, floor_level = s.floor_level
   where id = p_skill
  returning * into s;

  return s;
end;
$$;

-- Writes one completion and advances the skill in the same statement.
--
-- p_id is supplied by the client so a queued mutation replayed after a
-- reconnect lands exactly once: the second attempt hits the primary key,
-- inserts nothing, and returns the skill untouched.
create or replace function public.log_completion(
  p_id         uuid,
  p_skill      uuid,
  p_task       uuid,
  p_title      text,
  p_xp         int,
  p_minutes    int,
  p_note       text,
  p_source     text,
  p_created_at timestamptz
)
returns public.skills
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_rows int;
  s      public.skills;
  v_at   timestamptz := coalesce(p_created_at, now());
begin
  if v_user is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  insert into public.log_entries
    (id, user_id, skill_id, task_id, title, xp, minutes, note, source, created_at)
  values
    (coalesce(p_id, gen_random_uuid()), v_user, p_skill, p_task, p_title,
     p_xp, p_minutes, nullif(btrim(coalesce(p_note, '')), ''), p_source, v_at)
  on conflict (id) do nothing;

  get diagnostics v_rows = row_count;

  -- Already recorded by an earlier replay: report the skill as it stands.
  if v_rows = 0 then
    select * into s from public.skills where id = p_skill;
    return s;
  end if;

  s := public.apply_xp(p_skill, p_xp);

  -- last_active_at drives rust, and only ever moves forward.
  update public.skills
     set last_active_at = greatest(coalesce(last_active_at, v_at), v_at)
   where id = p_skill
  returning * into s;

  return s;
end;
$$;
