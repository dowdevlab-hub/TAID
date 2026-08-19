export const STRUCTURE_MODES = ["ai", "rules", "sample"] as const;
export const RECORD_STATUSES = ["검토 대기", "승인", "반려"] as const;
export const FINAL_RECORD_STATUSES = ["승인", "반려"] as const;
export const RECORD_KINDS = ["문제", "개선", "노하우"] as const;
export const REVIEW_FIELDS = [
  "kind",
  "process",
  "equipment",
  "quantity",
  "defect",
  "symptom",
  "cause",
  "action",
  "result",
] as const;

export type StructureMode = (typeof STRUCTURE_MODES)[number];
export type RecordStatus = (typeof RECORD_STATUSES)[number];
export type FinalRecordStatus = (typeof FINAL_RECORD_STATUSES)[number];
export type RecordKind = (typeof RECORD_KINDS)[number];
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const RECORD_SELECT_COLUMNS = `
  id, client_request_id, structure_mode, exclude_from_metrics,
  worker_code, work_order, product, process, equipment, transcript,
  title, kind, quantity, defect, symptom, cause, action, result,
  confidence, review_fields_json, status, reviewer_code, review_note,
  rejection_reason, reviewed_at, views, created_at, updated_at
`;

export type RecordRow = {
  id: number;
  client_request_id: string;
  structure_mode: StructureMode;
  exclude_from_metrics: number;
  worker_code: string;
  work_order: string;
  product: string;
  process: string;
  equipment: string;
  transcript: string;
  title: string;
  kind: RecordKind;
  quantity: string;
  defect: string;
  symptom: string;
  cause: string;
  action: string;
  result: string;
  confidence: number;
  review_fields_json: string;
  status: RecordStatus;
  reviewer_code: string | null;
  review_note: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  views: number;
  created_at: string;
  updated_at: string;
};

function readReviewFields(raw: string): ReviewField[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is ReviewField =>
        typeof value === "string" &&
        REVIEW_FIELDS.includes(value as ReviewField),
    );
  } catch {
    return [];
  }
}

export function toRecord(row: RecordRow) {
  const reviewFields = readReviewFields(row.review_fields_json);
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    mode: row.structure_mode === "sample" ? "sample" : "live",
    structureMode: row.structure_mode,
    excludeFromMetrics: row.exclude_from_metrics === 1,
    workerCode: row.worker_code,
    participantCode: row.worker_code,
    author: row.worker_code,
    workOrder: row.work_order,
    product: row.product,
    process: row.process,
    equipment: row.equipment,
    transcript: row.transcript,
    sourceAnswers: [row.transcript],
    title: row.title,
    kind: row.kind,
    quantity: row.quantity,
    defect: row.defect,
    symptom: row.symptom,
    cause: row.cause,
    action: row.action,
    result: row.result,
    confidence: row.confidence,
    needsReview: reviewFields,
    reviewFields,
    status: row.status,
    reviewerCode: row.reviewer_code,
    reviewNote: row.review_note,
    rejectionReason: row.rejection_reason,
    reviewedAt: row.reviewed_at,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
