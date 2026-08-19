import {
  apiError,
  databaseErrorResponse,
  jsonNoStore,
  parseLimit,
  readJsonObject,
} from "@/db/api";
import { ensureSchema } from "@/db/d1";
import {
  RECORD_KINDS,
  RECORD_SELECT_COLUMNS,
  RECORD_STATUSES,
  REVIEW_FIELDS,
  STRUCTURE_MODES,
  toRecord,
  type RecordKind,
  type RecordRow,
  type RecordStatus,
  type ReviewField,
  type StructureMode,
} from "@/db/records";

const MAX_BODY_BYTES = 64_000;
const MAX_TRANSCRIPT_CHARACTERS = 6_000;
const MAX_CONTEXT_CHARACTERS = 240;
const MAX_STRUCTURED_CHARACTERS = 2_000;
const MAX_TITLE_CHARACTERS = 300;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PILOT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

const POST_KEYS = new Set([
  "clientRequestId",
  "structureMode",
  "mode",
  "participantCode",
  "workerCode",
  "workOrder",
  "product",
  "process",
  "equipment",
  "transcript",
  "title",
  "kind",
  "quantity",
  "defect",
  "symptom",
  "cause",
  "action",
  "result",
  "confidence",
  "needsReview",
  "reviewFields",
  "excludeFromMetrics",
]);

function normalizedStructureMode(value: unknown): StructureMode | null {
  if (value === "live") return "ai";
  return typeof value === "string" &&
    STRUCTURE_MODES.includes(value as StructureMode)
    ? (value as StructureMode)
    : null;
}

function normalizedStatus(value: string | null): RecordStatus | null | undefined {
  if (value === null || value === "") return null;
  const aliases: Record<string, RecordStatus> = {
    pending: "검토 대기",
    approved: "승인",
    rejected: "반려",
  };
  const candidate = aliases[value] ?? value;
  return RECORD_STATUSES.includes(candidate as RecordStatus)
    ? (candidate as RecordStatus)
    : undefined;
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
  details: string[],
) {
  if (typeof value !== "string") {
    details.push(`${field}은(는) 필수 문자열입니다.`);
    return "";
  }
  const normalized = value.trim();
  if (!normalized) details.push(`${field}은(는) 비어 있을 수 없습니다.`);
  if (normalized.length > maximum) {
    details.push(`${field}은(는) ${maximum}자를 초과할 수 없습니다.`);
  }
  return normalized;
}

function optionalString(
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

function reviewFieldsFrom(value: unknown, details: string[]): ReviewField[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > REVIEW_FIELDS.length) {
    details.push("needsReview는 허용된 검토 필드 배열이어야 합니다.");
    return [];
  }
  const normalized = new Set<ReviewField>();
  for (const field of value) {
    if (
      typeof field !== "string" ||
      !REVIEW_FIELDS.includes(field as ReviewField)
    ) {
      details.push(`허용되지 않은 검토 필드입니다: ${String(field)}`);
      continue;
    }
    normalized.add(field as ReviewField);
  }
  return [...normalized];
}

