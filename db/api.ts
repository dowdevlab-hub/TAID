export type ApiErrorCode =
  | "INVALID_CONTENT_TYPE"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "REVIEW_ALREADY_DECIDED"
  | "STORAGE_UNAVAILABLE";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value);
  }
  return Response.json(body, { ...init, headers });
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: string[],
) {
  return jsonNoStore(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details?.length ? { details } : {}),
      },
    },
    { status },
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonObject(
  request: Request,
  maxBytes = 64_000,
): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const mediaType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: apiError(
        415,
        "INVALID_CONTENT_TYPE",
        "Content-Type은 application/json이어야 합니다.",
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: apiError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다."),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "요청 본문을 읽을 수 없습니다."),
    };
  }

  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    return {
      ok: false,
      response: apiError(413, "PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다."),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "유효한 JSON 본문이 필요합니다."),
    };
  }

  if (!isObject(parsed)) {
    return {
      ok: false,
      response: apiError(400, "INVALID_REQUEST", "요청 본문은 JSON 객체여야 합니다."),
    };
  }

  return { ok: true, value: parsed };
}

export function databaseErrorResponse(error: unknown) {
  void error;
  return apiError(
    503,
    "STORAGE_UNAVAILABLE",
    "현장 기록 저장소를 일시적으로 사용할 수 없습니다.",
  );
}

export function parseLimit(value: string | null, fallback = 100, maximum = 250) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : null;
}
