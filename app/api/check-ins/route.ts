import {
  apiError,
  databaseErrorResponse,
  jsonNoStore,
  parseLimit,
  readJsonObject,
} from "@/db/api";
import { toCheckIn, type CheckInRow } from "@/db/check-ins";
import { ensureSchema } from "@/db/d1";

const POST_KEYS = new Set([
  "participantKey",
  "participantCode",
  "workOrder",
  "periodKey",
  "product",
  "process",
  "equipment",
  "durationSeconds",
]);

const CHECK_IN_SELECT_COLUMNS = `
  id, participant_key, work_order, period_key, product, process,
  equipment, duration_seconds, created_at, updated_at
`;
const PILOT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

function isDayPeriodKey(value: string) {
  const match = /^day-(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function requiredString(
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

async function findCheckIn(
  database: D1Database,
  participantKey: string,
  workOrder: string,
  periodKey: string,
) {
  return database
    .prepare(
      `SELECT ${CHECK_IN_SELECT_COLUMNS}
       FROM check_ins
       WHERE participant_key = ? AND work_order = ? AND period_key = ?`,
    )
    .bind(participantKey, workOrder, periodKey)
    .first<CheckInRow>();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit === null) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "limit은 1부터 250 사이의 정수여야 합니다.",
    );
  }

  const periodKey = url.searchParams.get("periodKey")?.trim() || null;
  const participantKey = (
    url.searchParams.get("participantKey") ??
    url.searchParams.get("participantCode")
  )?.trim() || null;
  const workOrder = url.searchParams.get("workOrder")?.trim() || null;
  if (
    (periodKey && !isDayPeriodKey(periodKey)) ||
    (participantKey && !PILOT_CODE_PATTERN.test(participantKey)) ||
    (workOrder && workOrder.length > 240)
  ) {
    return apiError(400, "INVALID_REQUEST", "조회 조건 형식이 올바르지 않습니다.");
  }

  try {
    const database = await ensureSchema();
    const result = await database
      .prepare(
        `SELECT ${CHECK_IN_SELECT_COLUMNS}
         FROM check_ins
         WHERE (? IS NULL OR period_key = ?)
           AND (? IS NULL OR participant_key = ?)
           AND (? IS NULL OR work_order = ?)
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(
        periodKey,
        periodKey,
        participantKey,
        participantKey,
        workOrder,
        workOrder,
        limit,
      )
      .all<CheckInRow>();
    const checkIns = result.results.map(toCheckIn);
    return jsonNoStore({ ok: true, checkIns, data: checkIns });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request, 12_000);
  if (!body.ok) return body.response;
  const payload = body.value;
  const details = Object.keys(payload)
    .filter((key) => !POST_KEYS.has(key))
    .map((key) => `지원하지 않는 필드입니다: ${key}`);

  if (
    payload.participantKey !== undefined &&
    payload.participantCode !== undefined &&
    payload.participantKey !== payload.participantCode
  ) {
    details.push("participantKey와 participantCode가 서로 다릅니다.");
  }
  const participantKey = requiredString(
    payload.participantKey ?? payload.participantCode,
    "participantKey",
    32,
    details,
  );
  if (participantKey && !PILOT_CODE_PATTERN.test(participantKey)) {
    details.push("participantKey는 영문 대문자·숫자·하이픈·밑줄 조합 3~32자여야 합니다.");
  }
  const workOrder = requiredString(
    payload.workOrder,
    "workOrder",
    240,
    details,
  );
  const periodKey = requiredString(
    payload.periodKey,
    "periodKey",
    14,
    details,
  );
  if (periodKey && !isDayPeriodKey(periodKey)) {
    details.push("periodKey는 유효한 day-YYYY-MM-DD 형식이어야 합니다.");
  }
  const product = requiredString(payload.product, "product", 240, details);
  const processName = requiredString(payload.process, "process", 240, details);
  const equipment = requiredString(payload.equipment, "equipment", 240, details);

  const rawDuration = payload.durationSeconds ?? 0;
  const durationSeconds = typeof rawDuration === "number" ? rawDuration : NaN;
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > 180
  ) {
    details.push("durationSeconds는 0부터 180 사이의 정수여야 합니다.");
  }

  if (details.length) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "참여 완료 기록을 확인해주세요.",
      details,
    );
  }

  try {
    const database = await ensureSchema();
    const existing = await findCheckIn(
      database,
      participantKey,
      workOrder,
      periodKey,
    );
    const now = new Date().toISOString();
    await database
      .prepare(
        `INSERT INTO check_ins (
          participant_key, work_order, period_key, product, process,
          equipment, duration_seconds, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(participant_key, work_order, period_key) DO UPDATE SET
          product = excluded.product,
          process = excluded.process,
          equipment = excluded.equipment,
          duration_seconds = excluded.duration_seconds,
          updated_at = excluded.updated_at`,
      )
      .bind(
        participantKey,
        workOrder,
        periodKey,
        product,
        processName,
        equipment,
        durationSeconds,
        now,
        now,
      )
      .run();

    const saved = await findCheckIn(
      database,
      participantKey,
      workOrder,
      periodKey,
    );
    if (!saved) throw new Error("UPSERTED_CHECK_IN_NOT_FOUND");
    const checkIn = toCheckIn(saved);
    return jsonNoStore(
      {
        ok: true,
        checkIn,
        data: checkIn,
        upserted: existing ? "updated" : "created",
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
