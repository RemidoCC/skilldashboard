// `server-only` throws on import outside a React Server Component graph, which
// would stop the test runner from ever reaching a module that ships with it.
// Aliased in vitest.config.mts, so the guard still holds in the real build.
export {};
