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
    return { status: 'error', message: `Versturen mislukte: ${error.message}` };
  }

  return {
    status: 'sent',
    message: 'Er staat een inloglink in je mail. De link is één keer te gebruiken.',
  };
}
