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
| `npm run build:verify` / `start:verify` | Production build on port 3100, in its own `.next-prod` so it does not tread on a running dev server |
| `npm run verify:offline` | Drives the app in a browser with the network cut |
| `npm run verify:pwa` | Checks the installability criteria one by one |
| `npm run screenshots` / `icons` | Regenerates `docs/screenshots/` and the app icons |

To include the SQL parity suites:

```bash
export TEST_DATABASE_URL="$(npm run --silent db:setup | tail -1)"
npm test
```

## Layout

```
app/                    routes; /vandaag is the home screen
  api/completions/      the single write endpoint
  dev/                  visual preview against fixtures, 404s in production
components/instrument/  the dot matrix, the meters, the display, the self-test
components/vandaag/     task rows, timer, quick log
components/offline/     the queue provider, sync bar, install prompt
lib/domain/             the rules — pure, dependency-free, fully tested
lib/offline/            the IndexedDB queue and the optimistic fold
lib/data/               row mapping and the Vandaag loader
lib/server/             the write path both the endpoint and tests share
public/sw.js            the service worker
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

**Rust lives in the ledger.** Decay is written as a `log_entries` row with
`source = 'rust'` and a negative amount — exactly the XP standing in the
current level plus the whole of the level below, so replaying it lands on one
level down at zero XP. The replay walks levels downward as well as upward,
which is what makes `log_entries` the complete source of truth rather than a
partial one. The floor guard sits in `rustXpDelta`, so no entry that would
breach a floor is ever written and the ledger is safe to replay blindly.

**Freezes are events, not recomputations.** One row per earned freeze, carrying
the week that earned it and the day it covered. `resolveStreak` honours only
freezes already recorded; `freezeToSpend` decides once a day whether one is
due. Doing it the other way round — walking back and burning held freezes on
any gap found — would manufacture a streak that was never earned.

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

## Offline

Completing a task never waits on the network. Every write goes into an
IndexedDB queue first and is sent second; the meters and the display move
immediately, folded from the same domain functions the server will run, so an
offline completion reads exactly as it will once it lands.

Writes go through `POST /api/completions` rather than a server action,
because the service worker has to be able to replay them and a worker can
replay a fetch but not a server action. The client supplies the entry id, and
`log_completion` ignores a second insert of the same one, so replay is always
safe.

Three details that took a second pass:

- **The API answers with a status, never a redirect.** An unauthenticated
  `POST` used to 307 to `/login`; `fetch` follows redirects, so the queue saw
  a 200 HTML page, counted it a success and deleted the write. The middleware
  now returns 401 JSON for anything under `/api/`.
- **Failures are parked, not broadcast.** A write that can never succeed goes
  into a second store and stays there until the user dismisses it. The worker
  usually drains the queue with no page open, so a message would reach nobody
  — and reading destructively meant a remount could swallow the only notice.
- **A freeze protects a streak, it does not start one.** The first cut walked
  back through history spending held freezes on any gap it met, which turned
  three freezes and one logged day into a four-day streak.

`npm run verify:offline` drives all of it in a real browser: cut the network,
complete a task, reload, reconnect, and check that a permanently failed write
is reported rather than lost.

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

### Contrast

The brief specifies `--muted: #7A7973` and `--screen-muted: #6E7178`, and
separately requires WCAG AA in both palettes. Those cannot both hold: labels run
at 9–10px, so they are normal text needing 4.5:1, and the given values reach
only 3.40:1 on `--panel` and 2.94:1 on `--recess`. The muted tones here are the
nearest values that pass on every surface they are used on. `--signal` itself
is unchanged and still does all the non-text work — the dot matrix, the tier
bar, lit ticks — while three derived tokens carry the cases it cannot:

| Token | Why it exists |
| --- | --- |
| `--signal-text` | `--signal` reaches 2.62:1 on `--panel`; a warning sentence needs 4.5:1 |
| `--signal-fill` / `--on-signal` | a button face and its label, passing in both palettes |
| `--focus` | WCAG 2.4.11 wants 3:1 for a focus ring against every surface it lands on |

Every text pair the app renders clears AA with headroom — the tightest is
4.61:1 — and several reach AAA. Placeholders are given an explicit colour
rather than the browser's default grey, which lands around 2.5:1.
`tests/contrast.test.ts` reads the real tokens out of the stylesheet, models
the day-to-night cascade the way the browser does, and checks every pair, so
none of this can drift.

## Status

- [x] **Phase 1 — Foundation.** Schema, RLS, auth, design tokens, Vandaag with
      check-off, timers, quick log, the dot matrix and the meters.
- [x] **Phase 2 — PWA and offline.** Manifest, icons, service worker, offline
      shell, IndexedDB write queue with background replay, install prompt.
- [ ] Phase 3 — Beheer and Historie
- [ ] Phase 4 — Quests, capacity, rust, freezes, Sunday report, seasons
- [ ] Phase 5 — Google Calendar and Gmail

Rust and freeze storage were open after phase 1 and are now settled — see
[The rules](#the-rules). The mechanics themselves (the decay job, the weekly
grant, the Sunday report) land in phase 4; the schema, the domain functions and
their tests are already in place so that phase is not blocked.

### Measured

On the production build, throttled mobile: performance 99, accessibility 100,
best practices 100. Every installability criterion passes (`npm run verify:pwa`)
— Lighthouse dropped its PWA category in v12, so those are checked directly
against what Chromium actually requires.

Two things are **not** verified end to end. Signing in needs a magic link sent
to a real mailbox, so the authenticated round trip — queue drains, server
awards XP, page refreshes — is covered at the unit level (idempotency against
real Postgres, worker/page request-body parity) rather than through the UI. And
the install has not been tried on a physical phone; the criteria are checked,
the tap is not.
