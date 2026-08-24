-- Skill Unit — schema
-- Single user. Every table is scoped to auth.uid() through RLS.
-- log_entries is the source of truth for history; skills.level / skills.xp are
-- derived state that we write for speed and can always rebuild (see 0002).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- skills ----
create table public.skills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  subtitle       text,
  color          text not null default '#7A7973',
  glyph          text not null default 'square',
  level          int  not null default 1  check (level >= 1),
  xp             int  not null default 0  check (xp >= 0),
  floor_level    int  not null default 0  check (floor_level >= 0),
  last_active_at timestamptz,
  active         bool not null default true,
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now()
);

create index skills_user_idx on public.skills (user_id, active, sort_order);

-- ----------------------------------------------------------------- tasks ----
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_id   uuid not null references public.skills (id) on delete cascade,
  title      text not null,
  kind       text not null check (kind in ('check','timer')),
  -- check: XP per completion. timer: XP per 10 minutes.
  value      int  not null check (value between 5 and 150),
  on_today   bool not null default false,
  archived   bool not null default false,
  created_at timestamptz not null default now()
);

create index tasks_user_idx  on public.tasks (user_id, archived, on_today);
create index tasks_skill_idx on public.tasks (skill_id);

-- ----------------------------------------------------------- log_entries ----
create table public.log_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  skill_id   uuid not null references public.skills (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete set null,
  title      text not null,
  xp         int  not null,
  minutes    int,
  note       text,
  source     text not null check (source in ('manual','timer','quick','calendar','mail','quest')),
  created_at timestamptz not null default now()
);

create index log_user_time_idx  on public.log_entries (user_id, created_at desc);
create index log_skill_time_idx on public.log_entries (user_id, skill_id, created_at);

-- ----------------------------------------------------------------- goals ----
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  skill_id    uuid not null references public.skills (id) on delete cascade,
  title       text not null,
  target_date date,
  progress    int  not null default 0,
  done        bool not null default false,
  created_at  timestamptz not null default now()
);

create index goals_user_idx on public.goals (user_id, done);

-- ---------------------------------------------------------------- quests ----
create table public.quests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  skill_id     uuid not null references public.skills (id) on delete cascade,
  title        text not null,
  target       int  not null check (target > 0),
  progress     int  not null default 0,
  bonus_xp     int  not null default 0,
  week_start   date not null,
  completed_at timestamptz
);

create index quests_user_week_idx on public.quests (user_id, week_start);

-- --------------------------------------------------------------- seasons ----
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  badge_slug text not null,
  summary    jsonb,
  check (ends_on > starts_on)
);

create index seasons_user_idx on public.seasons (user_id, starts_on desc);

-- -------------------------------------------------------- week_settings ----
create table public.week_settings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  capacity   text not null check (capacity in ('rustig','normaal','gek')),
  primary key (user_id, week_start)
);

-- ---------------------------------------------------------- inbox_items ----
create table public.inbox_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  source            text not null check (source in ('calendar','mail')),
  external_id       text not null,
  title             text not null,
  suggested_skill_id uuid references public.skills (id) on delete set null,
  suggested_xp      int  not null default 0,
  occurred_at       timestamptz not null,
  status            text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  -- dedup key: scoped per user rather than globally unique
  unique (user_id, external_id)
);

create index inbox_pending_idx on public.inbox_items (user_id, status, occurred_at desc);

-- -------------------------------------------------------- mapping_rules ----
create table public.mapping_rules (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  source   text not null check (source in ('calendar','mail')),
  pattern  text not null,
  skill_id uuid not null references public.skills (id) on delete cascade,
  xp       int  not null default 0
);

create index mapping_rules_user_idx on public.mapping_rules (user_id, source);

-- ------------------------------------------------- integration_accounts ----
-- refresh_token never leaves the server: no RLS policy grants select to the
-- authenticated role, only the service role reaches this table.
create table public.integration_accounts (
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider      text not null,
  refresh_token text not null,
  scopes        text not null,
  connected_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ------------------------------------------------------------------ RLS ----
alter table public.skills               enable row level security;
alter table public.tasks                enable row level security;
alter table public.log_entries          enable row level security;
alter table public.goals                enable row level security;
alter table public.quests               enable row level security;
alter table public.seasons              enable row level security;
alter table public.week_settings        enable row level security;
alter table public.inbox_items          enable row level security;
alter table public.mapping_rules        enable row level security;
alter table public.integration_accounts enable row level security;

create policy own_rows on public.skills        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.tasks         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.log_entries   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.goals         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.quests        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.seasons       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.week_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.inbox_items   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.mapping_rules for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- integration_accounts: deliberately no policy. RLS on with zero policies means
-- the authenticated role can never read the refresh token; the service role
-- bypasses RLS and is the only way in.
