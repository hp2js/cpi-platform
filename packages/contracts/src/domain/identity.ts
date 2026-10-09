import type {
  FormIssue,
  ReportIdentity,
  ReportIdentityUpdate,
  ReportImage,
  ReportImageSlot,
} from '../draft/index.js';
import { builtinReportImages } from './brand-images.js';

/*
 * Report identity rules (HP2-65), shared by the API and the mock: safe defaults, colour
 * contrast, the official-name guard and the image limits.
 */

/**
 * The demonstration's report identity: Adili Online, with the logo supplied by the Adili V3
 * challenge organizers for this submission, recorded as the authorization. The data stays
 * fictional and the simulation marking and EACC disclaimer stay on every report.
 */
export const defaultReportIdentity: ReportIdentity = {
  organizationName: 'Adili Online',
  reportTitle: 'Annual Corruption Prevention Assessment',
  accentColor: '#520A61',
  foreword:
    'This report sets out each institution’s implementation of its corruption prevention plan for the year, measured against its own accepted plan. It is a simulation with fictional institutions and data.',
  contact: 'reports@adili.example',
  footer:
    'Simulation with fictional institutions and data. Not an official EACC publication.',
  signatory: null,
  authorization:
    'Adili marks supplied by the Adili V3 challenge organizers for use in this submission.',
  logo: {
    id: builtinReportImages['builtin-adili-logo'].id,
    mimeType: builtinReportImages['builtin-adili-logo'].mimeType,
    sizeBytes: builtinReportImages['builtin-adili-logo'].sizeBytes,
    width: builtinReportImages['builtin-adili-logo'].width,
    height: builtinReportImages['builtin-adili-logo'].height,
    sha256: builtinReportImages['builtin-adili-logo'].sha256,
  },
  signature: null,
};

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** Contrast of the accent against white, where it is used for headings and rules. */
export function contrastOnWhite(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Names that would present the report as an official body's (PRD §2, §22). */
const OFFICIAL =
  /\b(EACC|Ethics and Anti[- ]?Corruption Commission|Republic of Kenya|Government of Kenya|PSPMU|Public Service Performance Management|Office of the President)\b/i;

/** Problems with an identity update, each pointing to its field. */
export function reportIdentityIssues(
  update: ReportIdentityUpdate,
): FormIssue[] {
  const issues: FormIssue[] = [];
  const ratio = contrastOnWhite(update.accentColor);
  if (ratio < 4.5)
    issues.push({
      path: 'accentColor',
      message: `This colour has a contrast of ${ratio.toFixed(1)}:1 on white; headings need at least 4.5:1. Choose a darker colour.`,
    });
  // The issuer is named by the organization and the title; a disclaimer may mention EACC.
  const issuer = [
    ['organizationName', update.organizationName],
    ['reportTitle', update.reportTitle],
  ] as const;
  for (const [path, value] of issuer)
    if (OFFICIAL.test(value) && !update.authorization?.trim())
      issues.push({
        path,
        message:
          'This names an official body. Record the authorization to issue in its name first, or use a neutral name.',
      });
  return issues;
}

export const REPORT_IMAGE_LIMITS = { maxBytes: 300 * 1024, maxPixels: 1200 };

/**
 * Checks an uploaded logo or signature: a JPEG, or a PNG without transparency or interlacing
 * (so it embeds in the PDF as is), within the size limits. Returns its dimensions.
 */
export function inspectReportImage(bytes: Uint8Array):
  | {
      ok: true;
      mimeType: ReportImage['mimeType'];
      width: number;
      height: number;
    }
  | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  if (bytes.length > REPORT_IMAGE_LIMITS.maxBytes)
    return fail('Use an image of at most 300 KB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let result:
    | { mimeType: ReportImage['mimeType']; width: number; height: number }
    | undefined;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length > 33 &&
    png.every((byte, index) => bytes.at(index) === byte)
  ) {
    const colourType = bytes.at(25);
    const bitDepth = bytes.at(24);
    const interlace = bytes.at(28);
    if (
      bitDepth !== 8 ||
      (colourType !== 0 && colourType !== 2) ||
      interlace !== 0
    )
      return fail(
        'Use a JPEG, or a PNG without transparency (8-bit colour or greyscale, not interlaced).',
      );
    result = {
      mimeType: 'image/png',
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  } else if (bytes.at(0) === 0xff && bytes.at(1) === 0xd8) {
    // Walk the JPEG segments to the frame header for its size.
    let at = 2;
    while (at + 9 < bytes.length && bytes.at(at) === 0xff) {
      const marker = bytes.at(at + 1) ?? 0;
      const length = view.getUint16(at + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        result = {
          mimeType: 'image/jpeg',
          height: view.getUint16(at + 5),
          width: view.getUint16(at + 7),
        };
        break;
      }
      at += 2 + length;
    }
    if (!result) return fail('This JPEG could not be read.');
  } else return fail('Use a PNG or JPEG image.');
  if (
    result.width > REPORT_IMAGE_LIMITS.maxPixels ||
    result.height > REPORT_IMAGE_LIMITS.maxPixels
  )
    return fail('Use an image of at most 1200 × 1200 pixels.');
  return { ok: true, ...result };
}

/** A one-line summary of what an identity update changed, for the audit log. */
export function summarizeIdentityChange(
  before: ReportIdentity,
  after: ReportIdentityUpdate,
) {
  const fields: [string, unknown, unknown][] = [
    ['organization name', before.organizationName, after.organizationName],
    ['report title', before.reportTitle, after.reportTitle],
    ['accent colour', before.accentColor, after.accentColor],
    ['foreword', before.foreword, after.foreword],
    ['contact details', before.contact, after.contact],
    ['footer', before.footer, after.footer],
    ['signatory', before.signatory, after.signatory],
    ['authorization', before.authorization, after.authorization],
  ];
  const changed = fields
    .filter(([, was, is]) => JSON.stringify(was) !== JSON.stringify(is))
    .map(([label]) => label);
  return changed.length ? `Changed ${changed.join(', ')}` : 'No changes';
}

/** The image in a slot, and the slot's name in words. */
export const reportImageIn = (
  identity: ReportIdentity,
  slot: ReportImageSlot,
) => (slot === 'logo' ? identity.logo : identity.signature);
export const reportImageSlotLabel = (slot: ReportImageSlot) =>
  slot === 'logo' ? 'logo' : 'signature image';
