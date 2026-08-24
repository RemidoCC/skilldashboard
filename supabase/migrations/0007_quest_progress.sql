-- Completing something should move the week's quest for that skill, and a
-- finished quest should pay its bonus.
--
-- Both belong inside log_completion rather than in the route handler: the
-- function already knows whether the ledger entry was actually inserted, so a
-- replayed offline mutation advances the quest exactly once. Doing it outside
-- would either double-count on replay or need a second round trip to find out.

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
  v_user  uuid := (select auth.uid());
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

  s := public.apply_xp(p_skill, p_xp);

  -- Rust is the system acting, not the user, so it never counts towards a
  -- quest and never refreshes last_active_at.
  if p_source <> 'rust' then
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

        s := public.apply_xp(p_skill, q.bonus_xp);
      end if;
    end if;
  end if;

  return s;
end;
$$;
