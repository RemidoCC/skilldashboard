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
| `npm run verify:offline` | Drives Vandaag in a browser with the network cut |
| `npm run verify:beheer` | Same, for the edits made in Beheer |
| `npm run verify:additions` | Reverting, the Sunday capacity pick, sign-out, picking your three |
| `npm run verify:hardening` | The key gate, the restore flow, the season summary, the window |
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
  api/completions/      completions in
  api/mutations/        edits from Beheer
  api/export/           the whole account as JSON
  api/import/           the same JSON, read back in
  api/cron/             the scheduled jobs, behind a bearer token
  api/integrations/     the Google OAuth flow
  dev/                  visual preview against fixtures, 404s in production
components/instrument/  the dot matrix, the meters, the display, the self-test
components/vandaag/     task rows, timer, quick log
components/beheer/      tasks, skills, goals, settings
components/historie/    small multiples and the day log
components/offline/     the queue provider, sync bar, install prompt
lib/domain/             the rules — pure, dependency-free, fully tested
lib/offline/            the IndexedDB queue and the optimistic fold
lib/data/               row mapping and the Vandaag loader
lib/server/             the write path, the scheduled jobs, the Google client
vercel.json             the cron schedules
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

**A completion can be taken back.** `public.revert_completion` removes the
entry and everything it set in motion — a quest it advanced, the bonus it paid,
a suggestion it accepted — then replays what is left. The levels are never
adjusted by hand: the ledger is authoritative, so `recalculate_levels` rebuilds
them. It is the one caller that rebuilds **floors** too, because a floor bought
by a mis-tap was never earned. Rust and quest bonuses refuse to be reverted
directly: neither is something you did, so you undo the completion that caused
them instead.

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

## Beheer and Historie

**Beheer** covers tasks (create, edit, put on today, archive and restore),
skills (switch on and off, edit, add custom ones from the fixed glyph set),
goals, and settings — sound, haptics, night panel, week capacity, and the JSON
export with the restore that reads it back. Two warnings are the point of the
screen rather than decoration: more than three tasks on today, and more than six
skills active, both stated plainly with what to do about it.

**Historie** shows a level trajectory per skill as small multiples — step
lines, not curves, because a level is a whole number that changes on a day and
smoothing would imply a continuity that is not there. Each chart is scaled to
its own skill with the range printed beside it; a shared axis would flatten a
young skill into a flat line. A skill that climbed and then rusted back reports
its peak, so the window does not read as though nothing happened. Below that,
the ledger by day with its notes, and the seasons that have finished.

The window is **30 days, 90, a year or everything**, as a plain query parameter
(`/historie?dagen=alles`) so it survives a reload and a bookmark and works with
no JavaScript running. Ninety days is a season, which is the unit the app thinks
in — but a season that has just ended falls off the front of it, which is the
one moment you most want to look back. "Alles" reaches to the first thing ever
logged and never shows less than a month, because a line across four days is not
a line.

A finished season shows **what it consisted of**: the theme word with the
sentence that explains it, total XP, levels gained, quests completed, the
longest streak, and the split per skill. The summary has been written at the end
of every season since phase four; showing it is what turns the badge from a word
into a reading. A season from before the summary existed says so rather than
displaying zeroes.

The trajectory replays the **whole** ledger, not just the window: a level on
day one of the window depends on everything before it.

### The export, and the way back

`GET /api/export` is the whole account as JSON, the ledger included, so every
level can be rebuilt from it. `POST /api/import` reads one back.

Both sides are driven by the **same table list** (`lib/domain/restore.ts`), which
names each table, the columns that may travel, and the order that satisfies the
foreign keys. A column added to one side and forgotten on the other cannot
happen, because there is only one side.

Three things stand between a file and the database:

- The reader strips the payload to columns that exist and refuses anything else,
  naming the table and the row. `user_id` is **not** in any allowlist: a file
  claiming to belong to someone else restores into your own account or not at
  all.
- `restore_account` does the whole replacement in one transaction, so a failure
  halfway leaves the account it started with rather than half of each. It takes
  the owner from `auth.uid()` and runs `security invoker`, so RLS checks the
  same thing again.
- Levels are then rebuilt from the restored ledger, not read from the file. A
  file with hand-edited levels restores to what its history actually supports.
  Floors are left alone; a floor once earned is not given back.

A restore replaces rather than merges, and the screen says so before the second
tap: what is in the file, in counts, and what is about to go, in words.

## Rhythm

