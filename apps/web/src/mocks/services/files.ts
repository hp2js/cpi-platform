/**
 * File contents for the mock API. Records in the store keep metadata only; the bytes are kept
 * by SHA-256 in memory and, in a browser, in IndexedDB, so uploads survive a reload the way a
 * real object store would. Keying by hash means a reset or a reused record ID can never serve
 * another file's contents.
 */

const memory = new Map<string, Uint8Array<ArrayBuffer>>();
const DB_NAME = 'cpi-mock-files';
const STORE = 'files';

function openDatabase(): Promise<IDBDatabase> | undefined {
  try {
    if (typeof indexedDB === 'undefined') return undefined;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open'));
    });
  } catch {
    return undefined;
  }
}

let database: Promise<IDBDatabase> | undefined;
const connection = () => (database ??= openDatabase());

export async function storeFile(
  sha256: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  memory.set(sha256, bytes);
  try {
    const db = await connection();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(bytes, sha256);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('put'));
    });
  } catch {
    /* storage full or blocked: the file stays available until the page reloads */
  }
}

export async function loadFile(
  sha256: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const cached = memory.get(sha256);
  if (cached) return cached;
  try {
    const db = await connection();
    if (!db) return undefined;
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .get(sha256);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('get'));
    });
    if (!(stored instanceof Uint8Array)) return undefined;
    const bytes = new Uint8Array(stored);
    memory.set(sha256, bytes);
    return bytes;
  } catch {
    return undefined;
  }
}

export { demonstrationPdf } from '@cpi/contracts';
