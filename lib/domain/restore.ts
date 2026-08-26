/**
 * Reading an export back in.
 *
 * The export calls itself a backup, which is only true if there is a way back.
 * This is the half that can be reasoned about on its own: it takes whatever
 * was in the file and either produces rows that are safe to write, or says
 * exactly what is wrong with it.
 *
 * Two rules hold the whole thing up:
 *
 *  - Columns are an allowlist. Anything the file carries that is not named
 *    here is dropped rather than passed on, so an old export with a since
 *    removed column still restores and a doctored one cannot smuggle a field.
 *  - `user_id` is not in any allowlist. The route sets it from the session, so
 *    a file claiming to belong to someone else restores into your own account
 *    or not at all. RLS enforces the same thing a second time.
 */

/** What a fresh export writes. */
export const SCHEMA_VERSION = 'skill-unit/2';

/**
 * What this reader accepts.
 *
 * v1 had no mapping rules or inbox items; a v1 file restores with those tables
 * empty, which is what it actually held.
 */
export const READABLE_SCHEMAS: readonly string[] = ['skill-unit/1', SCHEMA_VERSION];

/** A whole account, so the ceiling is about refusing nonsense, not about size. */
export const MAX_ROWS = 200_000;

type ColumnType = 'uuid' | 'text' | 'int' | 'bool' | 'date' | 'ts' | 'json';

interface ColumnSpec {
  type: ColumnType;
  /** Null is allowed, and a missing key reads as null. */
  nullable?: boolean;
  /** The database has a check constraint; catching it here gives a readable message. */
  oneOf?: readonly string[];
  /** Inclusive bounds the database also enforces, for the same reason. */
  min?: number;
  max?: number;
}

export interface TableSpec {
  /** The key in the export file. */
  key: string;
  table: string;
  /** Column name to how it is checked. `user_id` is deliberately absent. */
  columns: Record<string, ColumnSpec>;
  /** Columns that point at a skill in the same file. */
  skillRefs?: readonly string[];
  /** Columns that point at a task in the same file. */
  taskRefs?: readonly string[];
  /** False for the one table keyed by something other than id. */
  hasId?: boolean;
  /**
   * A constraint that spans two columns, so it cannot live on either. Returns
   * the sentence to refuse with, or null when the row is fine.
   */
  rowCheck?: (row: Record<string, JsonValue>) => string | null;
  /** Column the export sorts on, so two exports of the same account match. */
  orderBy: string;
}

const uuid = { type: 'uuid' } as const;
const text = { type: 'text' } as const;
const int = { type: 'int' } as const;
const bool = { type: 'bool' } as const;
const ts = { type: 'ts' } as const;

/**
 * Parents first. Rows are inserted in this order and deleted in reverse, which
 * is the only ordering that satisfies the foreign keys in both directions.
 */
export const TABLES: readonly TableSpec[] = [
  {
    key: 'skills',
    table: 'skills',
    orderBy: 'sort_order',
    columns: {
      id: uuid,
      name: text,
      subtitle: { type: 'text', nullable: true },
      color: text,
      glyph: text,
      level: { type: 'int', min: 1 },
      xp: { type: 'int', min: 0 },
      floor_level: { type: 'int', min: 0 },
      last_active_at: { type: 'ts', nullable: true },
      active: bool,
      sort_order: int,
      created_at: ts,
    },
  },
  {
    key: 'tasks',
    table: 'tasks',
    orderBy: 'created_at',
    columns: {
      id: uuid,
      skill_id: uuid,
      title: text,
      kind: { type: 'text', oneOf: ['check', 'timer'] },
      value: { type: 'int', min: 5, max: 150 },
      on_today: bool,
      archived: bool,
      created_at: ts,
    },
    skillRefs: ['skill_id'],
  },
  {
    key: 'logEntries',
    table: 'log_entries',
    orderBy: 'created_at',
    columns: {
      id: uuid,
      skill_id: uuid,
      task_id: { type: 'uuid', nullable: true },
      title: text,
      xp: int,
      minutes: { type: 'int', nullable: true },
      note: { type: 'text', nullable: true },
      source: {
        type: 'text',
        oneOf: ['manual', 'timer', 'quick', 'calendar', 'mail', 'quest', 'rust'],
      },
      created_at: ts,
    },
    skillRefs: ['skill_id'],
    taskRefs: ['task_id'],
  },
  {
    key: 'goals',
    table: 'goals',
    orderBy: 'created_at',
    columns: {
      id: uuid,
      skill_id: uuid,
      title: text,
      target_date: { type: 'date', nullable: true },
      progress: { type: 'int', min: 0 },
      done: bool,
      created_at: ts,
    },
    skillRefs: ['skill_id'],
  },
  {
    key: 'quests',
    table: 'quests',
    orderBy: 'week_start',
    columns: {
      id: uuid,
      skill_id: uuid,
      title: text,
      target: { type: 'int', min: 1 },
      progress: { type: 'int', min: 0 },
      bonus_xp: { type: 'int', min: 0 },
      week_start: { type: 'date' },
      completed_at: { type: 'ts', nullable: true },
    },
    skillRefs: ['skill_id'],
  },
  {
    key: 'seasons',
    table: 'seasons',
    orderBy: 'starts_on',
    columns: {
      id: uuid,
      name: text,
      starts_on: { type: 'date' },
      ends_on: { type: 'date' },
      badge_slug: text,
      summary: { type: 'json', nullable: true },
    },
    rowCheck: (row) =>
      typeof row.starts_on === 'string' &&
      typeof row.ends_on === 'string' &&
      row.ends_on <= row.starts_on
        ? `het seizoen eindigt op ${row.ends_on}, en dat is niet na ${row.starts_on}.`
        : null,
  },
  {
    key: 'weekSettings',
    table: 'week_settings',
    orderBy: 'week_start',
    columns: {
      week_start: { type: 'date' },
      capacity: { type: 'text', oneOf: ['rustig', 'normaal', 'gek'] },
    },
    hasId: false,
  },
  {
    key: 'streakFreezes',
    table: 'streak_freezes',
    orderBy: 'earned_week',
    columns: {
      id: uuid,
      earned_week: { type: 'date' },
      spent_on: { type: 'date', nullable: true },
      created_at: ts,
    },
  },
  {
    key: 'mappingRules',
    table: 'mapping_rules',
    orderBy: 'pattern',
    columns: {
      id: uuid,
      source: { type: 'text', oneOf: ['calendar', 'mail'] },
      pattern: text,
      skill_id: uuid,
      xp: int,
    },
    skillRefs: ['skill_id'],
  },
  {
    key: 'inboxItems',
    table: 'inbox_items',
    orderBy: 'occurred_at',
    columns: {
      id: uuid,
      source: { type: 'text', oneOf: ['calendar', 'mail'] },
      external_id: text,
      title: text,
      suggested_skill_id: { type: 'uuid', nullable: true },
      suggested_xp: int,
      occurred_at: ts,
      status: { type: 'text', oneOf: ['pending', 'accepted', 'dismissed'] },
    },
    skillRefs: ['suggested_skill_id'],
  },
];