function firstNumber(value: string) {
  const match = value.replaceAll(",", "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function findByClientRequestId(
  database: D1Database,
  clientRequestId: string,
) {
  return database
    .prepare(
      `SELECT ${RECORD_SELECT_COLUMNS}
       FROM records
       WHERE client_request_id = ?`,
    )
    .bind(clientRequestId)
    .first<RecordRow>();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 100, 1_000);
  if (limit === null) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "limit은 1부터 1000 사이의 정수여야 합니다.",
    );
  }

  const requestedMode = url.searchParams.get("structureMode") ??
    url.searchParams.get("mode");
  let modeFilter: StructureMode | "non-sample" | null = null;
  if (requestedMode === "live") modeFilter = "non-sample";
  else if (requestedMode) modeFilter = normalizedStructureMode(requestedMode);
  if (requestedMode && !modeFilter) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "structureMode은 ai, rules, sample 중 하나여야 합니다.",
    );
  }

  const status = normalizedStatus(url.searchParams.get("status"));
  if (status === undefined) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "status 값이 올바르지 않습니다.",
    );
  }

  const includeSamplesValue = url.searchParams.get("includeSamples");
  if (
    includeSamplesValue !== null &&
    includeSamplesValue !== "true" &&
    includeSamplesValue !== "false"
  ) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "includeSamples는 true 또는 false여야 합니다.",
    );
  }
  const includeSamples = includeSamplesValue !== "false";

  try {
    const database = await ensureSchema();
    const result = await database
      .prepare(
        `SELECT ${RECORD_SELECT_COLUMNS}
         FROM records
         WHERE (? IS NULL OR (? = 'non-sample' AND structure_mode != 'sample') OR structure_mode = ?)
           AND (? IS NULL OR status = ?)
           AND (? = 1 OR exclude_from_metrics = 0)
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(
        modeFilter,
        modeFilter,
        modeFilter,
        status,
        status,
        includeSamples ? 1 : 0,
        limit,
      )
      .all<RecordRow>();
    const records = result.results.map(toRecord);
    return jsonNoStore({ ok: true, records, data: records });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const payload = body.value;
  const details = Object.keys(payload)
    .filter((key) => !POST_KEYS.has(key))
    .map((key) => `지원하지 않는 필드입니다: ${key}`);

  const clientRequestId = requiredString(
    payload.clientRequestId,
    "clientRequestId",
    128,
    details,
  );
  if (clientRequestId && !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)) {
    details.push("clientRequestId 형식이 올바르지 않습니다.");
  }

  const rawStructureMode = payload.structureMode ?? payload.mode;
  const structureMode = normalizedStructureMode(rawStructureMode);
  if (!structureMode) {
    details.push("structureMode은 ai, rules, sample 중 하나여야 합니다.");
  } else if (structureMode === "sample") {
    details.push("SAMPLE 기록은 브라우저 로컬 데모 전용이며 공유 서버에 저장할 수 없습니다.");
  }

  if (
    payload.participantCode !== undefined &&
    payload.workerCode !== undefined &&
    payload.participantCode !== payload.workerCode
  ) {
    details.push("participantCode와 workerCode가 서로 다릅니다.");
  }
  const workerCode = requiredString(
    payload.participantCode ?? payload.workerCode,
    "participantCode",
    32,
    details,
  );
  if (workerCode && !PILOT_CODE_PATTERN.test(workerCode)) {
    details.push("participantCode는 영문 대문자·숫자·하이픈·밑줄 조합 3~32자여야 합니다.");
  }
  const workOrder = requiredString(
    payload.workOrder,
    "workOrder",
    MAX_CONTEXT_CHARACTERS,
    details,
  );
  const product = requiredString(
    payload.product,
    "product",
    MAX_CONTEXT_CHARACTERS,
    details,
  );
  const processName = requiredString(
    payload.process,
    "process",
    MAX_CONTEXT_CHARACTERS,
    details,
  );
  const equipment = requiredString(
    payload.equipment,
    "equipment",
    MAX_CONTEXT_CHARACTERS,
    details,
  );
  const transcript = requiredString(
    payload.transcript,
    "transcript",
    MAX_TRANSCRIPT_CHARACTERS,
    details,
  );

  const kind = typeof payload.kind === "string" &&
    RECORD_KINDS.includes(payload.kind as RecordKind)
    ? (payload.kind as RecordKind)
    : null;
  if (!kind) details.push("kind는 문제, 개선, 노하우 중 하나여야 합니다.");

  const quantity = optionalString(
    payload.quantity,
    "quantity",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const defect = optionalString(
    payload.defect,
    "defect",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const symptom = optionalString(
    payload.symptom,
    "symptom",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const cause = optionalString(
    payload.cause,
    "cause",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const action = optionalString(
    payload.action,
    "action",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const result = optionalString(
    payload.result,
    "result",
    MAX_STRUCTURED_CHARACTERS,
    details,
  );
  const title = optionalString(
    payload.title,
    "title",
    MAX_TITLE_CHARACTERS,
    details,
  );

  if (kind === "문제" && !symptom) {
    details.push("문제 기록에는 symptom이 필요합니다.");
  }
  if (kind === "노하우" && !action) {
    details.push("노하우 기록에는 action이 필요합니다.");
  }
  if (kind === "개선" && !symptom && !action && !result) {
    details.push("개선 기록에는 symptom, action, result 중 하나가 필요합니다.");
  }
  const quantityNumber = quantity ? firstNumber(quantity) : null;
  const defectNumber = defect ? firstNumber(defect) : null;
  if (quantity && quantityNumber === null) {
    details.push("quantity를 입력할 때는 숫자를 포함해야 합니다.");
  }
  if (defect && defectNumber === null) {
    details.push("defect를 입력할 때는 숫자를 포함해야 합니다.");
  }
  if (
    quantityNumber !== null &&
    defectNumber !== null &&
    defectNumber > quantityNumber
  ) {
    details.push("defect는 quantity보다 클 수 없습니다.");
  }

  const confidence = payload.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isInteger(confidence) ||
    confidence < 0 ||
    confidence > 100
  ) {
    details.push("confidence는 0부터 100 사이의 정수여야 합니다.");
  }

  const reviewFields = reviewFieldsFrom(
    payload.needsReview ?? payload.reviewFields,
    details,
  );

  if (details.length || !structureMode || !kind || typeof confidence !== "number") {
    return apiError(
      400,
      "INVALID_REQUEST",
      "저장할 현장 기록을 확인해주세요.",
      details,
    );
  }

  const createdAt = new Date().toISOString();
  const recordTitle = (title || `${processName} · ${symptom || kind}`)
    .slice(0, MAX_TITLE_CHARACTERS);
  // Only sample records are excluded. AI and deterministic rules both use
  // actual participant input and therefore count as live MVP evidence.
  const excludeFromMetrics = structureMode === "sample" ? 1 : 0;
  const reviewFieldsJson = JSON.stringify(reviewFields);
  const matchesCreatePayload = (row: RecordRow) =>
    row.structure_mode === structureMode &&
    row.exclude_from_metrics === excludeFromMetrics &&
    row.worker_code === workerCode &&
    row.work_order === workOrder &&
    row.product === product &&
    row.process === processName &&
    row.equipment === equipment &&
    row.transcript === transcript &&
    row.title === recordTitle &&
    row.kind === kind &&
    row.quantity === quantity &&
    row.defect === defect &&
    row.symptom === symptom &&
    row.cause === cause &&
    row.action === action &&
    row.result === result &&
    row.confidence === confidence &&
    row.review_fields_json === reviewFieldsJson;
  const idempotencyConflict = () => apiError(
    409,
    "IDEMPOTENCY_CONFLICT",
    "같은 clientRequestId가 다른 내용에 이미 사용되었습니다. 새 요청 식별자로 다시 저장해주세요.",
  );

  try {
    const database = await ensureSchema();
    const existing = await findByClientRequestId(database, clientRequestId);
    if (existing) {
      if (!matchesCreatePayload(existing)) return idempotencyConflict();
      const record = toRecord(existing);
      return jsonNoStore({ ok: true, record, data: record, deduplicated: true });
    }

    try {
      await database
        .prepare(
          `INSERT INTO records (
            client_request_id, structure_mode, exclude_from_metrics,
            worker_code, work_order, product, process, equipment, transcript,
            title, kind, quantity, defect, symptom, cause, action, result,
            confidence, review_fields_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '검토 대기', ?, ?)`,
        )
        .bind(
          clientRequestId,
          structureMode,
          excludeFromMetrics,
          workerCode,
          workOrder,
          product,
          processName,
          equipment,
          transcript,
          recordTitle,
          kind,
          quantity,
          defect,
          symptom,
          cause,
          action,
          result,
          confidence,
          JSON.stringify(reviewFields),
          createdAt,
          createdAt,
        )
        .run();
    } catch (insertError) {
      // A concurrent retry may win the UNIQUE(client_request_id) race.
      const concurrent = await findByClientRequestId(database, clientRequestId);
      if (concurrent) {
        if (!matchesCreatePayload(concurrent)) return idempotencyConflict();
        const record = toRecord(concurrent);
        return jsonNoStore({ ok: true, record, data: record, deduplicated: true });
      }
      throw insertError;
    }

    const inserted = await findByClientRequestId(database, clientRequestId);
    if (!inserted) throw new Error("INSERTED_RECORD_NOT_FOUND");
    const record = toRecord(inserted);
    return jsonNoStore(
      { ok: true, record, data: record, deduplicated: false },
      { status: 201 },
    );
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
