import 'server-only';

import type { CalendarEvent, SentMessage } from '@/lib/domain/mapping';

/**
 * Google, read-only.
 *
 * Two scopes and nothing else: the app reads what already happened and never
 * writes to a calendar or a mailbox. The refresh token lives in
 * integration_accounts, which has RLS on and no policy, so only the service
 * role reaches it — it never travels to the browser.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads the config, or explains exactly what is missing. */
export function googleConfig(origin: string): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${(process.env.NEXT_PUBLIC_SITE_URL ?? origin).replace(/\/$/, '')}/api/integrations/google/callback`,
  };
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The consent URL.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google hand over a
 * refresh token; without both, a re-authorisation returns only a short-lived
 * access token and the sync stops working a hour later.
 */
export function consentUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface ExchangeResult {
  refreshToken: string;
  accessToken: string;
  scopes: string;
}

export async function exchangeCode(
  config: GoogleConfig,
  code: string,
): Promise<ExchangeResult | { error: string }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.refresh_token || !body.access_token) {
    return {
      error:
        body.error_description ??
        body.error ??
        'Google gaf geen vernieuwingstoken terug. Verbreek de koppeling in je Google-account en probeer opnieuw.',
    };
  }

  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    scopes: body.scope ?? SCOPES.join(' '),
  };
}

/** Trades the stored refresh token for a short-lived access token. */
export async function accessTokenFor(
  config: GoogleConfig,
  refreshToken: string,
): Promise<string | { error: string }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) {
    return { error: body.error_description ?? body.error ?? 'Kon geen toegang krijgen.' };
  }
  return body.access_token;
}

/** Lets a connection be withdrawn at Google's end too, not just ours. */
export async function revoke(refreshToken: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // Best effort: the local record is removed either way.
  }
}

/* ---------------------------------------------------------------- reads -- */

interface CalendarListResponse {
  items?: {
    id?: string;
    summary?: string;
    status?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }[];
}

/**
 * Events that already ended, between two instants.
 *
 * All-day entries are skipped: they have no duration to price, and a birthday
 * in the calendar is not an hour of work.
 */
export async function fetchCalendarEvents(
  accessToken: string,
  from: Date,
  to: Date,
): Promise<CalendarEvent[] | { error: string }> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    return { error: `Agenda ophalen mislukte (${response.status}).` };
  }

  const body = (await response.json()) as CalendarListResponse;
  const events: CalendarEvent[] = [];

  for (const item of body.items ?? []) {
    if (item.status === 'cancelled') continue;
    const startsAt = item.start?.dateTime;
    const endsAt = item.end?.dateTime;
    if (!item.id || !startsAt || !endsAt) continue;

    events.push({ id: item.id, title: item.summary ?? 'Zonder titel', startsAt, endsAt });
  }

  return events;
}

interface MessageListResponse {
  messages?: { id?: string }[];
}
interface MessageResponse {
  id?: string;
  internalDate?: string;
  payload?: { headers?: { name?: string; value?: string }[] };
}

/** Never fetch more than this in one run; a busy inbox should not stall a cron. */
const MAX_MESSAGES = 80;

/**
 * Sent mail in a window, as subject plus recipients.
 *
 * Only the headers a rule is matched against are requested — `format=metadata`
 * with a header allowlist — so the body of a message never leaves Google.
 */
export async function fetchSentMail(
  accessToken: string,
  from: Date,
  to: Date,
): Promise<SentMessage[] | { error: string }> {
  const query = `in:sent after:${Math.floor(from.getTime() / 1000)} before:${Math.floor(to.getTime() / 1000)}`;
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({
      q: query,
      maxResults: String(MAX_MESSAGES),
    }).toString()}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  if (!listResponse.ok) {
    return { error: `Mail ophalen mislukte (${listResponse.status}).` };
  }

  const list = (await listResponse.json()) as MessageListResponse;
  const ids = (list.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  const messages: SentMessage[] = [];

  for (const id of ids.slice(0, MAX_MESSAGES)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!detail.ok) continue;

    const body = (await detail.json()) as MessageResponse;
    const headers = body.payload?.headers ?? [];
    const text = headers
      .filter((h) => h.name === 'Subject' || h.name === 'To')
      .map((h) => h.value ?? '')
      .join(' ');

    messages.push({
      id,
      text,
      sentAt: new Date(Number(body.internalDate ?? Date.now())).toISOString(),
    });
  }

  return messages;
}
