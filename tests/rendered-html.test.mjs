import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MAX_API_BODY_BYTES = 32_000;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker;
}

async function dispatch(request, bindings = {}) {
  const worker = await loadWorker();

  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      ...bindings,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function render(path = "/") {
  return dispatch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
  );
}

test("server-renders the TAID homepage", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TAID.*말하는 현장, 배우는 공장<\/title>/i);
  assert.match(html, /현장은 말하고/);
  assert.match(html, /3분 기록 시작하기/);
  assert.match(html, /이 화면 직접 체험하기/);
  assert.match(html, /샘플 체험 바로 시작/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /data-navigation="document"/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("server-renders the interactive MVP workspace", async () => {
  const response = await render("/app");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>TAID Workspace.*현장 지식 운영<\/title>/i);
  assert.match(html, /INTERACTIVE MVP/);
  assert.match(html, /3분 현장 기록/);
  assert.match(html, /처음 체험하시나요/);
  assert.match(html, /선택하고 계속/);
  assert.match(html, /상시 녹음하지 않습니다/);
  assert.match(html, /INTERACTIVE MVP · DEMO ENVIRONMENT/);
  assert.match(html, /MVP · DEMO/);
  assert.match(html, /설비 QR 데모/);
  assert.match(html, /작업지시·품목·공정·설비/);
  assert.match(html, />작업지시</);
  assert.match(html, />품목</);
  assert.doesNotMatch(html, /LIVE AI 구조화|RULE DEMO/);
});

test("keeps explicit three-question and demo mode labels in conditional workspace views", async () => {
  const source = await readFile(
    new URL("../app/app/Workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /aria-label="3문항 회고 진행 상황"/);
  assert.match(source, /AI 없이 3문항 샘플 전체 흐름 체험/);
  assert.match(source, /작업자 3문항 원문/);
  assert.match(source, /LIVE AI/);
  assert.match(source, /SAMPLE · AI 미사용/);
  assert.match(source, /RULE DEMO · RAG 아님/);
  assert.match(source, /오늘 전체 특이사항 없음/);
  assert.match(source, /참여만 기록합니다\. AI와 승인함은 사용하지 않습니다/);
  assert.match(source, /관리자 승인과 지식 카드는 생성되지 않습니다/);
  assert.match(source, /NO ISSUE · AI 미사용/);
  assert.match(source, /작업지시·품목·공정·설비·녹음시간/);
  assert.match(source, /checkIn\.periodKey === DEMO_PERIOD_KEY/);
  assert.match(source, /checkIn\.workOrder === draft\.workOrder/);
});

test("allows only POST for structure requests", async () => {
  const getResponse = await dispatch(
    new Request("http://localhost/api/structure", { method: "GET" }),
  );
  assert.equal(getResponse.status, 405);

  const optionsResponse = await dispatch(
    new Request("http://localhost/api/structure", { method: "OPTIONS" }),
  );
  assert.equal(optionsResponse.status, 204);
  assert.match(optionsResponse.headers.get("allow") ?? "", /\bPOST\b/);
});

test("requires an exact application/json media type", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "text/application/json" },
      body: JSON.stringify({ transcript: "테스트 기록" }),
    }),
  );

  assert.equal(response.status, 415);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_CONTENT_TYPE",
      message: "Content-Type은 application/json이어야 합니다.",
    },
  });
});

test("accepts application/json parameters", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ transcript: "" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_REQUEST");
});

test("rejects an oversized declared body before parsing it", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_API_BODY_BYTES + 1),
      },
      body: "{}",
    }),
  );

  assert.equal(response.status, 413);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: {
      code: "PAYLOAD_TOO_LARGE",
      message: "요청 본문이 너무 큽니다.",
    },
  });
});

test("rejects an oversized body when content-length is absent", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(8_001),
    }),
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});

test("rejects invalid structure requests before calling AI", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_REQUEST",
      message: "입력값을 확인해 주세요.",
      details: ["transcript는 비어 있을 수 없습니다."],
    },
  });
});

test("reports an explicit server configuration error when the API key is missing", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transcript: "조립 중 누설 불량이 발생했습니다." }),
    }),
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "AI_NOT_CONFIGURED");
  assert.match(body.error.message, /OpenAI API 키/);
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

test("structures a transcript through the Responses API contract", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  let capturedRequest;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url !== "https://api.openai.com/v1/responses") {
      return originalFetch(input, init);
    }

    capturedRequest = { input, init };
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                kind: "문제",
                process: "A모델 최종 조립",
                equipment: "조립 2라인 · AS-02",
                quantity: "50개",
                defect: "누설 불량 3개",
                symptom: "누설 검사 불합격",
                cause: "실링 고무가 안쪽으로 밀림",
                action: "실링 고무 위치를 재조정함",
                result: "재검사 통과",
                confidence: 91,
                needsReview: ["cause"],
              }),
            },
          ],
        },
      ],
    });
  };

  try {
    const response = await dispatch(
      new Request("http://localhost/api/structure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: "A모델 50개 중 누설 불량 3개가 발생했습니다.",
          process: "A모델 최종 조립",
          equipment: "조립 2라인 · AS-02",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      mode: "live",
      data: {
        kind: "문제",
        process: "A모델 최종 조립",
        equipment: "조립 2라인 · AS-02",
        quantity: "50개",
        defect: "누설 불량 3개",
        symptom: "누설 검사 불합격",
        cause: "실링 고무가 안쪽으로 밀림",
        action: "실링 고무 위치를 재조정함",
        result: "재검사 통과",
        confidence: 91,
        needsReview: ["cause"],
      },
    });

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.init.headers.Authorization, "Bearer test-only-key");
    const upstreamBody = JSON.parse(capturedRequest.init.body);
    assert.equal(upstreamBody.model, "gpt-5-mini");
    assert.equal(upstreamBody.store, false);
    assert.equal(upstreamBody.text.format.type, "json_schema");
    assert.equal(upstreamBody.text.format.strict, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  }
});
