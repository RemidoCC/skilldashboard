-- Putting an export back.
--
-- The export has always called itself a backup, which is only half true while
-- there is no way to read it back in. This is the other half.
--
-- It happens inside one function for one reason: a restore replaces the whole
-- account, and a restore that fails halfway would leave neither the old state
-- nor the new one. A function is a transaction, so it either all lands or none
-- of it does.
--
-- The payload arrives already checked and stripped by lib/domain/restore.ts,
-- keyed by table name, with only columns that exist. Nothing here trusts that:
-- jsonb_populate_recordset ignores keys that are not columns, every row gets
-- its user_id from auth.uid() rather than from the file, and RLS checks the
-- same thing again on the way in.

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
  -- Parents first. Deleted in reverse, inserted in this order; no other
  -- ordering satisfies the foreign keys in both directions.
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

  -- Nothing is put back before everything is gone: a restore is a replacement,
  -- not a merge, and a merge is how you end up with two of every skill.
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

  -- The ledger decides the levels, exactly as it does everywhere else, so a
  -- file with hand-edited levels still restores to what its history supports.
  -- Floors are left alone: a floor once earned is not given back, and the
  -- restored value is already the higher of the two.
  perform public.recalculate_levels(v_user, false);
end;
$$;

comment on function public.restore_account(jsonb) is
  'Replaces the caller''s whole account from an export payload keyed by table name. One transaction. user_id always comes from auth.uid().';
