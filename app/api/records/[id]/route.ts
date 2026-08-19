import {
  apiError,
  databaseErrorResponse,
  jsonNoStore,
  readJsonObject,
} from "@/db/api";
import { ensureSchema } from "@/db/d1";
import {
  FINAL_RECORD_STATUSES,
  RECORD_SELECT_COLUMNS,
  toRecord,
  type FinalRecordStatus,
  type RecordRow,
} from "@/db/records";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const PATCH_KEYS = new Set([
  "status",
  "decision",
  "reviewerCode",
  "reviewNote",
  "rejectionReason",
]);
const PILOT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

function normalizeDecision(value: unknown): FinalRecordStatus | null {
  const aliases: Record<string, FinalRecordStatus> = {
    approved: "승인",
    rejected: "반려",
  };
  if (typeof value !== "string") return null;
  const candidate = aliases[value] ?? value;
  return FINAL_RECORD_STATUSES.includes(candidate as FinalRecordStatus)
    ? (candidate as FinalRecordStatus)
    : null;
}

function boundedRequiredString(
  value: unknown,
  field: string,
  maximum: number,
  details: string[],
) {
  if (typeof value !== "string" || !value.trim()) {
    details.push(`${field}은(는) 필수 문자열입니다.`);
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    details.push(`${field}은(는) ${maximum}자를 초과할 수 없습니다.`);
  }
  return normalized;
}

function boundedOptionalString(
  value: unknown,
  field: string,
  maximum: number,
  details: string[],
) {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    details.push(`${field}은(는) 문자열이어야 합니다.`);
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    details.push(`${field}은(는) ${maximum}자를 초과할 수 없습니다.`);
  }
  return normalized;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id: rawId } = await context.params;
  if (!/^\d+$/.test(rawId)) {
    return apiError(400, "INVALID_REQUEST", "레코드 ID가 올바르지 않습니다.");
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return apiError(400, "INVALID_REQUEST", "레코드 ID가 올바르지 않습니다.");
  }

  const body = await readJsonObject(request, 8_000);
  if (!body.ok) return body.response;
  const payload = body.value;
  const details = Object.keys(payload)
    .filter((key) => !PATCH_KEYS.has(key))
    .map((key) => `지원하지 않는 필드입니다: ${key}`);

  const status = normalizeDecision(payload.status ?? payload.decision);
  if (!status) {
    details.push("status는 승인/반려 또는 approved/rejected여야 합니다.");
  }
  const reviewerCode = boundedRequiredString(
    payload.reviewerCode,
    "reviewerCode",
    32,
    details,
  );
  if (reviewerCode && !PILOT_CODE_PATTERN.test(reviewerCode)) {
    details.push("reviewerCode는 영문 대문자·숫자·하이픈·밑줄 조합 3~32자여야 합니다.");
  }
  const reviewNote = boundedOptionalString(
    payload.reviewNote,
    "reviewNote",
    1_000,
    details,
  );
  let rejectionReason = boundedOptionalString(
    payload.rejectionReason,
    "rejectionReason",
    1_000,
    details,
  );
  if (status === "반려" && !rejectionReason) {
    details.push("반려 시 rejectionReason이 필요합니다.");
  }
  if (status === "승인") rejectionReason = "";

  if (details.length || !status) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "검토 결정을 확인해주세요.",
      details,
    );
  }

  const reviewedAt = new Date().toISOString();
  try {
    const database = await ensureSchema();
    const update = await database
      .prepare(
        `UPDATE records
         SET status = ?, reviewer_code = ?, review_note = ?,
             rejection_reason = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ? AND status = '검토 대기'`,
      )
      .bind(
        status,
        reviewerCode,
        reviewNote || null,
        rejectionReason || null,
        reviewedAt,
        reviewedAt,
        id,
      )
      .run();

    if (Number(update.meta.changes ?? 0) === 0) {
      const current = await database
        .prepare(
          `SELECT ${RECORD_SELECT_COLUMNS}
           FROM records
           WHERE id = ?`,
        )
        .bind(id)
        .first<RecordRow>();
      if (!current) {
        return apiError(404, "NOT_FOUND", "현장 기록을 찾을 수 없습니다.");
      }
      if (
        current.status === status &&
        current.reviewer_code === reviewerCode &&
        (current.review_note ?? "") === reviewNote &&
        (current.rejection_reason ?? "") === rejectionReason
      ) {
        const record = toRecord(current);
        return jsonNoStore({ ok: true, record, data: record, deduplicated: true });
      }
      return apiError(
        409,
        "REVIEW_ALREADY_DECIDED",
        "이미 검토가 완료된 기록은 다시 변경할 수 없습니다.",
      );
    }

    const updated = await database
      .prepare(
        `SELECT ${RECORD_SELECT_COLUMNS}
         FROM records
         WHERE id = ?`,
      )
      .bind(id)
      .first<RecordRow>();
    if (!updated) throw new Error("UPDATED_RECORD_NOT_FOUND");
    const record = toRecord(updated);
    return jsonNoStore({ ok: true, record, data: record });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
