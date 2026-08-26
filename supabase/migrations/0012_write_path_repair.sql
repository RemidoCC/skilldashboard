-- Repairs the write path, which did not work at all for the role the browser
-- actually uses. Four changes, all of them about who may call what.
--
-- 1. apply_xp moves to a schema PostgREST does not serve.
--
--    0005 took EXECUTE on public.apply_xp away from anon and authenticated so
--    that clients could not move a level without writing a ledger entry. The
--    intent was right and the mechanism was wrong: log_completion is
--    `security invoker`, so it runs its inner apply_xp call as the caller, and
--    the caller is `authenticated`. Every completion therefore failed with
--    `permission denied for function apply_xp` and nothing reached the ledger.
--
--    Putting the function in `internal` gets the same result honestly. Only
--    schemas PostgREST is configured to expose are reachable over the API, so
--    apply_xp is off the REST surface entirely, while log_completion can still
--    call it and stays `security invoker` — which is what keeps RLS deciding
--    every row it touches.
--
-- 2. log_completion learns who it is writing for when nobody is signed in.
--
--    A cron run holds the service role, which carries no `sub` claim, so
--    auth.uid() is null and the function refused with 'Niet ingelogd.'. The
--    rust job went through this call, so decay never happened. p_user fills
--    that gap and is only consulted when auth.uid() is null — a signed-in
--    caller can never aim a write at somebody else, and RLS would refuse it a
--    second time if they tried.
--
-- 3. recalculate_levels can be pointed at one skill.
--
--    revert_completion rebuilds floors, and it rebuilt them for every skill in
--    the account rather than for the one whose entry was removed.
--
-- 4. restore_account rebuilds floors from the ledger like everything else.
--
--    Levels and XP were already rebuilt, but floor_level was taken from the
--    file. A hand-edited export could therefore grant a floor no history
--    supported, and since rustXpDelta returns 0 at or below a floor, that
--    switched decay off permanently for the skill. The ledger decides here too.

-- ------------------------------------------------------------------ 1 -------

create schema if not exists internal;

-- Nothing here is for the client to call directly; the grants below name the
-- one function that is reachable, and only through log_completion.
revoke all on schema internal from public;
grant usage on schema internal to authenticated, service_role;

create or replace function internal.apply_xp(p_skill uuid, p_gain int)
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

comment on function internal.apply_xp(uuid, int) is
  'Advances one skill by a gain. Internal step of public.log_completion; not on the REST surface.';

revoke execute on function internal.apply_xp(uuid, int) from public;
grant execute on function internal.apply_xp(uuid, int) to authenticated, service_role;

drop function if exists public.apply_xp(uuid, int);

-- ------------------------------------------------------------------ 3 -------

drop function if exists public.recalculate_levels(uuid, boolean);

create or replace function public.recalculate_levels(
  p_user           uuid,
  p_rebuild_floors boolean default false,
  p_skill          uuid default null
)
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
    select id from public.skills
     where user_id = p_user
       and (p_skill is null or id = p_skill)
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

comment on function public.recalculate_levels(uuid, boolean, uuid) is
  'Rebuilds derived level/xp from log_entries. p_rebuild_floors also rebuilds floor_level; p_skill limits it to one skill.';

-- ------------------------------------------------------------------ 2 -------

drop function if exists public.log_completion(
  uuid, uuid, uuid, text, int, int, text, text, timestamptz);

create or replace function public.log_completion(
  p_id         uuid,
  p_skill      uuid,
  p_task       uuid,
  p_title      text,
  p_xp         int,
  p_minutes    int,
  p_note       text,
  p_source     text,
  p_created_at timestamptz,
  -- Only consulted when there is no session at all, which in practice means a
  -- scheduled job holding the service role. A signed-in caller always writes
  -- as themselves.
  p_user       uuid default null
)
returns public.skills
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := coalesce((select auth.uid()), p_user);
  v_rows  int;
  s       public.skills;
  v_at    timestamptz := coalesce(p_created_at, now());
  v_week  date;
  q       public.quests;
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

  s := internal.apply_xp(p_skill, p_xp);

  -- Rust is the system acting, not the user, so it never counts towards a
  -- quest and never refreshes last_active_at.
  if p_source is distinct from 'rust' then
    update public.skills
       set last_active_at = greatest(coalesce(last_active_at, v_at), v_at)
     where id = p_skill
    returning * into s;

    -- The week the work happened in, not the week it was uploaded in.
    v_week := date_trunc('week', v_at at time zone 'Europe/Amsterdam')::date;

    update public.quests
       set progress = progress + 1
     where user_id = v_user
       and skill_id = p_skill
       and week_start = v_week
       and completed_at is null
    returning * into q;

    -- Finishing a quest pays its bonus into the same skill.
    if found and q.progress >= q.target then
      update public.quests set completed_at = now() where id = q.id;

      if q.bonus_xp > 0 then
        insert into public.log_entries
          (user_id, skill_id, task_id, title, xp, minutes, note, source, created_at)
        values
          (v_user, p_skill, null, 'Opdracht af: ' || q.title,
           q.bonus_xp, null, null, 'quest', now());

        s := internal.apply_xp(p_skill, q.bonus_xp);
      end if;
    end if;
  end if;

  return s;
end;
$$;

comment on function public.log_completion(uuid, uuid, uuid, text, int, int, text, text, timestamptz, uuid) is
  'Writes one ledger entry and advances the skill in one call. Idempotent on p_id.';

-- ------------------------------------------------------------------ 4 -------

create or replace function public.restore_account(p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_table text;
  v_rows  jsonb;
  v_order text[] := array[
    'skills', 'tasks', 'log_entries', 'goals', 'quests',
    'seasons', 'week_settings', 'streak_freezes', 'mapping_rules', 'inbox_items'
  ];
begin
  if v_user is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Er kwam geen object binnen om terug te zetten.' using errcode = '22023';
  end if;

  for i in reverse array_length(v_order, 1) .. 1 loop
    execute format('delete from public.%I where user_id = $1', v_order[i]) using v_user;
  end loop;

  foreach v_table in array v_order loop
    v_rows := coalesce(
      (select jsonb_agg(e || jsonb_build_object('user_id', v_user))
         from jsonb_array_elements(coalesce(p_payload -> v_table, '[]'::jsonb)) e
        where jsonb_typeof(e) = 'object'),
      '[]'::jsonb
    );

    if jsonb_array_length(v_rows) > 0 then
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        v_table, v_table
      ) using v_rows;
    end if;
  end loop;

  -- The ledger decides, floors included. Level and XP were already rebuilt
  -- here; floor_level was not, so a file could claim a floor its history never
  -- earned — and a floor is what switches rust off, which made it the one
  -- field worth forging. It is derived state like the rest.
  perform public.recalculate_levels(v_user, true);
end;
$$;

comment on function public.restore_account(jsonb) is
  'Replaces the caller''s whole account from an export payload keyed by table name. One transaction. user_id and every derived level come from here, never from the file.';

-- ------------------------------------------------------------------ 3b ------
-- revert_completion rebuilds floors, which is right: a floor bought by a
-- mis-tap was never earned. It did so for every skill in the account, so
-- reverting an entry on one skill could quietly drop a floor on another.
-- Only the skill whose entry disappeared can have changed.

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

  -- Rebuild from what is left, floors included, for this skill only.
  perform public.recalculate_levels(v_user, true, e.skill_id);

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
