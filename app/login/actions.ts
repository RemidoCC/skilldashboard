'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  message: string;
}

async function redirectTarget(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/auth/callback`;

  // Falls back to the request's own origin, which keeps preview deploys working.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/auth/callback`;
}

/**
 * What went wrong, in Dutch.
 *
 * Supabase answers in English, and the message it returns most often — you
 * pressed the button twice — was going straight to the screen: "For security
 * purposes, you can only request this after 51 seconds." The codes are matched
 * where they are known and the rest falls back, rather than passing an English
 * sentence through and calling it a translation.
 */
function describe(error: { code?: string; status?: number; message: string }): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Er is net al een link verstuurd. Wacht een minuut en probeer het opnieuw.';
    case 'validation_failed':
      return 'Dit e-mailadres kan niet gelezen worden. Controleer of het klopt.';
    case 'email_provider_disabled':
      return 'Inloggen per mail staat uit op de server. Hier valt vanaf dit scherm niets aan te doen.';
    default:
      return error.status === 429
        ? 'Er is net al een link verstuurd. Wacht een minuut en probeer het opnieuw.'
        : 'Versturen mislukte. Probeer het zo nog eens.';
  }
}

export async function sendMagicLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();

  if (email === '') {
    return { status: 'error', message: 'Vul je e-mailadres in.' };
  }

  // Skill Unit has one account. Saying so plainly beats a silent no-op.
  if (!isAllowedEmail(email)) {
    return {
      status: 'error',
      message: 'Dit adres hoort niet bij dit toestel. Skill Unit heeft één account.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await redirectTarget() },
  });

  if (error) {
    return { status: 'error', message: describe(error) };
  }

  return {
    status: 'sent',
    message: 'Er staat een inloglink in je mail. De link is één keer te gebruiken.',
  };
}
