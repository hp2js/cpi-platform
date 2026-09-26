import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppRouter } from '@/app/router';
import { Button } from '@/components/ui/button';
import {
  getLatencyMode,
  setLatencyMode,
  type LatencyMode,
} from './services/latency';

/**
 * Development-only controls for the mock API, used to exercise loading, expired-session
 * and fresh-start paths. Never rendered in production builds.
 */
export function DevToolbar({ router }: { router: AppRouter }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [latency, setLatency] = useState<LatencyMode>(getLatencyMode);
  const [busy, setBusy] = useState(false);

  async function post(path: string) {
    setBusy(true);
    try {
      await fetch(path, { method: 'POST' });
    } finally {
      setBusy(false);
    }
  }

  const [emailFailing, setEmailFailing] = useState(false);
  useEffect(() => {
    void fetch('/api/__mock/email-failure')
      .then((response) => response.json() as Promise<{ enabled: boolean }>)
      .then((body) => setEmailFailing(body.enabled))
      .catch(() => undefined);
  }, []);
  async function toggleEmailFailure(enabled: boolean) {
    setEmailFailing(enabled);
    await fetch('/api/__mock/email-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }
  async function expireSession() {
    await post('/api/__mock/expire-session');
    await queryClient.invalidateQueries();
  }
  async function resetData() {
    if (!window.confirm('Reset all demo data to the seeded starting point?'))
      return;
    await post('/api/__mock/reset');
    queryClient.clear();
    await router.navigate({ to: '/sign-in', search: { redirect: undefined } });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-3 bottom-24 z-50 shadow-md md:bottom-3"
        onClick={() => setOpen(true)}
      >
        <FlaskConical aria-hidden="true" />
        Mock API
      </Button>
    );
  }
  return (
    <section
      aria-label="Mock API controls"
      className="fixed right-3 bottom-24 z-50 w-72 rounded-lg border bg-card p-4 text-sm shadow-lg md:bottom-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Mock API controls</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden="true" />
          <span className="sr-only">Close mock API controls</span>
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Development only. Data is fictional and stored in this browser.
      </p>
      <label className="mt-3 grid gap-1">
        <span className="font-medium">Network latency</span>
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={latency}
          onChange={(event) => {
            const mode = event.target.value as LatencyMode;
            setLatency(mode);
            setLatencyMode(mode);
          }}
        >
          <option value="off">Off</option>
          <option value="realistic">Realistic (0.1–0.4 s)</option>
          <option value="slow">Slow (1.5–2.5 s)</option>
        </select>
      </label>
      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={emailFailing}
          onChange={(event) => void toggleEmailFailure(event.target.checked)}
        />
        <span>Demo email sink rejects messages</span>
      </label>
      <div className="mt-3 grid gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void expireSession()}
        >
          Expire my session
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void resetData()}
        >
          Reset demo data
        </Button>
      </div>
    </section>
  );
}
