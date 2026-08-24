export type SkillGlyph =
  | 'square'
  | 'diamond'
  | 'ring'
  | 'wave'
  | 'triangle'
  | 'cross'
  | 'hexagon'
  | 'bars';

export type TaskKind = 'check' | 'timer';

export type LogSource = 'manual' | 'timer' | 'quick' | 'calendar' | 'mail' | 'quest';

export type Capacity = 'rustig' | 'normaal' | 'gek';

export interface Skill {
  id: string;
  name: string;
  subtitle: string | null;
  color: string;
  glyph: SkillGlyph;
  level: number;
  xp: number;
  floorLevel: number;
  lastActiveAt: string | null;
  active: boolean;
  sortOrder: number;
}

export interface Task {
  id: string;
  skillId: string;
  title: string;
  kind: TaskKind;
  /** check: XP per completion. timer: XP per 10 minutes. */
  value: number;
  onToday: boolean;
  archived: boolean;
}

export interface LogEntry {
  id: string;
  skillId: string;
  taskId: string | null;
  title: string;
  xp: number;
  minutes: number | null;
  note: string | null;
  source: LogSource;
  createdAt: string;
}

/** The three numbers that define where a skill stands. */
export interface Progress {
  level: number;
  xp: number;
  floorLevel: number;
}
