'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

const INITIAL: LoginState = { status: 'idle', message: '' };

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendMagicLink, INITIAL);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="screen px-4 py-5">
        <span className="label" style={{ color: 'var(--screen-muted)' }}>
          Skill Unit
        </span>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--screen-ink)' }}>
          Eén account. Je krijgt een link per mail, geen wachtwoord.
        </p>
      </div>

      <form action={action} className="recess mt-4 p-3">
        <label htmlFor="email" className="label">
          E-mailadres
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="raised mt-1.5 h-12 w-full px-3 text-[14px] outline-none"
          style={{ color: 'var(--ink)' }}
        />

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="raised h-12 px-5 text-[13px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            {pending ? 'Bezig' : 'Stuur link'}
          </button>
        </div>

        {state.status !== 'idle' ? (
          <p
            role={state.status === 'error' ? 'alert' : 'status'}
            className="mt-3 text-[12px]"
            style={{ color: state.status === 'error' ? 'var(--signal-text)' : 'var(--muted)' }}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </main>
  );
}