/**
 * Anything that survives JSON.parse.
 *
 * Declared here rather than imported from the generated database types, so the
 * domain layer keeps its one useful property: it depends on nothing.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

export interface RestoreTable {
  table: string;
  rows: Record<string, JsonValue>[];
}

export type RestoreCheck =
  | { ok: true; schema: string; tables: RestoreTable[]; total: number }
  | { ok: false; error: string };

/* ------------------------------------------------------------- checking -- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Long enough for a note, short enough that a file cannot be used as storage. */
const MAX_TEXT = 4000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A coerced value or a sentence about it.
 *
 * Tagged rather than returning "the value, unless it is a string, in which case
 * it is the error" — a text column can hold anything, so the two would be
 * indistinguishable exactly where it matters most.
 */
type ColumnCheck = { ok: true; value: JsonValue } | { ok: false; error: string };

const good = (value: JsonValue): ColumnCheck => ({ ok: true, value });
const wrong = (error: string): ColumnCheck => ({ ok: false, error });

function checkColumn(spec: ColumnSpec, raw: unknown, where: string): ColumnCheck {
  if (raw === null || raw === undefined) {
    return spec.nullable ? good(null) : wrong(`${where} ontbreekt.`);
  }

  switch (spec.type) {
    case 'uuid':
      if (typeof raw !== 'string' || !UUID.test(raw)) return wrong(`${where} is geen geldige id.`);
      return good(raw.toLowerCase());

    case 'text': {
      if (typeof raw !== 'string') return wrong(`${where} moet tekst zijn.`);
      if (raw.length > MAX_TEXT) return wrong(`${where} is langer dan ${MAX_TEXT} tekens.`);
      if (spec.oneOf && !spec.oneOf.includes(raw)) {
        return wrong(`${where} is "${raw}", en dat kent het systeem niet.`);
      }
      return good(raw);
    }

    case 'int': {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        return wrong(`${where} moet een geheel getal zijn.`);
      }
      if (!Number.isSafeInteger(raw)) return wrong(`${where} is te groot.`);
      // The database has check constraints on several of these. Catching them
      // here is the difference between naming the table and the row and
      // handing the reader `violates check constraint "tasks_value_check"`.
      if (spec.min !== undefined && spec.max !== undefined && (raw < spec.min || raw > spec.max)) {
        return wrong(`${where} moet tussen ${spec.min} en ${spec.max} liggen, en is ${raw}.`);
      }
      if (spec.min !== undefined && raw < spec.min) {
        return wrong(`${where} mag niet lager zijn dan ${spec.min}, en is ${raw}.`);
      }
      if (spec.max !== undefined && raw > spec.max) {
        return wrong(`${where} mag niet hoger zijn dan ${spec.max}, en is ${raw}.`);
      }
      return good(raw);
    }

    case 'bool':
      if (typeof raw !== 'boolean') return wrong(`${where} moet waar of onwaar zijn.`);
      return good(raw);

    case 'date':
      if (typeof raw !== 'string' || !DATE.test(raw)) return wrong(`${where} moet een datum zijn.`);
      return good(raw);

    case 'ts':
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
        return wrong(`${where} moet een tijdstip zijn.`);
      }
      return good(raw);

    case 'json':
      // It came out of JSON.parse, so it is JSON by construction and fits a
      // jsonb column whatever shape it has.
      return good(raw as JsonValue);
  }
}

