import { CAPACITY_FACTOR } from './quests';
import { GRACE_DAYS } from './rust';
import type { Capacity } from './types';

/**
 * The three week settings, as the screens name them.
 *
 * One list, because there were two: Beheer called `rustig` "lagere
 * opdrachten" and the Sunday report called it "kleinere opdrachten" — the
 * same setting, two wordings — and the report used that second wording for
 * `gek` as well, though one is half a quest and the other three quarters.
 *
 * The hints say what the setting does. "Lagere" and "kleinere" are gestures at
 * a number; the numbers are right here, in CAPACITY_FACTOR and GRACE_DAYS.
 */
export interface CapacityOption {
  value: Capacity;
  label: string;
  hint: string;
}

export const CAPACITIES: readonly CapacityOption[] = [
  { value: 'rustig', label: 'Rustig', hint: 'de helft van de opdracht, veertien dagen voor roest' },
  { value: 'normaal', label: 'Normaal', hint: 'hele opdrachten, tien dagen voor roest' },
  { value: 'gek', label: 'Gek', hint: 'driekwart opdracht, eenentwintig dagen voor roest' },
];

/** The share of a full quest a setting asks for, as a fraction of one. */
export function capacityShare(value: Capacity): number {
  return CAPACITY_FACTOR[value];
}

/** Days of grace before a skill starts rusting under this setting. */
export function capacityGrace(value: Capacity): number {
  return GRACE_DAYS[value];
}
