/*
 * A small, dependency-free writer for document-grade report PDFs (HP2-64), shared by the API
 * and the development mock so both produce the same document from the same published result.
 *
 * The output is a tagged PDF: a real text layer in the standard Helvetica fonts, a structure
 * tree (headings, paragraphs, tables with header cells) in reading order, the document title
 * shown by viewers and the language set. Running headers and footers are marked as artifacts,
 * so assistive technology reads the content once.
 */

export type PdfBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | {
      kind: 'paragraph';
      text: string;
      size?: number;
      bold?: boolean;
      muted?: boolean;
    }
  | {
      kind: 'table';
      header: string[];
      rows: string[][];
      /** Relative column widths; they are scaled to the text width. */
      widths: number[];
    }
  | { kind: 'pageBreak' }
  /** An image (a logo or signature), tagged as a figure with its alternative text. */
  | { kind: 'image'; image: PdfImage; alt: string; height: number };

/** A JPEG, or a PNG without transparency or interlacing, embedded as it is. */
export interface PdfImage {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

/** The PNG's colour channels and its compressed pixel data (all IDAT chunks, in order). */
function pngData(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colors = bytes[25] === 0 ? 1 : 3;
  const parts: Uint8Array[] = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    if (type === 'IDAT') parts.push(bytes.slice(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const data = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  return { colors, data };
}

const binary = (bytes: Uint8Array) => {
  let out = '';
  for (let index = 0; index < bytes.length; index += 8192)
    out += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return out;
};

export interface PdfDocument {
  /** Shown as the window title by viewers, and first on the cover. */
  title: string;
  /** BCP 47 language, e.g. `en-GB`. */
  lang: string;
  author: string;
  subject: string;
  /** Running header on every page, e.g. the report title and institution. */
  header: string;
  /** Marking on every page, e.g. "Simulation — not official EACC scoring". */
  marking: string;
  /** Footer text before the page number, e.g. the document reference and generation date. */
  footer: string;
  /** Fixed creation date (the publication date), so the same result gives the same document. */
  createdAt: string;
  /** Accent colour for headings and rules, as `#rrggbb`. */
  accent?: string;
  blocks: PdfBlock[];
}

/* Fonts: Helvetica and Helvetica-Bold advance widths (Adobe AFM) for WinAnsi 32–126. */
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

/** Typographic characters WinAnsi has outside Latin-1, and their byte codes. */
const WIN_ANSI: Record<string, number> = {
  '–': 0x96, // en dash
  '—': 0x97, // em dash
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95, // bullet
  '…': 0x85, // ellipsis
};
const REPLACEMENTS: Record<string, string> = { '→': '->', ' ': ' ' };

/** Text as WinAnsi byte codes; characters it cannot show become `?`. */
function encode(text: string): number[] {
  const codes: number[] = [];
  for (const raw of text) {
    const character = REPLACEMENTS[raw] ?? raw;
    for (const part of character) {
      const mapped = WIN_ANSI[part];
      const code = part.codePointAt(0)!;
      if (mapped !== undefined) codes.push(mapped);
      else
        codes.push(
          (code >= 32 && code <= 126) || (code >= 160 && code <= 255)
            ? code
            : 63,
        );
    }
  }
  return codes;
}

function width(text: string, size: number, bold: boolean) {
  const table = bold ? BOLD : REGULAR;
  let total = 0;
  for (const code of encode(text))
    total += code >= 32 && code <= 126 ? table[code - 32]! : 556;
  return (total * size) / 1000;
}

/** A PDF string literal for WinAnsi text. */
function literal(text: string) {
  let out = '(';
  for (const code of encode(text)) {
    if (code === 0x28 || code === 0x29 || code === 0x5c)
      out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126)
      out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

/** PDF text strings for metadata: UTF-16BE with a byte-order mark, so any title survives. */
function textString(text: string) {
  let hex = 'FEFF';
  for (const unit of text)
    for (let i = 0; i < unit.length; i += 1)
      hex += unit.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** Words wrapped to `maxWidth`; a word longer than the line is broken. */
function wrap(text: string, size: number, bold: boolean, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (width(line, size, bold) > maxWidth) {
        let cut = line.length - 1;
        while (cut > 1 && width(line.slice(0, cut), size, bold) > maxWidth)
          cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

const rgb = (hex: string | undefined) => {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!match) return '0.1 0.1 0.1';
  return match
    .slice(1)
    .map((part) => (parseInt(part, 16) / 255).toFixed(3))
    .join(' ');
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 56, right: 56, top: 92, bottom: 72 };
const TEXT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

interface StructElement {
  type: string;
  page?: number;
  mcid?: number;
  alt?: string;
  children: StructElement[];
}

/** Renders the document; the same input always gives the same bytes. */
export function renderPdf(document: PdfDocument): Uint8Array {
  const pages: string[][] = [];
  const images: { name: string; image: PdfImage; page: number }[] = [];
  const pageMcids: StructElement[][] = [];
  const root: StructElement = { type: 'Document', children: [] };
  let page = -1;
  let y = 0;
  let mcid = 0;

  const newPage = () => {
    pages.push([]);
    pageMcids.push([]);
    page += 1;
    mcid = 0;
    y = PAGE.height - MARGIN.top;
  };
  const ensure = (height: number) => {
    if (page < 0 || y - height < MARGIN.bottom) newPage();
  };
  /** Draws tagged text lines and returns the element that holds them. */
  const textElement = (
    type: string,
    lines: string[],
    x: number,
    size: number,
    bold: boolean,
    color: string,
    leading: number,
    parent: StructElement,
  ) => {
    const element: StructElement = { type, page, mcid, children: [] };
    parent.children.push(element);
    pageMcids[page]!.push(element);
    const ops = [
      `/${type} <</MCID ${mcid}>> BDC`,
      'BT',
      `${color} rg`,
      `/${bold ? 'F2' : 'F1'} ${size} Tf`,
    ];
    lines.forEach((line, index) => {
      ops.push(
        `1 0 0 1 ${x.toFixed(2)} ${(y - size - index * leading).toFixed(2)} Tm`,
      );
      ops.push(`${literal(line)} Tj`);
    });
    ops.push('ET', 'EMC');
    pages[page]!.push(ops.join('\n'));
    mcid += 1;
    return element;
  };

  for (const block of document.blocks) {
    if (block.kind === 'image') {
      const height = block.height;
      const width = (block.image.width / block.image.height) * height;
      ensure(height + 8);
      const name = `Im${images.length + 1}`;
      images.push({ name, image: block.image, page });
      const element: StructElement = {
        type: 'Figure',
        page,
        mcid,
        alt: block.alt,
        children: [],
      };
      root.children.push(element);
      pageMcids[page]!.push(element);
      pages[page]!.push(
        `/Figure <</MCID ${mcid}>> BDC\nq ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${MARGIN.left} ${(y - height).toFixed(2)} cm /${name} Do Q\nEMC`,
      );
      mcid += 1;
      y -= height + 8;
      continue;
    }
    if (block.kind === 'pageBreak') {
      if (page < 0 || y < PAGE.height - MARGIN.top) newPage();
      continue;
    }
    if (block.kind === 'heading') {
      const size = block.level === 1 ? 20 : block.level === 2 ? 14 : 11.5;
      const leading = size * 1.25;
      const lines = wrap(block.text, size, true, TEXT_WIDTH);
      // Keep a heading with at least two lines of what follows.
      ensure(lines.length * leading + 40);
      y -= block.level === 1 ? 0 : 8;
      textElement(
        `H${block.level}`,
        lines,
        MARGIN.left,
        size,
        true,
        rgb(document.accent),
        leading,
        root,
      );
      y -= lines.length * leading + 6;
      continue;
    }
    if (block.kind === 'paragraph') {
      const size = block.size ?? 10;
      const leading = size * 1.4;
      const bold = block.bold ?? false;
      const lines = wrap(block.text, size, bold, TEXT_WIDTH);
      let start = 0;
      while (start < lines.length) {
        ensure(leading * Math.min(2, lines.length - start));
        const fit = Math.max(1, Math.floor((y - MARGIN.bottom) / leading));
        const chunk = lines.slice(start, start + fit);
        textElement(
          'P',
          chunk,
          MARGIN.left,
          size,
          bold,
          block.muted ? '0.33 0.33 0.33' : '0.1 0.1 0.1',
          leading,
          root,
        );
        y -= chunk.length * leading;
        start += chunk.length;
      }
      y -= 6;
      continue;
    }
    // Tables: header cells tagged TH, repeated on each page; rows never split across pages.
    const total = block.widths.reduce((sum, value) => sum + value, 0);
    const columns = block.widths.map((value) => (value / total) * TEXT_WIDTH);
    const size = 8.5;
    const leading = size * 1.3;
    const padding = 4;
    const table: StructElement = { type: 'Table', children: [] };
    root.children.push(table);
    const cellLines = (cells: string[], bold: boolean) =>
      cells.map((cell, index) =>
        wrap(cell, size, bold, columns[index]! - padding * 2),
      );
    const drawRow = (cells: string[], header: boolean) => {
      const lines = cellLines(cells, header);
      const height =
        Math.max(...lines.map((cell) => cell.length)) * leading + padding * 2;
      const row: StructElement = { type: 'TR', children: [] };
      table.children.push(row);
      let x = MARGIN.left;
      if (header)
        pages[page]!.push(
          `/Artifact BMC\n0.94 0.94 0.94 rg\n${MARGIN.left} ${(y - height).toFixed(2)} ${TEXT_WIDTH.toFixed(2)} ${height.toFixed(2)} re f\nEMC`,
        );
      lines.forEach((cell, index) => {
        const saved = y;
        y -= padding;
        textElement(
          header ? 'TH' : 'TD',
          cell.length ? cell : [''],
          x + padding,
          size,
          header,
          '0.1 0.1 0.1',
          leading,
          row,
        );
        y = saved;
        x += columns[index]!;
      });
      pages[page]!.push(
        `/Artifact BMC\n0.75 0.75 0.75 RG 0.5 w\n${MARGIN.left} ${(y - height).toFixed(2)} m ${(MARGIN.left + TEXT_WIDTH).toFixed(2)} ${(y - height).toFixed(2)} l S\nEMC`,
      );
      y -= height;
    };
    const headerHeight =
      Math.max(...cellLines(block.header, true).map((cell) => cell.length)) *
        leading +
      padding * 2;
    ensure(headerHeight * 2);
    drawRow(block.header, true);
    for (const cells of block.rows) {
      const height =
        Math.max(...cellLines(cells, false).map((cell) => cell.length)) *
          leading +
        padding * 2;
      if (y - height < MARGIN.bottom) {
        newPage();
        drawRow(block.header, true);
      }
      drawRow(cells, false);
    }
    y -= 10;
  }
  if (page < 0) newPage();

  // Running header, marking and footer on every page, as artifacts.
  const count = pages.length;
  pages.forEach((content, index) => {
    const header = [
      '/Artifact <</Type /Pagination /Subtype /Header>> BDC',
      `${rgb(document.accent)} RG 1 w`,
      `${MARGIN.left} ${PAGE.height - 62} m ${PAGE.width - MARGIN.right} ${PAGE.height - 62} l S`,
      'BT',
      '0.2 0.2 0.2 rg',
      '/F2 8.5 Tf',
      `1 0 0 1 ${MARGIN.left} ${PAGE.height - 44} Tm`,
      `${literal(wrap(document.header, 8.5, true, TEXT_WIDTH)[0] ?? '')} Tj`,
      '/F1 8 Tf',
      `1 0 0 1 ${MARGIN.left} ${PAGE.height - 56} Tm`,
      `${literal(wrap(document.marking, 8, false, TEXT_WIDTH)[0] ?? '')} Tj`,
      'ET',
      'EMC',
    ];
    const pageLabel = `Page ${index + 1} of ${count}`;
    const footer = [
      '/Artifact <</Type /Pagination /Subtype /Footer>> BDC',
      'BT',
      '0.33 0.33 0.33 rg',
      '/F1 7.5 Tf',
      `1 0 0 1 ${MARGIN.left} 40 Tm`,
      `${literal(wrap(document.footer, 7.5, false, TEXT_WIDTH - 70)[0] ?? '')} Tj`,
      `1 0 0 1 ${(PAGE.width - MARGIN.right - width(pageLabel, 7.5, false)).toFixed(2)} 40 Tm`,
      `${literal(pageLabel)} Tj`,
      '1 0 0 1 56 28 Tm',
      `${literal(wrap(document.marking, 7.5, false, TEXT_WIDTH)[0] ?? '')} Tj`,
      'ET',
      'EMC',
    ];
    pages[index] = [...header, ...content, ...footer];
  });

  // Objects: 1 catalog, 2 pages, 3–4 fonts, 5 info, 6 struct tree root, 7 parent tree, then
  // per page a page and its content stream, then the structure elements.
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pagesObject = add('');
  const regular = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const bold = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const date = `D:${new Date(document.createdAt).toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  const info = add(
    `<< /Title ${textString(document.title)} /Author ${textString(document.author)} /Subject ${textString(document.subject)} /Creator (CPI Platform) /Producer (CPI Platform report writer) /CreationDate (${date}) /ModDate (${date}) >>`,
  );
  const structRoot = add('');
  const parentTree = add('');
  const imageObjects = images.map(({ name, image, page: on }) => {
    const common = `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /BitsPerComponent 8`;
    if (image.mimeType === 'image/jpeg') {
      const data = binary(image.bytes);
      return {
        name,
        on,
        number: add(
          `<< ${common} /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${data.length} >>\nstream\n${data}\nendstream`,
        ),
      };
    }
    const { colors, data: pixels } = pngData(image.bytes);
    const data = binary(pixels);
    return {
      name,
      on,
      number: add(
        `<< ${common} /ColorSpace ${colors === 1 ? '/DeviceGray' : '/DeviceRGB'} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${image.width} >> /Length ${data.length} >>\nstream\n${data}\nendstream`,
      ),
    };
  });
  const pageObjects: number[] = [];
  for (const [index, content] of pages.entries()) {
    const stream = content.join('\n');
    const contentObject = add(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    const xobjects = imageObjects.filter((image) => image.on === index);
    const xobject = xobjects.length
      ? ` /XObject << ${xobjects.map((image) => `/${image.name} ${image.number} 0 R`).join(' ')} >>`
      : '';
    pageObjects.push(
      add(
        `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${xobject} >> /Contents ${contentObject} 0 R /StructParents ${index} /Tabs /S >>`,
      ),
    );
  }
  // Structure elements, depth first; each knows its object number and parent.
  const numbers = new Map<StructElement, number>();
  const reserve = (element: StructElement) => {
    numbers.set(element, add(''));
    element.children.forEach(reserve);
  };
  reserve(root);
  const write = (element: StructElement, parent: number) => {
    const number = numbers.get(element)!;
    const kids =
      element.mcid !== undefined
        ? `<< /Type /MCR /Pg ${pageObjects[element.page!]} 0 R /MCID ${element.mcid} >>`
        : `[${element.children.map((child) => `${numbers.get(child)} 0 R`).join(' ')}]`;
    const page =
      element.page !== undefined ? ` /Pg ${pageObjects[element.page]} 0 R` : '';
    const alt = element.alt ? ` /Alt ${textString(element.alt)}` : '';
    objects[number - 1] =
      `<< /Type /StructElem /S /${element.type} /P ${parent} 0 R${page}${alt} /K ${kids} >>`;
    element.children.forEach((child) => write(child, number));
  };
  write(root, structRoot);
  objects[structRoot - 1] =
    `<< /Type /StructTreeRoot /K ${numbers.get(root)} 0 R /ParentTree ${parentTree} 0 R /ParentTreeNextKey ${pages.length} >>`;
  objects[parentTree - 1] = `<< /Nums [${pageMcids
    .map(
      (elements, index) =>
        `${index} [${elements.map((element) => `${numbers.get(element)} 0 R`).join(' ')}]`,
    )
    .join(' ')}] >>`;
  objects[pagesObject - 1] =
    `<< /Type /Pages /Kids [${pageObjects.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjects.length} >>`;
  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pagesObject} 0 R /StructTreeRoot ${structRoot} 0 R /MarkInfo << /Marked true >> /Lang ${textString(document.lang)} /ViewerPreferences << /DisplayDocTitle true >> >>`;

  // Byte offsets: every character written is one byte (content streams escape the rest).
  let out = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let index = 0; index < out.length; index += 1)
    bytes[index] = out.charCodeAt(index) & 0xff;
  return bytes;
}
