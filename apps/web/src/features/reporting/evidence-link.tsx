import { useState } from 'react';
import { requestFile } from '@/lib/api';

/**
 * Opens a stored evidence file in a new tab. The file is fetched through the API client (so the
 * session, errors and the development mock apply) and shown from a temporary object URL.
 */
export function EvidenceLink({
  evidenceId,
  fileName,
}: {
  evidenceId: string;
  fileName: string;
}) {
  const [state, setState] = useState<'idle' | 'opening' | string>('idle');

  async function open() {
    // Open the tab synchronously so the browser treats it as a response to the click.
    const tab = window.open('', '_blank');
    setState('opening');
    try {
      const blob = await requestFile(`/api/evidence/${evidenceId}/file`);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState('idle');
    } catch (error) {
      tab?.close();
      setState(
        error instanceof Error
          ? error.message
          : 'The file could not be opened.',
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === 'opening'}
        className="text-left font-bold text-primary underline-offset-4 hover:underline focus-visible:underline disabled:opacity-60"
      >
        {fileName}
        <span className="sr-only"> (opens in a new tab)</span>
      </button>
      {state !== 'idle' && state !== 'opening' && (
        <span role="alert" className="block text-error-dark">
          {state}
        </span>
      )}
    </>
  );
}
