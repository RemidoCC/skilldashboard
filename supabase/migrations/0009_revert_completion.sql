-- Undoing a completion.
--
-- Until now log_entries was only ever read and inserted, so a mis-tap stayed in
-- the record for good — an odd property for something that calls itself an
-- honest instrument.
--
-- Reverting has to undo everything the completion set in motion, not just the
-- row: a quest it advanced, a bonus it paid, an inbox suggestion it accepted.
-- Doing that here rather than in the route keeps all of it in one transaction,
-- so a half-undone completion cannot exist.
--
-- The levels are not adjusted by hand afterwards. The entries are removed and
-- recalculate_levels replays what is left, which is the whole point of keeping
-- the ledger authoritative.

-- The old one-argument signature has to go first. Adding a defaulted second
-- parameter creates a second function rather than replacing the first, and
-- then every existing one-argument call — the tests, the jobs — fails with
-- "function is not unique".
drop function if exists public.recalculate_levels(uuid);

-- recalculate_levels normally keeps floors permanent, because a floor once
-- earned is not given back. An undo is the one case where that is wrong: if the
-- completion never should have happened, neither should the floor it bought.
-- The flag lets the revert path rebuild floors from the remaining ledger while
-- every other caller keeps the old behaviour.
create or replace function public.recalculate_levels(p_user uuid, p_rebuild_floors boolean default false)
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

      if v_xp < 0 then
        v_xp := 0;
      end if;
    end loop;

    update public.skills
       set level       = v_level,
           xp          = v_xp,
           floor_level = case when p_rebuild_floors then v_floor
                              else greatest(floor_level, v_floor) end
     where id = s.id;
  end loop;
end;
$$;

create or replace function public.revert_completion(p_entry uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  e       public.log_entries;
  q       public.quests;
  v_week  date;
begin
  if v_user is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into e
    from public.log_entries
   where id = p_entry and user_id = v_user;

  if not found then
    raise exception 'Deze regel bestaat niet meer.' using errcode = '22023';
  end if;

  -- Rust is the system acting on a skill, and a quest bonus is a consequence
  -- rather than something you did. Neither is yours to take back; undo the
  -- completion that caused it instead.
  if e.source = 'rust' then
    raise exception 'Roest kun je niet terugdraaien. Gebruik de vaardigheid weer.'
      using errcode = '22023';
  end if;
  if e.source = 'quest' then
    raise exception 'Een opdrachtbonus draai je terug door de voltooiing terug te draaien.'
      using errcode = '22023';
  end if;

  -- The week the work happened in, matching how log_completion counted it.
  v_week := date_trunc('week', e.created_at at time zone 'Europe/Amsterdam')::date;

  select * into q
    from public.quests
   where user_id = v_user
     and skill_id = e.skill_id
     and week_start = v_week;

  if found then
    -- If the quest was finished, this completion is what finished it: take the
    -- bonus back and reopen it. A skill has at most one quest per week, so the
    -- bonus entry inside that week is unambiguous.
    if q.completed_at is not null then
      delete from public.log_entries
       where user_id = v_user
         and skill_id = e.skill_id
         and source = 'quest'
         and created_at >= (v_week::timestamp at time zone 'Europe/Amsterdam')
         and created_at <  ((v_week + 7)::timestamp at time zone 'Europe/Amsterdam');

      update public.quests
         set completed_at = null,
             progress = greatest(progress - 1, 0)
       where id = q.id;
    else
      update public.quests
         set progress = greatest(progress - 1, 0)
       where id = q.id;
    end if;
  end if;

  -- An accepted suggestion goes back to waiting, so it can be judged again.
  update public.inbox_items
     set status = 'pending'
   where id = p_entry and user_id = v_user and status = 'accepted';

  delete from public.log_entries where id = p_entry and user_id = v_user;

  -- Rebuild from what is left, floors included: the completion is gone, so
  -- anything it bought is gone with it.
  perform public.recalculate_levels(v_user, true);

  -- last_active_at follows the remaining ledger, or clears if nothing is left.
  update public.skills s
     set last_active_at = (
       select max(l.created_at)
         from public.log_entries l
        where l.skill_id = s.id and l.user_id = v_user and l.source <> 'rust'
     )
   where s.user_id = v_user and s.id = e.skill_id;
end;
$$;
