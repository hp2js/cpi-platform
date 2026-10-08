import {
  foundationsSchema,
  type FoundationKind,
  type FoundationReviewRequest,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { uploadWithProgress } from '@/lib/upload';

export const foundationKeys = {
  all: (institutionId: string) => ['foundations', institutionId] as const,
};

const path = (institutionId: string) =>
  `/api/institutions/${encodeURIComponent(institutionId)}/foundations` as const;

export const foundationsQuery = (institutionId: string) =>
  queryOptions({
    queryKey: foundationKeys.all(institutionId),
    queryFn: ({ signal }) =>
      request(path(institutionId), foundationsSchema, { signal }),
  });

export function uploadFoundation(
  institutionId: string,
  fields: {
    file: File;
    kind: FoundationKind;
    approvalReference: string;
    effectiveFrom: string;
    claimedChecks: boolean[];
  },
  onProgress?: (fraction: number) => void,
) {
  const body = new FormData();
  body.append('file', fields.file);
  body.append('kind', fields.kind);
  body.append('approvalReference', fields.approvalReference);
  body.append('effectiveFrom', fields.effectiveFrom);
  body.append('claimedChecks', JSON.stringify(fields.claimedChecks));
  return uploadWithProgress(
    path(institutionId),
    body,
    foundationsSchema,
    onProgress,
  );
}

export const withdrawFoundation = (versionId: string, reason: string) =>
  request(
    `/api/foundation-versions/${encodeURIComponent(versionId)}/withdraw`,
    foundationsSchema,
    { method: 'POST', json: { reason } },
  );

export const reviewFoundation = (
  institutionId: string,
  kind: FoundationKind,
  review: FoundationReviewRequest,
) =>
  request(`${path(institutionId)}/${kind}/review`, foundationsSchema, {
    method: 'PUT',
    json: review,
  });

/** No valid document at the cutoff: an explicit 0 of 4 with a reason (AT28). */
export const recordUnsupported = (
  institutionId: string,
  kind: FoundationKind,
  reason: string,
) =>
  request(`${path(institutionId)}/${kind}/unsupported`, foundationsSchema, {
    method: 'POST',
    json: { reason },
  });
