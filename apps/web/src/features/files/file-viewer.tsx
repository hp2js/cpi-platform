import {
  Download,
  ExternalLink,
  FileQuestion,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import publicSans from '@/assets/fonts/public-sans-latin-wght-normal.woff2';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatBytes } from '@/features/reporting/answers';
import { fetchFile, type FetchedFile } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** What a list already knows about a file; only the ID is required to open it. */
export interface ViewableFile {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  version?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  sha256?: string;
}

const PdfPreview = lazy(() => import('./pdf-preview'));

type Kind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'text' | 'other';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function kindOf(mimeType: string, fileName: string): Kind {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === DOCX || extension === 'docx') return 'docx';
  if (mimeType === XLSX || extension === 'xlsx') return 'xlsx';
  if (
    mimeType.startsWith('text/') ||
    extension === 'csv' ||
    extension === 'txt'
  )
    return 'text';
  return 'other';
}

const typeLabels: Record<Kind, string> = {
  pdf: 'PDF document',
  image: 'Image',
  docx: 'Word document',
  xlsx: 'Excel workbook',
  text: 'Text',
  other: 'File',
};

/** Saves the fetched file under its own name. */
function save(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

const SHEET_ROWS = 200;
const SHEET_COLUMNS = 30;

function SpreadsheetPreview({
  blob,
  initialSheet,
}: {
  blob: Blob;
  initialSheet?: number;
}) {
  const [sheets, setSheets] = useState<
    { sheet: string; data: unknown[][] }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState((initialSheet ?? 1) - 1);
  useEffect(() => {
    let cancelled = false;
    import('read-excel-file/browser')
      .then(({ default: readXlsxFile }) => readXlsxFile(blob))
      .then((result) => {
        if (!cancelled) setSheets(result);
      })
      .catch(() => {
        if (!cancelled)
          setError('This workbook could not be read. Download it to open it.');
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);
  if (error) return <PreviewMessage>{error}</PreviewMessage>;
  if (!sheets) return <PreviewMessage>Reading the workbook…</PreviewMessage>;
  const sheet = sheets[active];
  const rows = sheet?.data.slice(0, SHEET_ROWS) ?? [];
  const width = Math.min(
    SHEET_COLUMNS,
    Math.max(0, ...rows.map((row) => row.length)),
  );
  const cell = (value: unknown) =>
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value === null || value === undefined
        ? ''
        : String(value);
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_1fr] gap-2">
      {sheets.length > 1 && (
        <div role="group" aria-label="Sheets" className="flex flex-wrap gap-1">
          {sheets.map((item, index) => (
            <Button
              key={item.sheet}
              size="sm"
              variant={index === active ? 'default' : 'outline'}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              {item.sheet}
            </Button>
          ))}
        </div>
      )}
      <div className="min-h-0 overflow-auto rounded-md border">
        <Table>
          <TableCaption className="text-left">
            {sheet?.sheet ?? 'Sheet'}: {sheet?.data.length ?? 0} rows
            {(sheet?.data.length ?? 0) > SHEET_ROWS &&
              `, first ${SHEET_ROWS} shown`}
            . Download the workbook for formulas and formatting.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <span className="sr-only">Row</span>
              </TableHead>
              {Array.from({ length: width }, (_, index) => (
                <TableHead key={index} scope="col">
                  {String.fromCharCode(65 + (index % 26)).repeat(
                    Math.floor(index / 26) + 1,
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                <TableHead scope="row" className="text-base-dark">
                  {rowIndex + 1}
                </TableHead>
                {Array.from({ length: width }, (_, index) => (
                  <TableCell key={index} className="whitespace-pre-wrap">
                    {cell(row[index])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Word documents become plain HTML shown in a sandbox: no scripts, no navigation. */
function DocumentPreview({ blob, title }: { blob: Blob; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('mammoth'), blob.arrayBuffer()])
      .then(([mammoth, arrayBuffer]) => mammoth.convertToHtml({ arrayBuffer }))
      .then((result) => {
        if (!cancelled) setHtml(result.value);
      })
      .catch(() => {
        if (!cancelled)
          setError('This document could not be read. Download it to open it.');
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);
  if (error) return <PreviewMessage>{error}</PreviewMessage>;
  if (html === null)
    return <PreviewMessage>Reading the document…</PreviewMessage>;
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title.replace(/[<&]/g, '')}</title><style>
    @font-face{font-family:'Public Sans';font-weight:300 700;src:url('${new URL(publicSans, window.location.href).href}') format('woff2')}body{font:16px/1.62 'Public Sans',system-ui,sans-serif;color:#1b1b1b;background:#fff;max-width:48rem;margin:0 auto;padding:2rem}
    table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}
  </style></head><body>${html || '<p><em>The document has no text.</em></p>'}</body></html>`;
  return (
    <iframe
      title={`${title} preview`}
      sandbox=""
      srcDoc={page}
      className="h-full min-h-96 w-full rounded-md border bg-white"
    />
  );
}

function TextPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void blob
      .slice(0, 1024 * 1024)
      .text()
      .then((value) => {
        if (!cancelled) setText(value);
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return (
    <pre
      tabIndex={0}
      className="h-full min-h-96 overflow-auto rounded-md border bg-base-lightest p-4 text-sm whitespace-pre-wrap"
    >
      {text ?? 'Reading the file…'}
    </pre>
  );
}

function PreviewMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 bg-base-lightest p-6 text-center text-sm text-base-dark">
      {children}
    </div>
  );
}

function Preview({
  file,
  url,
  kind,
  title,
  page,
}: {
  file: FetchedFile;
  url: string;
  kind: Kind;
  title: string;
  page?: number;
}) {
  const [actualSize, setActualSize] = useState(false);
  switch (kind) {
    case 'pdf':
      return (
        <Suspense
          fallback={<PreviewMessage>Loading the PDF viewer…</PreviewMessage>}
        >
          <PdfPreview blob={file.blob} title={title} page={page} />
        </Suspense>
      );
    case 'image':
      return (
        <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_1fr] gap-2">
          <div>
            <Button
              size="sm"
              variant="plain"
              aria-pressed={actualSize}
              onClick={() => setActualSize((current) => !current)}
            >
              {actualSize ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
              {actualSize ? 'Fit to window' : 'Actual size'}
            </Button>
          </div>
          <div
            tabIndex={0}
            role="region"
            aria-label="Image"
            className="min-h-0 overflow-auto rounded-md border bg-base-lightest p-2"
          >
            <img
              src={url}
              alt={title}
              className={cn(
                'mx-auto',
                actualSize
                  ? 'max-w-none'
                  : 'max-h-full max-w-full object-contain',
              )}
            />
          </div>
        </div>
      );
    case 'docx':
      return <DocumentPreview blob={file.blob} title={title} />;
    case 'xlsx':
      return <SpreadsheetPreview blob={file.blob} initialSheet={page} />;
    case 'text':
      return <TextPreview blob={file.blob} />;
    default:
      return (
        <PreviewMessage>
          <FileQuestion className="size-6" aria-hidden="true" />
          This file type cannot be previewed here. Download it to open it.
        </PreviewMessage>
      );
  }
}

function ViewerBody({
  file: item,
  page,
}: {
  file: ViewableFile;
  page?: number;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; file: FetchedFile; url: string }
  >({ status: 'loading' });
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchFile(`/api/evidence/${encodeURIComponent(item.id)}/file`)
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file.blob);
        setState({ status: 'ready', file, url });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'The file could not be opened.',
          });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  if (state.status === 'loading')
    return <PreviewMessage>Opening the file…</PreviewMessage>;
  if (state.status === 'error')
    return (
      <p role="alert" className="text-sm text-error-dark">
        {state.message}
      </p>
    );
  const { file, url } = state;
  const fileName = file.fileName ?? item.fileName;
  const kind = kindOf(file.mimeType, fileName);
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_auto_1fr] gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => save(url, fileName)}>
          <Download aria-hidden="true" />
          Download
          <span className="sr-only"> {fileName}</span>
        </Button>
        {(kind === 'pdf' || kind === 'image') && (
          <Button
            size="sm"
            variant="plain"
            onClick={() => window.open(url, '_blank', 'noopener')}
          >
            <ExternalLink aria-hidden="true" />
            Open in a new tab
          </Button>
        )}
      </div>
      {file.demonstration ? (
        <p role="note" className="rounded-md bg-primary-lighter p-3 text-sm">
          Demonstration copy: the mock has no stored contents for this file, so
          a labelled stand-in is shown. Uploaded files open as uploaded.
        </p>
      ) : (
        <span />
      )}
      <Preview
        file={file}
        url={url}
        kind={kind}
        title={item.fileName}
        page={page}
      />
    </div>
  );
}

/**
 * A stored file's name, opening an in-page viewer with a preview for PDF, images, Word,
 * Excel and text, and a download under the original name. Access follows the API: a file the
 * user may not see fails as not found.
 */
export function FileViewer({
  file,
  className,
  page,
  label,
}: {
  file: ViewableFile;
  className?: string;
  /** Opens at this PDF page or workbook sheet (1-based). */
  page?: number;
  /** Trigger text instead of the file name, which stays available to screen readers. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(file.mimeType ?? '', file.fileName);
  const details = [
    typeLabels[kind],
    file.sizeBytes !== undefined && formatBytes(file.sizeBytes),
    file.version && `version ${file.version}`,
    file.uploadedBy &&
      `uploaded by ${file.uploadedBy}${file.uploadedAt ? `, ${formatDateTime(file.uploadedAt)}` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn('usa-link text-left font-bold break-all', className)}
        >
          {label ?? file.fileName}
          <span className="sr-only">
            {label ? ` (${file.fileName})` : ' (view or download)'}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="grid h-[90svh] max-h-[90svh] grid-cols-1 grid-rows-[auto_1fr] p-4 tablet:max-w-desktop tablet:p-6">
        <DialogHeader className="min-w-0 pr-8 text-left">
          <DialogTitle className="break-all">{file.fileName}</DialogTitle>
          <DialogDescription>
            {details}
            {file.sha256 && (
              <span className="block truncate font-mono text-xs">
                SHA-256 {file.sha256}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {open && <ViewerBody file={file} page={page} />}
      </DialogContent>
    </Dialog>
  );
}
