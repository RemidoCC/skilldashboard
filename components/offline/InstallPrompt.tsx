'use client';

import { useEffect, useState } from 'react';

/** The event Chromium fires; not in the DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'skillunit.install-dismissed';

/**
 * Offers to install, once, and only when the browser says it is installable.
 * Safari never fires the event, so iOS gets the short manual instruction
 * instead — but only when the app is not already running standalone.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === 'yes';
    } catch {
      // Storage blocked; treat as not dismissed.
    }
    if (dismissed) return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari's own flag, absent from the standard Navigator type.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS supports installing but never announces it.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) setIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, 'yes');
    } catch {
      // Nothing to do; it will simply ask again.
    }
    setEvent(null);
    setIosHint(false);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    dismiss();
  }

  if (!event && !iosHint) return null;

  return (
    <div className="recess mt-3 px-3 py-2.5">
      <h3 className="label">Op het beginscherm</h3>
      <p className="mt-1 text-[13px]">
        {event
          ? 'Zet Skill Unit op je beginscherm, dan opent hij zonder browserbalk.'
          : 'Deel-knop, dan “Zet op beginscherm”. Daarna opent Skill Unit zonder browserbalk.'}
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="raised h-11 px-4 text-[12px]">
          Niet nu
        </button>
        {event ? (
          <button
            type="button"
            onClick={install}
            className="raised h-11 px-4 text-[12px]"
            style={{ background: 'var(--signal-fill)', color: 'var(--on-signal)' }}
          >
            Installeren
          </button>
        ) : null}
      </div>
    </div>
  );
}
