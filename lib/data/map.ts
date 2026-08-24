import type { LogEntry, Skill, SkillGlyph, Task, TaskKind, LogSource, Capacity } from '@/lib/domain/types';
import type { Tables } from '@/lib/db/database.types';

/**
 * Database rows arrive with text columns where the domain wants unions. The
 * check constraints already guarantee the values, so these narrow with a
 * documented fallback rather than throwing on a row the app must still show.
 */

const GLYPHS: readonly SkillGlyph[] = [
  'square', 'diamond', 'ring', 'wave', 'triangle', 'cross', 'hexagon', 'bars',
];

export function toGlyph(value: string): SkillGlyph {
  return (GLYPHS as readonly string[]).includes(value) ? (value as SkillGlyph) : 'square';
}

export function toKind(value: string): TaskKind {
  return value === 'timer' ? 'timer' : 'check';
}

export function toSource(value: string): LogSource {
  const known: readonly string[] = ['manual', 'timer', 'quick', 'calendar', 'mail', 'quest'];
  return known.includes(value) ? (value as LogSource) : 'manual';
}

export function toCapacity(value: string | null | undefined): Capacity {
  return value === 'rustig' || value === 'gek' ? value : 'normaal';
}

export function toSkill(row: Tables<'skills'>): Skill {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    color: row.color,
    glyph: toGlyph(row.glyph),
    level: row.level,
    xp: row.xp,
    floorLevel: row.floor_level,
    lastActiveAt: row.last_active_at,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export function toTask(row: Tables<'tasks'>): Task {
  return {
    id: row.id,
    skillId: row.skill_id,
    title: row.title,
    kind: toKind(row.kind),
    value: row.value,
    onToday: row.on_today,
    archived: row.archived,
  };
}

export function toLogEntry(row: Tables<'log_entries'>): LogEntry {
  return {
    id: row.id,
    skillId: row.skill_id,
    taskId: row.task_id,
    title: row.title,
    xp: row.xp,
    minutes: row.minutes,
    note: row.note,
    source: toSource(row.source),
    createdAt: row.created_at,
  };
}
