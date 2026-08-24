-- Skill Unit — the level curve, in the database.
-- The same maths lives in lib/domain/curve.ts. Both round through numeric /
-- half-away-from-zero so they agree exactly; round() on double precision is
-- platform-dependent for ties and must not be used here.

-- xp_needed(level) = round(100 * level^1.6)
create or replace function public.xp_needed(p_level int)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round((100 * power(p_level::numeric, 1.6)))::int;
$$;

comment on function public.xp_needed(int) is
  'XP required to advance from p_level to p_level + 1.';

-- Rebuilds skills.level / skills.xp / skills.floor_level from log_entries.
-- log_entries is the ledger; this proves the derived state can always be
-- reconstructed from it. XP carries over on level-up and a single entry may
-- cascade several levels.
--
-- floor_level is set to the level reached every time the skill crosses a
-- multiple of 5, and floors are permanent — hence greatest() rather than a
-- plain assignment. Levels lost to rust are not part of the ledger, so this
-- rebuilds the earned progression.
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
      v_xp := greatest(v_xp + e.xp, 0);

      loop
        v_need := public.xp_needed(v_level);
        exit when v_xp < v_need;
        v_xp    := v_xp - v_need;
        v_level := v_level + 1;
        if v_level % 5 = 0 then
          v_floor := v_level;
        end if;
      end loop;
    end loop;

    update public.skills
       set level       = v_level,
           xp          = v_xp,
           floor_level = greatest(floor_level, v_floor)
     where id = s.id;
  end loop;
end;
$$;

comment on function public.recalculate_levels(uuid) is
  'Rebuilds derived level/xp/floor_level for every skill from log_entries.';

-- The eight skills the app ships with: four on, four available but off.
-- Idempotent, so re-running it after a partial bootstrap is safe.
create or replace function public.seed_default_skills(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.skills where user_id = p_user) then
    return;
  end if;

  insert into public.skills (user_id, name, subtitle, color, glyph, active, sort_order)
  values
    (p_user, 'Werk',        'Loondienst en opdrachten', '#5C7A99', 'square',   true,  1),
    (p_user, 'Remido',      'Eigen zaak',               '#A6572E', 'diamond',  true,  2),
    (p_user, 'Gezin',       'Thuis en aandacht',        '#6E8C5A', 'ring',     true,  3),
    (p_user, 'Gezondheid',  'Lichaam en rust',          '#8A6E9E', 'wave',     true,  4),
    (p_user, 'Podium',      'Optreden en spreken',      '#9E8A4A', 'triangle', false, 5),
    (p_user, 'Maken',       'Handwerk en bouwen',       '#7A6A5A', 'cross',    false, 6),
    (p_user, 'Leren',       'Studie en lezen',          '#4A7A7A', 'hexagon',  false, 7),
    (p_user, 'Netwerk',     'Contact onderhouden',      '#8A5A6E', 'bars',     false, 8);
end;
$$;

revoke execute on function public.seed_default_skills(uuid) from public, anon, authenticated;
