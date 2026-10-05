/** Minimal files that pass the upload checks; `label` makes their contents (and hash) differ. */
export const pdfBytes = (label = '1.7') =>
  new TextEncoder().encode(`%PDF-${label}\n%%EOF\n`);
export const exeBytes = () => new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

export function uploadForm(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  category: string,
) {
  const body = new FormData();
  body.append('file', new File([bytes], name));
  body.append('category', category);
  return body;
}
