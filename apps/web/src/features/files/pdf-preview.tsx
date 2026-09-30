import {
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * PDF pages drawn with pdf.js, so a PDF previews the same in every browser, including phones
 * and browsers without a PDF plugin. The page's text sits beside the drawing for screen
 * readers. Scripts in the file never run.
 */
export default function PdfPreview({
  blob,
  title,
}: {
  blob: Blob;
  title: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  // null fits the page to the available width.
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [text, setText] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof getDocument> | null = null;
    blob
      .arrayBuffer()
      .then((data) => {
        if (cancelled) return;
        task = getDocument({ data: new Uint8Array(data) });
        return task.promise;
      })
      .then((proxy) => {
        if (proxy && !cancelled) setDocument(proxy);
      })
      .catch(() => {
        if (!cancelled)
          setError('This PDF could not be read. Download it to open it.');
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry?.contentRect.width ?? 0)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [document]);

  useEffect(() => {
    if (!document || !canvas.current || width === 0) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void document.getPage(pageNumber).then(async (page) => {
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = zoom ?? Math.max(0.25, (width - 16) / natural.width);
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const target = canvas.current!;
      target.width = Math.floor(viewport.width * ratio);
      target.height = Math.floor(viewport.height * ratio);
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      const render = page.render({
        canvas: target,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      task = render;
      const content = await page.getTextContent();
      if (!cancelled)
        setText(
          content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        );
      await render.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, zoom, width]);

  if (error)
    return (
      <p className="bg-base-lightest p-6 text-center text-sm text-base-dark">
        {error}
      </p>
    );
  if (!document)
    return (
      <p className="bg-base-lightest p-6 text-center text-sm text-base-dark">
        Reading the PDF…
      </p>
    );
  const pages = document.numPages;
  const current = zoom ?? 1;
  const step = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? ZOOMS.find((value) => value > current + 0.01)
        : [...ZOOMS].reverse().find((value) => value < current - 0.01);
    if (next) setZoom(next);
  };
  return (
    <div className="grid min-h-0 grid-cols-1 grid-rows-[auto_1fr] gap-2">
      <div
        role="toolbar"
        aria-label="PDF pages and zoom"
        className="flex flex-wrap items-center gap-1"
      >
        <Button
          size="sm"
          variant="plain"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((value) => value - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Previous page
        </Button>
        <span className="px-2 text-sm tabular-nums" aria-live="polite">
          Page {pageNumber} of {pages}
        </span>
        <Button
          size="sm"
          variant="plain"
          disabled={pageNumber >= pages}
          onClick={() => setPageNumber((value) => value + 1)}
        >
          Next page
          <ChevronRight aria-hidden="true" />
        </Button>
        <span className="mx-1 h-5 w-px bg-base-lighter" aria-hidden="true" />
        <Button
          size="sm"
          variant="plain"
          aria-label="Zoom out"
          onClick={() => step(-1)}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="plain"
          aria-label="Zoom in"
          onClick={() => step(1)}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="plain"
          aria-pressed={zoom === null}
          onClick={() => setZoom(null)}
        >
          <MoveHorizontal aria-hidden="true" />
          Fit width
        </Button>
      </div>
      <div
        ref={frame}
        tabIndex={0}
        role="region"
        aria-label={`${title}, page ${pageNumber}`}
        // Relative: the page text for screen readers is absolutely positioned, and must stay
        // inside this scroller rather than stretch the dialog below the page.
        className="relative min-h-0 overflow-auto rounded-md border bg-base-lightest p-2"
      >
        <canvas
          ref={canvas}
          aria-hidden="true"
          className="mx-auto block bg-white"
        />
        <p className="sr-only" data-testid="pdf-page-text">
          {text || 'This page has no text.'}
        </p>
      </div>
    </div>
  );
}
