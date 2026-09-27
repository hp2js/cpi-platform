import { apiErrorSchema } from '@cpi/contracts';
import type { z } from 'zod';
import { ApiError, apiUrl, awaitBeforeRequest } from './api';

/**
 * Multipart upload with progress. fetch cannot report upload progress, so this uses XHR and
 * applies the same error envelope and response validation as `request`.
 */
export function uploadWithProgress<T>(
  path: `/api/${string}`,
  body: FormData,
  schema: z.ZodType<T>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return awaitBeforeRequest().then(() =>
    send(path, body, schema, onProgress, signal),
  );
}

function send<T>(
  path: `/api/${string}`,
  body: FormData,
  schema: z.ZodType<T>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress)
        onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let value: unknown;
      try {
        value = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        value = undefined;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const parsed = apiErrorSchema.safeParse(value);
        reject(
          new ApiError(
            xhr.status,
            parsed.success
              ? parsed.data.message
              : 'The upload failed. Please try again.',
            parsed.success ? (parsed.data.fieldErrors ?? {}) : {},
            parsed.success ? parsed.data.requestId : undefined,
            parsed.success ? parsed.data.code : undefined,
          ),
        );
        return;
      }
      const parsed = schema.safeParse(value);
      if (parsed.success) resolve(parsed.data);
      else
        reject(
          new ApiError(xhr.status, 'The server returned an invalid response.'),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          'The upload was interrupted. Check your connection and try again.',
        ),
      );
    xhr.onabort = () =>
      reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });
}
