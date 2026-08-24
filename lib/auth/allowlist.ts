/**
 * Skill Unit has exactly one account. This is the friendly gate that gives a
 * clear message; supabase/migrations/0003_auth.sql is the one that actually
 * stops a second account from ever existing.
 */
export function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL;
  if (!allowed) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
