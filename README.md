# Skill Unit

A private dashboard that turns real effort into XP. Single user, no signup, no
social features. The governing idea is that this is a **measuring instrument**:
it reports, it does not flatter.

Phase 1 of 5 is complete — see [Status](#status).

## Stack

- Next.js 15 (App Router, React 19, TypeScript strict)
- Tailwind CSS v4, with the design tokens as CSS variables in `app/globals.css`
- Supabase — Postgres, magic-link auth, RLS scoped to `auth.uid()`
- Vitest, including suites that run against a real Postgres

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Full suite. SQL suites skip unless `TEST_DATABASE_URL` is set |
| `npm run db:setup` | Provisions a local Postgres, applies the migrations, prints the URL |
| `npm run db:types` | Regenerates `lib/db/database.types.ts` |

To include the SQL parity suites:

```bash
export TEST_DATABASE_URL="$(npm run --silent db:setup | tail -1)"
npm test
```

## Layout

```
app/                    routes; /vandaag is the home screen
  dev/                  visual preview against fixtures, 404s in production
components/instrument/  the dot matrix, the meters, the display, the self-test
components/vandaag/     task rows, timer, quick log
lib/domain/             the rules — pure, dependency-free, fully tested
lib/data/               row mapping and the Vandaag loader
lib/actions/            server actions that write completions
supabase/migrations/    schema, RLS, and the level functions
supabase/tests/         harness that stands in for Supabase locally
```

`lib/domain` holds every rule that decides XP, levels, streaks, rust and
balance. It imports nothing from Next or Supabase, so it can be tested on its
own — which matters, because a bug there silently corrupts months of history.

## The rules

**Level curve.** `xp_needed(level) = round(100 * level^1.6)`. XP carries over on
level-up and a single completion can cascade several levels.

**Floors.** `floor_level` is claimed each time a skill crosses a multiple of 5,
and floors are permanent. Rust can never take a skill below one.

**Two implementations, one answer.** The curve exists in TypeScript
(`lib/domain/curve.ts`) and in SQL (`public.xp_needed`,
`public.recalculate_levels`). Both round half away from zero, and
`tests/sql-parity.test.ts` holds them to identical results on a real Postgres
for every level up to 120. `log_entries` is the ledger; level and XP are
derived state that a rebuild can always reconstruct from it.

**Writes are atomic and replayable.** `public.log_completion` inserts the ledger
entry and advances the skill in one call. The client supplies the entry id, so
a mutation replayed after a reconnect lands exactly once — which is what the
offline queue in phase 2 will depend on.

## Design

The full system lives in `app/globals.css`. Flat surfaces, hard 2px offset
shadows rather than blurs, radii between 6 and 10px, IBM Plex Mono throughout,
tabular numerals everywhere, no gradients and no emoji.

The signature element is the dot-matrix display: a real 5×7 bitmap per digit
(`components/instrument/font5x7.ts`) drawn as circles, with unlit dots left
faintly visible so the grid reads as hardware. Skill meters are 240° analogue
gauges with every fifth tick lengthened; a rusting skill turns its lit ticks to
the signal colour.

Screenshots of both palettes are in `docs/screenshots/`.

### One deliberate deviation

The brief specifies `--muted: #7A7973` and `--screen-muted: #6E7178`, and
separately requires WCAG AA in both palettes. Those cannot both hold: labels run
at 9–10px, so they are normal text needing 4.5:1, and the given values reach
only 3.40:1 on `--panel` and 2.94:1 on `--recess`. The muted tones here are the
nearest values that pass on every surface they are used on, and `--signal-text`
/ `--signal-fill` exist because `--signal` at 2.62:1 cannot carry a warning
sentence or a button label. `--signal` itself is unchanged and still does all
the non-text work. `tests/contrast.test.ts` reads the real tokens out of the
stylesheet and enforces this, so it cannot drift.

## Status

- [x] **Phase 1 — Foundation.** Schema, RLS, auth, design tokens, Vandaag with
      check-off, timers, quick log, the dot matrix and the meters.
- [ ] Phase 2 — PWA and offline writes
- [ ] Phase 3 — Beheer and Historie
- [ ] Phase 4 — Quests, capacity, rust, freezes, Sunday report, seasons
- [ ] Phase 5 — Google Calendar and Gmail

### Open questions for phase 4

- **Where rust is recorded.** `log_entries.source` is constrained to
  `manual | timer | quick | calendar | mail | quest`, so a decay event has
  nowhere to live in the ledger. `recalculate_levels` therefore rebuilds the
  *earned* progression. Before rust ships, decay needs either a `rust` source, a
  column on `skills`, or its own table.
- **Where streak freezes are stored.** The schema has no home for the freeze
  count, and the streak is currently derived from `log_entries` alone.
