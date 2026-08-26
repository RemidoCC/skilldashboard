/**
 * A small in-memory stand-in for the slice of supabase-js that lib/server/jobs
 * uses.
 *
 * The scheduled jobs had no tests at all, which is where four of the audit's
 * findings were hiding: rust that could never write, a freeze that could never
 * be spent the run it was earned, a season badge that always said the same
 * word, and a longest streak reported as zero. None of those throw. They just
 * quietly do the wrong thing, and only running the job shows it.
 *
 * This is deliberately not a database. It answers the handful of query shapes
 * the jobs actually build, and it records what was written so a test can look.
 */

export type Row = Record<string, unknown>;

interface Filter {
  kind: 'eq' | 'gte' | 'lte' | 'notNull';
  column: string;
  value?: unknown;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = row[f.column];
    switch (f.kind) {
      case 'eq':
        return actual === f.value;
      case 'gte':
        return String(actual) >= String(f.value);
      case 'lte':
        return String(actual) <= String(f.value);
      case 'notNull':
        return actual !== null && actual !== undefined;
    }
  });
}

export interface FakeDb {
  /** The tables, live: assert against these after a job has run. */
  tables: Record<string, Row[]>;
  /** Every rpc the job made, in order. */
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  /** Set to make the next matching rpc fail, the way a real one can. */
  failRpc: ((fn: string, args: Record<string, unknown>) => string | null) | null;
  client: unknown;
}

export function fakeSupabase(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));

  const state: FakeDb = {
    tables,
    rpcCalls: [],
    failRpc: null,
    client: null,
  };

  const rowsOf = (table: string): Row[] => (tables[table] ??= []);

  function selectBuilder(table: string, head: boolean) {
    const filters: Filter[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;

    const resolve = () => {
      let out = rowsOf(table).filter((r) => matches(r, filters));
      if (orderBy) {
        const { column, ascending } = orderBy;
        out = [...out].sort((a, b) => {
          const x = String(a[column] ?? '');
          const y = String(b[column] ?? '');
          return ascending ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      return out.map((r) => ({ ...r }));
    };

    const builder = {
      eq(column: string, value: unknown) {
        filters.push({ kind: 'eq', column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        filters.push({ kind: 'gte', column, value });
        return builder;
      },
      lte(column: string, value: unknown) {
        filters.push({ kind: 'lte', column, value });
        return builder;
      },
      // The jobs only ever build `.not(col, 'is', null)`, so that is all this
      // understands; the operator and the value are taken as given.
      not(column: string) {
        filters.push({ kind: 'notNull', column });
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orderBy = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      maybeSingle: async () => ({ data: resolve()[0] ?? null, error: null }),
      single: async () => {
        const found = resolve()[0];
        return found
          ? { data: found, error: null }
          : { data: null, error: { message: 'no rows', code: 'PGRST116' } };
      },
      then(onFulfilled: (value: { data: Row[] | null; count?: number; error: null }) => unknown) {
        const found = resolve();
        return Promise.resolve(
          head
            ? { data: null, count: found.length, error: null }
            : { data: found, count: found.length, error: null },
        ).then(onFulfilled);
      },
    };
    return builder;
  }

  function insertBuilder(table: string, payload: Row | Row[]) {
    const incoming = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
      id: `fake-${table}-${rowsOf(table).length + 1}`,
      ...r,
    }));
    rowsOf(table).push(...incoming);

    const builder = {
      select() {
        return builder;
      },
      single: async () => ({ data: { ...incoming[0] }, error: null }),
      maybeSingle: async () => ({ data: { ...incoming[0] }, error: null }),
      then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: incoming, error: null }).then(onFulfilled);
      },
    };
    return builder;
  }

  function updateBuilder(table: string, patch: Row) {
    const filters: Filter[] = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push({ kind: 'eq', column, value });
        return builder;
      },
      then(onFulfilled: (value: { data: null; error: null }) => unknown) {
        for (const row of rowsOf(table)) {
          if (matches(row, filters)) Object.assign(row, patch);
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      },
    };
    return builder;
  }

  state.client = {
    from(table: string) {
      return {
        select(_columns?: string, opts?: { count?: string; head?: boolean }) {
          return selectBuilder(table, opts?.head === true);
        },
        insert(payload: Row | Row[]) {
          return insertBuilder(table, payload);
        },
        update(patch: Row) {
          return updateBuilder(table, patch);
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      const failure = state.failRpc?.(fn, args);
      if (failure) return { data: null, error: { message: failure, code: '42501' } };

      // The one rpc the jobs make. Enough of log_completion to be useful: it
      // writes the ledger row and moves the skill, and it refuses without a
      // user the way the real one does.
      if (fn === 'log_completion') {
        const user = args.p_user ?? null;
        if (!user) return { data: null, error: { message: 'Niet ingelogd.', code: '42501' } };

        const id = String(args.p_id);
        if (rowsOf('log_entries').some((r) => r.id === id)) {
          return { data: null, error: null };
        }
        rowsOf('log_entries').push({
          id,
          user_id: user,
          skill_id: args.p_skill,
          title: args.p_title,
          xp: args.p_xp,
          source: args.p_source,
          created_at: args.p_created_at,
        });
        return { data: null, error: null };
      }

      return { data: null, error: null };
    },
  };

  return state;
}
