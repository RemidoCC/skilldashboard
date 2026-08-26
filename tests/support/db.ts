import { Client } from 'pg';

/**
 * Connecting to the test database, and being deliberate about who you are.
 *
 * This exists because of a bug the whole suite missed. `log_completion` is
 * `security invoker` and called `public.apply_xp`, which a migration had
 * revoked from `authenticated`. Every completion in production failed with
 * `permission denied for function apply_xp` — and every test passed, because
 * every test held the connection as `postgres`, the database owner, who has
 * execute on everything and bypasses RLS besides.
 *
 * Nothing about the queries was wrong. The role was. So the role is now
 * something a test has to say out loud: `asUser` for anything the browser
 * does, `asService` for anything a scheduled job does, and the bare client
 * only for fixtures and assertions, where owner rights are the point.
 */
export interface TestDb {
  /** Owner connection. Use for fixtures and for reading state back. */
  db: Client;
  userId: string;
  end: () => Promise<void>;
}

export async function connectAs(url: string, label: string): Promise<TestDb> {
  const db = new Client({ connectionString: url });
  await db.connect();

  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [`${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`],
  );
  const userId = rows[0].id;

  // Makes auth.uid() resolve to this user, whichever role is active.
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);

  return {
    db,
    userId,
    end: async () => {
      await db.query(`reset role`);
      await db.query(`delete from auth.users where id = $1`, [userId]);
      await db.end();
    },
  };
}

/**
 * Runs the body as `authenticated` — the role PostgREST hands every request
 * from the browser. RLS applies and function grants are enforced, which is the
 * entire point.
 */
export async function asUser<T>(db: Client, body: () => Promise<T>): Promise<T> {
  await db.query(`set role authenticated`);
  try {
    return await body();
  } finally {
    await db.query(`reset role`);
  }
}

/**
 * Runs the body as `service_role` with no `sub` claim, which is what a cron
 * connection looks like: RLS is bypassed and auth.uid() is null.
 */
export async function asService<T>(db: Client, body: () => Promise<T>): Promise<T> {
  const { rows } = await db.query<{ sub: string }>(
    `select current_setting('request.jwt.claim.sub', true) as sub`,
  );
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`set role service_role`);
  try {
    return await body();
  } finally {
    await db.query(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [rows[0]?.sub ?? '']);
  }
}