**Quests.** Three a week, put on the board Monday morning. The bias is the
whole design: a quest lands on a skill tied to an active goal, or on the one
that has been quiet longest — a quest you would have completed anyway measures
nothing. Targets are one more than the skill's recent weekly average, scaled by
the week's capacity (`rustig` ×0.5, `gek` ×0.75) and clamped to 2–6.
Generation is deterministic, so a job that runs twice cannot produce a
different week.

Progress lives inside `log_completion` rather than in the route handler,
because the function already knows whether the ledger entry was really
inserted — so a replayed offline completion advances a quest exactly once, and
a finished quest pays its bonus exactly once.

**Rust.** Decay costs one level per *episode* of neglect, not one level a day.
A skill that has already rusted since it was last used is left alone until it
is used again; without that check a fortnight away would quietly cost a
fortnight of levels, which is the punishment the rule exists to avoid. Rust
also never refreshes `last_active_at` — it is the system acting, not you
showing up — and for the same reason it counts towards neither your streak nor
the day's XP.

**Freezes.** Earned once per completed week that was actually worked, at most
three held. Spent on the day that would otherwise have broken the streak, and
the day it covered is named on the screen: a freeze that quietly saved a run
would make it read as unbroken effort.

**The week's capacity is chosen in the Sunday report**, for the *coming* week —
Sunday evening is when you know what next week looks like, and it is written
immediately rather than waiting for "Neem over". Beheer keeps the same control
for the current week. Without this the setting stayed on `normaal` forever and
the whole mechanic it drives — quest targets ×0.5 / ×0.75, rust grace of
14/10/21 days — never moved.

**The Sunday report** is computed when it is asked for rather than stored — it
derives entirely from the ledger, so a live one can never be stale. It is on
offer from Sunday 18:00 through Monday, because a report you can only see on
Sunday evening is a report you will miss. It states what came in against last
week, what levelled, what rusted or is close, the balance sentence, and the
three quests the coming week would ask, each swappable before you take them
over.

**Seasons.** Twelve weeks. At the end the badge is derived from what actually
happened — `hersteld` when a skill climbed back from rust, `toegespitst` when
one skill took over half, `evenwichtig` when none passed 40% — and the tally
goes into `seasons.summary`. Levels and floors carry over; only quests reset.

**Goal proposals** are scaffolding, not insight. There is no model reading the
goal, so the app offers the shape most goals need — regular work, a weekly
step, preparation, a look back — sized to what the skill's existing tasks
already use, and never heavier. Every line is editable, every line can be
thrown out, and nothing reaches the database until it is confirmed.

### Scheduled jobs

`vercel.json` runs two, both idempotent:

| Route | When | Does |
| --- | --- | --- |
| `/api/cron/daily` | 02:00 daily | rust, freeze grant, freeze spend |
| `/api/cron/weekly` | 02:00 Monday | season rollover, then the week's quests |
| `/api/cron/sync` | 07:00 and 19:00 | pull Google, file suggestions |

All three need `CRON_SECRET` (Vercel sends it as a bearer token) and
`SUPABASE_SERVICE_ROLE_KEY` — a cron run has no session, so it cannot go
through RLS the way a request does. Without either, the route refuses and says
which one is missing. The sync job additionally needs `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`; without them it reports that Google is not configured
and does nothing.

Note the split under `/api`: the two OAuth routes the **browser navigates to**
redirect to the login screen when signed out, while every endpoint called with
`fetch` answers with a status. Mixing those up is how a write gets lost —
`fetch` follows redirects, so a 307 comes back as a 200 login page and reads as
success.

## Integrations

Google, read-only: `calendar.readonly` and `gmail.readonly`, nothing else. Twice
a day a job pulls yesterday's and today's **finished** calendar events and sent
mail, matches them against your mapping rules, and files what it finds as
suggestions.

**Nothing is ever awarded automatically.** Every item lands in the inbox as
`pending` and waits for a tap, which is what keeps a wrong mapping rule from
being able to do anything worse than waste a moment. Accepting reuses the
inbox item's own id as the ledger entry id, so a suggestion accepted twice
writes one entry.

Rules are plain case-insensitive substrings, not patterns — a rule you can read
out loud is a rule you can predict — and the **first** match wins, so a
specific rule above a general one takes precedence. A calendar event is priced
at the skill's own timer rate (the median of its timer tasks), so an hour in
the diary is worth what an hour on the timer would have been. Sent mail is
counted per rule per day and offered as one batch; a message at a time would
bury the inbox under a working morning.

