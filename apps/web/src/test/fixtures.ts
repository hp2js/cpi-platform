/** Minimal byte signatures for synthetic uploads in tests. */
export const pdfBytes = () =>
  new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
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
