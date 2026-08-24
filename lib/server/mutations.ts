import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isUuid } from './completions';
import { GLYPH_NAMES } from '@/lib/domain/glyphs';
import type { TablesUpdate } from '@/lib/db/database.types';
import type { Capacity, SkillGlyph, TaskKind } from '@/lib/domain/types';
import type { Mutation } from '@/lib/offline/mutations';

export interface MutationResult {
  ok: true;
}
export interface MutationFailure {
  ok: false;
  error: string;
  /** A network or server problem, so the queue keeps it. */
  retryable: boolean;
}
export type MutationOutcome = MutationResult | MutationFailure;

const bad = (error: string): MutationFailure => ({ ok: false, error, retryable: false });
const wobble = (error: string): MutationFailure => ({ ok: false, error, retryable: true });

/* ------------------------------------------------------------ validation -- */

const HEX = /^#[0-9a-f]{6}$/i;

function title(value: unknown, field: string): string | MutationFailure {
  if (typeof value !== 'string') return bad(`${field} ontbreekt.`);
  const trimmed = value.trim();
  if (trimmed === '') return bad(`${field} mag niet leeg zijn.`);
  return trimmed.slice(0, 120);
}

/** The slider runs 5 to 150 in steps of 5, and the server holds it to that. */
function value(raw: unknown): number | MutationFailure {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return bad('Waarde moet een geheel getal zijn.');
  if (raw < 5 || raw > 150) return bad('Waarde moet tussen 5 en 150 liggen.');
  if (raw % 5 !== 0) return bad('Waarde gaat met stappen van 5.');
  return raw;
}

function taskKind(raw: unknown): TaskKind | MutationFailure {
  if (raw !== 'check' && raw !== 'timer') return bad('Onbekend soort taak.');
  return raw;
}

function glyph(raw: unknown): SkillGlyph | MutationFailure {
  if (typeof raw !== 'string' || !(GLYPH_NAMES as readonly string[]).includes(raw)) {
    return bad('Onbekend teken.');
  }
  return raw as SkillGlyph;
}

function color(raw: unknown): string | MutationFailure {
  if (typeof raw !== 'string' || !HEX.test(raw)) return bad('Kleur moet een hexcode zijn.');
  return raw.toUpperCase();
}

function capacity(raw: unknown): Capacity | MutationFailure {
  if (raw !== 'rustig' && raw !== 'normaal' && raw !== 'gek') return bad('Onbekende weekstand.');
  return raw;
}

function isFailure(v: unknown): v is MutationFailure {
  return typeof v === 'object' && v !== null && 'ok' in v && (v as { ok: unknown }).ok === false;
}

/* ---------------------------------------------------------------- apply -- */