If Google is not connected the inbox is not rendered at all, and everything
else works exactly as before.

### The refresh token

The token is a long-lived credential for a calendar and a mailbox, so the rule
that it never reaches the client is enforced in the database rather than in the
data layer — one careless `select *` should not be able to leak it. And because
RLS is a property of the connection rather than of the bytes, it is also
**encrypted at rest**.

`integration_accounts` has RLS with a row policy, the table-level `SELECT`
revoked, and only the four harmless columns granted back. Beheer can therefore
ask "is something linked" and get an answer, while selecting the token raises
`permission denied`. The service role, which the sync job runs as, is
unaffected.

This is easy to get wrong, and the first attempt here was: `grant select on
<table>` covers every column present and future, so a column-level
`revoke select (refresh_token)` subtracts **nothing** and the token stays
readable. Only revoking the table grant and then granting the safe columns
holds. `tests/integration-security.test.ts` pins it against a real Postgres,
including that `select *` fails.

RLS still leaves the token in the clear to anyone holding a dump, a restored
backup, or the service-role key. So `lib/server/secrets.ts` encrypts it with
AES-256-GCM under `TOKEN_ENCRYPTION_KEY`, which lives in the environment and
never in the database — holding one without the other is worth nothing. A
tampered value fails to decrypt rather than decrypting to something else.

Two guards make this hold rather than merely intend it. The database has a
check constraint that refuses anything not shaped like ciphertext, so no future
code path can quietly write a plaintext token. And the app refuses to start the
consent flow at all without a key: asking Google for a token there is no way to
protect would be worse than not asking. Beheer says which of the two is missing
— the Google credentials, or the key — rather than a single "niet ingesteld".

Rotating the key makes an existing connection unreadable. The sync job says so
in as many words instead of returning nothing, which would read as a quiet week
rather than a broken connection.

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

Beheer runs through the same outbox, in a second store. Completions are
additive and idempotent by entry id; edits overwrite, so they replay **in
order** and a blocked one stops the run rather than letting later edits jump
it — renaming a skill and then switching it off must not arrive the other way
round. Edits are also sent before completions, because a completion can name a
task that so far exists only in the edit queue.

`npm run verify:offline` and `npm run verify:beheer` drive all of it in a real
browser: cut the network, make the change, reload, reconnect, and check that
anything that can never succeed is named rather than lost.

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
- [x] **Phase 3 — Beheer and Historie.** Tasks, skills, goals and settings with
      full CRUD; level trajectories, the day log and season badges. Every edit
      queues offline like a completion.
- [x] **Phase 4 — Rhythm.** Quests, rust, freezes, the Sunday report, seasons,
      goal proposals and the two cron jobs.
- [x] **After the five phases.** Reverting a completion, the Sunday capacity
      pick, signing out (which clears the device copy), and putting a task on
      today without leaving Vandaag.
- [x] **Phase 5 — Integrations.** Google OAuth, the twice-daily sync, the
      inbox, and mapping rules. Waiting only on credentials.
- [x] **Hardening.** The refresh token encrypted at rest, a restore path for
      the export, the season summary shown, and a Historie window you can open.

Rust and freeze storage were open after phase 1 and are now settled — see
[The rules](#the-rules). The mechanics themselves (the decay job, the weekly
grant, the Sunday report) land in phase 4; the schema, the domain functions and
their tests are already in place so that phase is not blocked.

### Measured

On the production build, throttled mobile: performance 95–100 across runs, accessibility 100,
best practices 100. Every installability criterion passes (`npm run verify:pwa`)
— Lighthouse dropped its PWA category in v12, so those are checked directly
against what Chromium actually requires. All four browser suites pass (13 checks on
Vandaag, 10 on Beheer, 9 on the additions, 24 on the hardening), and the cron
routes refuse an unsigned call.

**Phase 5 is code-complete but unconnected**: `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are not set, so no real consent screen, token exchange
or API call has run. Everything downstream of the fetch — matching, pricing,
deduplication, the inbox, accepting and dismissing — is covered by tests and
the previews.

Three further things are **not** verified end to end. Signing in needs a magic link sent
to a real mailbox, so the authenticated round trip — queue drains, server awards
XP, page refreshes — is covered at the unit level (idempotency against real
Postgres, worker/page request-body parity) rather than through the UI. The
install has not been tried on a physical phone; the criteria are checked, the
tap is not. And the scheduled jobs have been exercised through their pure
decisions and their SQL, not by a real Vercel cron firing against real data —
that needs the deployment and the two secrets.