/**
 * Turns a parsed export into rows ready to write, or explains the refusal.
 *
 * Every message names the table and the row, because the one time this runs is
 * the one time being told "ongeldig bestand" is no help at all.
 */
export function checkRestore(payload: unknown): RestoreCheck {
  if (!isObject(payload)) return { ok: false, error: 'Het bestand bevat geen JSON-object.' };

  const schema = payload.schema;
  if (typeof schema !== 'string') {
    return { ok: false, error: 'Het bestand zegt niet welke versie het is. Dit is geen export.' };
  }
  if (!READABLE_SCHEMAS.includes(schema)) {
    return {
      ok: false,
      error: `Dit bestand is versie "${schema}". Deze versie leest ${READABLE_SCHEMAS.join(' en ')}.`,
    };
  }

  const tables: RestoreTable[] = [];
  const skillIds = new Set<string>();
  const taskIds = new Set<string>();
  let total = 0;

  for (const spec of TABLES) {
    const raw = payload[spec.key];
    if (raw === undefined || raw === null) {
      tables.push({ table: spec.table, rows: [] });
      continue;
    }
    if (!Array.isArray(raw)) return { ok: false, error: `${spec.key} is geen lijst.` };

    total += raw.length;
    if (total > MAX_ROWS) {
      return { ok: false, error: `Het bestand bevat meer dan ${MAX_ROWS} rijen.` };
    }

    const rows: Record<string, JsonValue>[] = [];
    const seen = new Set<string>();

    for (const [index, item] of raw.entries()) {
      const at = `${spec.key}, rij ${index + 1}`;
      if (!isObject(item)) return { ok: false, error: `${at} is geen object.` };

      const row: Record<string, JsonValue> = {};
      for (const [column, columnSpec] of Object.entries(spec.columns)) {
        const checked = checkColumn(columnSpec, item[column], `${at}: ${column}`);
        if (!checked.ok) return { ok: false, error: checked.error };
        row[column] = checked.value;
      }

      const rowProblem = spec.rowCheck?.(row);
      if (rowProblem) return { ok: false, error: `${at}: ${rowProblem}` };

      if (spec.hasId !== false) {
        const id = String(row.id);
        if (seen.has(id)) return { ok: false, error: `${at}: deze id komt twee keer voor.` };
        seen.add(id);
      }

      rows.push(row);
    }

    if (spec.table === 'skills') for (const row of rows) skillIds.add(String(row.id));
    if (spec.table === 'tasks') for (const row of rows) taskIds.add(String(row.id));

    // Checked here rather than left to the foreign keys, so a hand-edited file
    // is refused with a sentence instead of a constraint name.
    for (const [index, row] of rows.entries()) {
      for (const column of spec.skillRefs ?? []) {
        const value = row[column];
        if (typeof value === 'string' && !skillIds.has(value)) {
          return {
            ok: false,
            error: `${spec.key}, rij ${index + 1}: verwijst naar een vaardigheid die niet in het bestand staat.`,
          };
        }
      }
      for (const column of spec.taskRefs ?? []) {
        const value = row[column];
        if (typeof value === 'string' && !taskIds.has(value)) {
          return {
            ok: false,
            error: `${spec.key}, rij ${index + 1}: verwijst naar een taak die niet in het bestand staat.`,
          };
        }
      }
    }

    tables.push({ table: spec.table, rows });
  }

  if (total === 0) {
    return { ok: false, error: 'Het bestand is leeg. Er valt niets terug te zetten.' };
  }

  return { ok: true, schema, tables, total };
}

/** Singular and plural, because "1 vaardigheden" reads like a bug. */
const NAMES: Record<string, [string, string]> = {
  skills: ['vaardigheid', 'vaardigheden'],
  tasks: ['taak', 'taken'],
  log_entries: ['logregel', 'logregels'],
  goals: ['doel', 'doelen'],
  quests: ['opdracht', 'opdrachten'],
  seasons: ['seizoen', 'seizoenen'],
  week_settings: ['weekstand', 'weekstanden'],
  streak_freezes: ['freeze', 'freezes'],
  mapping_rules: ['koppelregel', 'koppelregels'],
  inbox_items: ['voorstel', 'voorstellen'],
};

/** One line per table, for the confirmation: you see what you are about to get. */
export function restoreCounts(check: Extract<RestoreCheck, { ok: true }>): [string, number][] {
  return check.tables
    .filter((t) => t.rows.length > 0)
    .map((t) => {
      const name = NAMES[t.table] ?? [t.table, t.table];
      return [t.rows.length === 1 ? name[0] : name[1], t.rows.length];
    });
}