export async function applyMutation(mutation: Mutation): Promise<MutationOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad('Je sessie is verlopen. Log opnieuw in.');

  switch (mutation.kind) {
    case 'task.create': {
      if (!isUuid(mutation.id) || !isUuid(mutation.task.skillId)) return bad('Ongeldige verwijzing.');
      const name = title(mutation.task.title, 'Titel');
      if (isFailure(name)) return name;
      const points = value(mutation.task.value);
      if (isFailure(points)) return points;
      const kind = taskKind(mutation.task.taskKind);
      if (isFailure(kind)) return kind;

      // Replaying a create must land once, so conflicts on the id are ignored.
      const { error } = await supabase.from('tasks').upsert(
        {
          id: mutation.id,
          user_id: user.id,
          skill_id: mutation.task.skillId,
          title: name,
          kind,
          value: points,
          on_today: Boolean(mutation.task.onToday),
          archived: false,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      return error ? wobble(`Taak opslaan mislukte: ${error.message}`) : { ok: true };
    }

    case 'task.update': {
      if (!isUuid(mutation.id)) return bad('Ongeldige taak.');
      const patch: TablesUpdate<'tasks'> = {};

      if (mutation.patch.title !== undefined) {
        const name = title(mutation.patch.title, 'Titel');
        if (isFailure(name)) return name;
        patch.title = name;
      }
      if (mutation.patch.value !== undefined) {
        const points = value(mutation.patch.value);
        if (isFailure(points)) return points;
        patch.value = points;
      }
      if (mutation.patch.taskKind !== undefined) {
        const kind = taskKind(mutation.patch.taskKind);
        if (isFailure(kind)) return kind;
        patch.kind = kind;
      }
      if (mutation.patch.skillId !== undefined) {
        if (!isUuid(mutation.patch.skillId)) return bad('Ongeldige vaardigheid.');
        patch.skill_id = mutation.patch.skillId;
      }
      if (mutation.patch.onToday !== undefined) patch.on_today = Boolean(mutation.patch.onToday);
      if (mutation.patch.archived !== undefined) patch.archived = Boolean(mutation.patch.archived);
      if (Object.keys(patch).length === 0) return { ok: true };

      const { error } = await supabase.from('tasks').update(patch).eq('id', mutation.id);
      return error ? wobble(`Taak bijwerken mislukte: ${error.message}`) : { ok: true };
    }

    case 'skill.create': {
      if (!isUuid(mutation.id)) return bad('Ongeldige vaardigheid.');
      const name = title(mutation.skill.name, 'Naam');
      if (isFailure(name)) return name;
      const mark = glyph(mutation.skill.glyph);
      if (isFailure(mark)) return mark;
      const tint = color(mutation.skill.color);
      if (isFailure(tint)) return tint;

      const { error } = await supabase.from('skills').upsert(
        {
          id: mutation.id,
          user_id: user.id,
          name,
          subtitle:
            typeof mutation.skill.subtitle === 'string' && mutation.skill.subtitle.trim() !== ''
              ? mutation.skill.subtitle.trim().slice(0, 80)
              : null,
          color: tint,
          glyph: mark,
          active: true,
          sort_order: Number.isInteger(mutation.skill.sortOrder) ? mutation.skill.sortOrder : 99,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      return error ? wobble(`Vaardigheid opslaan mislukte: ${error.message}`) : { ok: true };
    }

    case 'skill.update': {
      if (!isUuid(mutation.id)) return bad('Ongeldige vaardigheid.');
      const patch: TablesUpdate<'skills'> = {};

      if (mutation.patch.name !== undefined) {
        const name = title(mutation.patch.name, 'Naam');
        if (isFailure(name)) return name;
        patch.name = name;
      }
      if (mutation.patch.glyph !== undefined) {
        const mark = glyph(mutation.patch.glyph);
        if (isFailure(mark)) return mark;
        patch.glyph = mark;
      }
      if (mutation.patch.color !== undefined) {
        const tint = color(mutation.patch.color);
        if (isFailure(tint)) return tint;
        patch.color = tint;
      }
      if (mutation.patch.subtitle !== undefined) {
        patch.subtitle =
          typeof mutation.patch.subtitle === 'string' && mutation.patch.subtitle.trim() !== ''
            ? mutation.patch.subtitle.trim().slice(0, 80)
            : null;
      }
      if (mutation.patch.active !== undefined) patch.active = Boolean(mutation.patch.active);
      if (mutation.patch.sortOrder !== undefined && Number.isInteger(mutation.patch.sortOrder)) {
        patch.sort_order = mutation.patch.sortOrder;
      }
      if (Object.keys(patch).length === 0) return { ok: true };

      const { error } = await supabase.from('skills').update(patch).eq('id', mutation.id);
      return error ? wobble(`Vaardigheid bijwerken mislukte: ${error.message}`) : { ok: true };
    }

    case 'goal.create': {
      if (!isUuid(mutation.id) || !isUuid(mutation.goal.skillId)) return bad('Ongeldige verwijzing.');
      const name = title(mutation.goal.title, 'Titel');
      if (isFailure(name)) return name;

      const { error } = await supabase.from('goals').upsert(
        {
          id: mutation.id,
          user_id: user.id,
          skill_id: mutation.goal.skillId,
          title: name,
          target_date: mutation.goal.targetDate ?? null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      return error ? wobble(`Doel opslaan mislukte: ${error.message}`) : { ok: true };
    }

    case 'goal.update': {
      if (!isUuid(mutation.id)) return bad('Ongeldig doel.');
      const patch: TablesUpdate<'goals'> = {};

      if (mutation.patch.title !== undefined) {
        const name = title(mutation.patch.title, 'Titel');
        if (isFailure(name)) return name;
        patch.title = name;
      }
      if (mutation.patch.targetDate !== undefined) patch.target_date = mutation.patch.targetDate;
      if (mutation.patch.progress !== undefined) {
        const p = mutation.patch.progress;
        if (!Number.isInteger(p) || p < 0 || p > 100) return bad('Voortgang loopt van 0 tot 100.');
        patch.progress = p;
      }
      if (mutation.patch.done !== undefined) patch.done = Boolean(mutation.patch.done);
      if (Object.keys(patch).length === 0) return { ok: true };

      const { error } = await supabase.from('goals').update(patch).eq('id', mutation.id);
      return error ? wobble(`Doel bijwerken mislukte: ${error.message}`) : { ok: true };
    }

    case 'goal.delete': {
      if (!isUuid(mutation.id)) return bad('Ongeldig doel.');
      const { error } = await supabase.from('goals').delete().eq('id', mutation.id);
      return error ? wobble(`Doel verwijderen mislukte: ${error.message}`) : { ok: true };
    }

    case 'week.capacity': {
      const week = mutation.weekStart;
      if (typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return bad('Ongeldige week.');
      const stand = capacity(mutation.capacity);
      if (isFailure(stand)) return stand;

      const { error } = await supabase
        .from('week_settings')
        .upsert(
          { user_id: user.id, week_start: week, capacity: stand },
          { onConflict: 'user_id,week_start' },
        );
      return error ? wobble(`Weekstand opslaan mislukte: ${error.message}`) : { ok: true };
    }

    default:
      return bad('Onbekende wijziging.');
  }
}
