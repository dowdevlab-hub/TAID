import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { Miniflare } from "miniflare";

const MAX_API_BODY_BYTES = 64_000;

let miniflare;
let testDatabase;

async function getTestDatabase() {
  if (!testDatabase) {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "taid-node-test" },
      d1Persist: false,
    });
    testDatabase = await miniflare.getD1Database("DB");
  }
  return testDatabase;
}

after(async () => {
  await miniflare?.dispose();
});

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker;
}

async function dispatch(request, bindings = {}) {
  const runtimeBindings = {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
    ...bindings,
  };
  const previousTestEnv = globalThis.__TAID_TEST_ENV__;
  globalThis.__TAID_TEST_ENV__ = runtimeBindings;

  try {
    const worker = await loadWorker();
    return await worker.fetch(request, runtimeBindings, {
      waitUntil() {},
      passThroughOnException() {},
    });
  } finally {
    if (previousTestEnv === undefined) delete globalThis.__TAID_TEST_ENV__;
    else globalThis.__TAID_TEST_ENV__ = previousTestEnv;
  }
}

function jsonRequest(path, method, body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validRecordPayload(overrides = {}) {
  return {
    clientRequestId: "node-validation-record-0001",
    structureMode: "rules",
    participantCode: "PILOT-01",
    workOrder: "WO-VALIDATION-01",
    product: "A모델 밸브 Assy",
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    transcript: "A모델 50개 중 3개에서 누설이 발생해 실링을 조정했습니다.",
    title: "A모델 누설 점검",
    kind: "문제",
    quantity: "50개",
    defect: "3개",
    symptom: "누설 발생",
    cause: "실링 위치 이탈",
    action: "실링 위치 조정",
    result: "재검사 통과",
    confidence: 72,
    needsReview: [],
    ...overrides,
  };
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
  assert.match(html, /MVP 바로 시작/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /data-navigation="document"/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
  assert.doesNotMatch(
    html,
    /세 번의 자연스러운 대화|AI가 묻습니다|삭제·보관 선택권|수정 이력 보존/,
  );
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
  assert.match(html, /INTERACTIVE MVP · LIVE DATA \+ SAMPLE/);
  assert.match(html, /MVP · LIVE \+ SAMPLE/);
  assert.match(html, /설비 QR 데모/);
  assert.match(html, /참여자 코드/);
  assert.match(html, /등록된 작업 선택/);
  assert.match(html, /실제 작업 직접 입력/);
  assert.match(html, /로그인이나 보안 인증 수단이 아닙니다/);
  assert.match(html, /작업지시·품목·공정·설비/);
  assert.match(html, />작업지시</);
  assert.match(html, />품목</);
  assert.doesNotMatch(html, /LIVE AI 구조화|RULE DEMO/);
});

test("keeps one-reflection guidance and separates live, rules, and sample modes", async () => {
  const source = await readFile(
    new URL("../app/app/Workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /STEP 02 · 3분 회고/);
  assert.match(source, /문제: \["workOrder", "product", "process", "equipment", "symptom"\]/);
  assert.match(source, /개선: \["workOrder", "product", "process", "equipment"\]/);
  assert.match(source, /개선 내용, 제안한 조치, 확인된 결과 중 하나를 입력해주세요/);
  assert.match(source, /실제 작업 직접 입력/);
  assert.match(source, /파일럿 현장의 실제 작업지시·품목·공정·설비명을 입력하세요/);
  assert.match(source, /aria-label="말하기 가이드"/);
  assert.match(source, /아래 질문은 말하기 힌트입니다/);
  assert.match(source, /3분 회고 전체 전사문/);
  assert.match(source, /마이크 없이 샘플로 체험/);
  assert.match(source, /<details className="privacy-notice">/);
  assert.match(source, /개인정보·기밀정보는 말하지 마세요\. 이 앱은 원음 파일을 저장하지 않습니다/);
  assert.match(source, /녹음·전사 데이터 처리 방식/);
  assert.match(source, /전체 회고 구조화/);
  assert.match(source, /작업자 3분 회고 원문/);
  assert.match(source, /LIVE AI/);
  assert.match(source, /RULES · 실제 입력/);
  assert.match(source, /SAMPLE · AI 미사용/);
  assert.match(source, /KEYWORD RULE · RAG 아님/);
  assert.doesNotMatch(source, /오늘 전체.*특이사항 없음/);
  assert.match(source, /이 작업은 특이사항 없음/);
  assert.match(source, /관리자 승인과 지식 카드는 생성되지 않습니다/);
  assert.match(source, /NO ISSUE · AI 미사용/);
  assert.match(source, /완료된 LIVE 기록과 참여 기록은 기기 간 공유를 위해 서버에 저장/);
  assert.match(source, /sourceAnswers: \[transcript\.trim\(\)\]/);
  assert.match(source, /transcript: currentTranscript/);
  assert.doesNotMatch(source, /buildCombinedTranscript/);
  assert.equal([...source.matchAll(/fetch\("\/api\/structure"/g)].length, 1);
  assert.match(source, /fetch\("\/api\/records"/);
  assert.match(source, /\/api\/records\?limit=1000&status=pending&includeSamples=false/);
  assert.match(source, /\/api\/records\?limit=1000&status=approved&includeSamples=false/);
  assert.match(source, /fetch\("\/api\/check-ins"/);
  assert.match(source, /fetch\("\/api\/overview/);
  assert.match(source, /cards\.filter\(\(card\) => card\.id < 0\)/);
  assert.match(source, /SAMPLE 데모 지식 · LIVE KPI 제외/);
  assert.match(source, /SAMPLE · AI 미사용/);
  assert.match(source, /const match = liveApprovedCards/);
  assert.match(source, /확인된 원인: \$\{match\.cause\}/);
  assert.match(source, /근거 · LIVE #\{answerSourceCard\.id\}/);
  assert.doesNotMatch(source, /유사 지식 1건|내용 중복도 68%|조회 \{card\.views\}/);

  const structureRequestStart = source.indexOf('fetch("/api/structure"');
  const structureRequestEnd = source.indexOf("signal: controller.signal", structureRequestStart);
  assert.ok(structureRequestStart >= 0 && structureRequestEnd > structureRequestStart);
  assert.doesNotMatch(
    source.slice(structureRequestStart, structureRequestEnd),
    /participantCode/,
  );

  const saveDraftStart = source.indexOf("async function saveDraft()");
  const saveDraftEnd = source.indexOf("async function updateStatus", saveDraftStart);
  assert.ok(saveDraftStart >= 0 && saveDraftEnd > saveDraftStart);
  assert.match(
    source.slice(saveDraftStart, saveDraftEnd),
    /getApiErrorCode\(payload\) === "IDEMPOTENCY_CONFLICT"[\s\S]{0,160}recordRequestIdRef\.current = null/,
  );

  const coachStart = source.indexOf("function askKnowledge()");
  const coachEnd = source.indexOf("function resetDemo()", coachStart);
  assert.ok(coachStart >= 0 && coachEnd > coachStart);
  assert.doesNotMatch(
    source.slice(coachStart, coachEnd),
    /CNC-03|1→3→2|승인 사례/,
  );
  assert.doesNotMatch(
    source,
    /aria-label="3문항 회고 진행 상황"|AI 없이 3문항 샘플 전체 흐름 체험|AI 없이 한 번의 회고 샘플 체험|작업자 3문항 원문|3문항을 AI로 정리|전체 회고 샘플 불러오기|sample-flow-shortcut|ai-connection-status/,
  );
});

test("aligns the three-minute and manual-context contracts across layers", async () => {
  const [workspace, checkInRoute, schema, migration, recordsRoute] = await Promise.all([
    readFile(new URL("../app/app/Workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/check-ins/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_taid_mvp.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/records/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /durationSeconds > 180/);
  assert.match(checkInRoute, /durationSeconds > 180/);
  assert.match(schema, /duration_seconds BETWEEN 0 AND 180/);
  assert.match(migration, /duration_seconds` BETWEEN 0 AND 180/);
  assert.match(workspace, /return `day-\$\{today\.getFullYear\(\)\}/);
  assert.equal([...workspace.matchAll(/maxLength=\{240\}/g)].length, 4);
  assert.match(recordsRoute, /\.slice\(0, MAX_TITLE_CHARACTERS\)/);
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
      body: "x".repeat(16_001),
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

test("keeps participant attribution out of the structure-only contract", async () => {
  const response = await dispatch(
    jsonRequest("/api/structure", "POST", {
      transcript: "누설이 발생해 실링 위치를 조정했습니다.",
      process: "최종 조립",
      equipment: "AS-02",
      participantCode: "PILOT-01",
    }),
    { OPENAI_API_KEY: undefined },
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.match(body.error.details.join(" "), /participantCode/);
});

test("structures the actual transcript with transparent rules when the API key is missing", async () => {
  const response = await dispatch(
    new Request("http://localhost/api/structure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript: "A모델 50개 중 3개에서 누설이 발생했습니다. 실링을 다시 조정한 뒤 재검사에서 통과했습니다.",
        process: "A모델 최종 조립",
        equipment: "조립 2라인 · AS-02",
      }),
    }),
    { OPENAI_API_KEY: undefined },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "rules");
  assert.equal(body.data.process, "A모델 최종 조립");
  assert.equal(body.data.equipment, "조립 2라인 · AS-02");
  assert.equal(body.data.quantity, "50개");
  assert.equal(body.data.defect, "3개");
  assert.match(body.data.symptom, /누설/);
  assert.match(body.data.action, /조정/);
  assert.equal(response.headers.get("x-taid-structure-mode"), "rules");
});

test("allows an explicit rules fallback even when an AI key is configured", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    throw new Error("The Responses API must not be called in forced rules mode.");
  };

  try {
    const response = await dispatch(
      jsonRequest("/api/structure", "POST", {
        transcript: "누설이 발생해 실링 위치를 조정했고 재검사에서 통과했습니다.",
        process: "A모델 최종 조립",
        equipment: "조립 2라인 · AS-02",
        structureMode: "rules",
      }),
      { OPENAI_API_KEY: "test-only-key" },
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "rules");
    assert.equal(response.headers.get("x-taid-structure-mode"), "rules");
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("structures a transcript through the Responses API contract", async () => {
  const originalFetch = globalThis.fetch;
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
      {
        OPENAI_API_KEY: "test-only-key",
        OPENAI_MODEL: "gpt-5-mini",
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      mode: "ai",
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
    assert.doesNotMatch(
      JSON.stringify(upstreamBody.text.format.schema),
      /"maxLength"/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an oversized AI field after strict-schema parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
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
              defect: "3개",
              symptom: "가".repeat(2_001),
              cause: "실링 위치 이탈",
              action: "실링 위치 조정",
              result: "재검사 통과",
              confidence: 91,
              needsReview: [],
            }),
          },
        ],
      },
    ],
  });

  try {
    const response = await dispatch(
      jsonRequest("/api/structure", "POST", {
        transcript: "A모델 50개 중 누설 불량 3개가 발생했습니다.",
        process: "A모델 최종 조립",
        equipment: "조립 2라인 · AS-02",
      }),
      { OPENAI_API_KEY: "test-only-key" },
    );

    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, "AI_RESPONSE_INVALID");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects SAMPLE persistence and invalid field semantics before D1 access", async () => {
  const scenarios = [
    {
      name: "server-side SAMPLE persistence",
      body: validRecordPayload({ structureMode: "sample" }),
      expected: /SAMPLE 기록.*공유 서버에 저장할 수 없습니다/,
    },
    {
      name: "problem without symptom",
      body: validRecordPayload({ kind: "문제", symptom: "" }),
      expected: /문제 기록에는 symptom이 필요합니다/,
    },
    {
      name: "improvement without content, action, or result",
      body: validRecordPayload({
        kind: "개선",
        symptom: "",
        action: "",
        result: "",
      }),
      expected: /개선 기록에는 symptom, action, result 중 하나가 필요합니다/,
    },
    {
      name: "know-how without an action",
      body: validRecordPayload({ kind: "노하우", action: "" }),
      expected: /노하우 기록에는 action이 필요합니다/,
    },
    {
      name: "quantity without a number",
      body: validRecordPayload({ quantity: "오십개" }),
      expected: /quantity를 입력할 때는 숫자를 포함해야 합니다/,
    },
    {
      name: "defect without a number",
      body: validRecordPayload({ defect: "세개" }),
      expected: /defect를 입력할 때는 숫자를 포함해야 합니다/,
    },
    {
      name: "defect greater than quantity",
      body: validRecordPayload({ quantity: "50개", defect: "51개" }),
      expected: /defect는 quantity보다 클 수 없습니다/,
    },
  ];

  for (const scenario of scenarios) {
    const response = await dispatch(
      jsonRequest("/api/records", "POST", scenario.body),
    );
    assert.equal(response.status, 400, scenario.name);
    const body = await response.json();
    assert.equal(body.error.code, "INVALID_REQUEST", scenario.name);
    assert.match(body.error.details.join(" "), scenario.expected, scenario.name);
  }
});

test("persists shared records and enforces the review lifecycle in D1", async () => {
  const DB = await getTestDatabase();
  const runId = `${process.pid}-${Date.now()}`;
  const periodKey = "day-2026-08-19";

  const overviewBeforeResponse = await dispatch(
    new Request(`http://localhost/api/overview?periodKey=${periodKey}`),
    { DB },
  );
  assert.equal(overviewBeforeResponse.status, 200);
  const overviewBefore = (await overviewBeforeResponse.json()).overview;

  const baseRecord = {
    structureMode: "rules",
    participantCode: "PILOT-01",
    workOrder: `WO-${runId}`,
    product: "A모델 밸브 Assy",
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    transcript: "A모델 50개 중 3개에서 누설이 발생해 실링을 조정했고 재검사를 통과했습니다.",
    title: "A모델 누설 점검",
    kind: "문제",
    quantity: "50개",
    defect: "3개",
    symptom: "누설 발생",
    cause: "실링 위치 이탈",
    action: "실링 위치 조정",
    result: "재검사 통과",
    confidence: 72,
    needsReview: [],
  };

  const approvedRequestId = `node-${runId}-approved`;
  const createdResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...baseRecord,
      clientRequestId: approvedRequestId,
    }),
    { DB },
  );
  assert.equal(createdResponse.status, 201);
  assert.match(createdResponse.headers.get("cache-control") ?? "", /^no-store/);
  const created = await createdResponse.json();
  assert.equal(created.deduplicated, false);
  assert.equal(created.record.status, "검토 대기");
  assert.equal(created.record.structureMode, "rules");
  assert.equal(created.record.mode, "live");
  assert.equal(created.record.excludeFromMetrics, false);

  const duplicateResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...baseRecord,
      clientRequestId: approvedRequestId,
    }),
    { DB },
  );
  assert.equal(duplicateResponse.status, 200);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.record.id, created.record.id);

  const conflictResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...baseRecord,
      clientRequestId: approvedRequestId,
      action: "같은 요청 식별자로 바뀐 조치",
    }),
    { DB },
  );
  assert.equal(conflictResponse.status, 409);
  assert.equal(
    (await conflictResponse.json()).error.code,
    "IDEMPOTENCY_CONFLICT",
  );

  const rejectedResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...baseRecord,
      clientRequestId: `node-${runId}-rejected`,
      workOrder: `WO-${runId}-R`,
      title: "반려 검증 기록",
    }),
    { DB },
  );
  assert.equal(rejectedResponse.status, 201);
  const rejected = await rejectedResponse.json();

  const sampleResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...baseRecord,
      clientRequestId: `node-${runId}-sample`,
      structureMode: "sample",
      participantCode: "SAMPLE-01",
      workOrder: `WO-${runId}-S`,
      title: "통계 제외 샘플",
      confidence: 0,
    }),
    { DB },
  );
  assert.equal(sampleResponse.status, 400);
  const sampleRejection = await sampleResponse.json();
  assert.equal(sampleRejection.error.code, "INVALID_REQUEST");
  assert.match(
    sampleRejection.error.details.join(" "),
    /SAMPLE 기록.*공유 서버에 저장할 수 없습니다/,
  );

  // Simulate a legacy/imported SAMPLE row to keep the read and overview
  // isolation contract covered even though the public POST now rejects it.
  const sampleCreatedAt = new Date().toISOString();
  const legacySampleRequestId = `node-${runId}-legacy-sample`;
  await DB.prepare(
    `INSERT INTO records (
      client_request_id, structure_mode, exclude_from_metrics,
      worker_code, work_order, product, process, equipment, transcript,
      title, kind, quantity, defect, symptom, cause, action, result,
      confidence, review_fields_json, status, created_at, updated_at
    ) VALUES (?, 'sample', 1, ?, ?, ?, ?, ?, ?, ?, '문제', ?, ?, ?, ?, ?, ?, 0, '[]', '승인', ?, ?)`,
  ).bind(
    legacySampleRequestId,
    "SAMPLE-LEGACY",
    `WO-${runId}-LEGACY-S`,
    baseRecord.product,
    baseRecord.process,
    baseRecord.equipment,
    baseRecord.transcript,
    "통계 제외 레거시 샘플",
    baseRecord.quantity,
    baseRecord.defect,
    baseRecord.symptom,
    baseRecord.cause,
    baseRecord.action,
    baseRecord.result,
    sampleCreatedAt,
    sampleCreatedAt,
  ).run();
  const legacySample = await DB.prepare(
    "SELECT id FROM records WHERE client_request_id = ?",
  ).bind(legacySampleRequestId).first();
  assert.ok(legacySample);

  const liveListResponse = await dispatch(
    new Request("http://localhost/api/records?structureMode=live&includeSamples=false&limit=250"),
    { DB },
  );
  assert.equal(liveListResponse.status, 200);
  const liveList = (await liveListResponse.json()).records;
  assert.ok(liveList.some((record) => record.id === created.record.id));
  assert.ok(liveList.some((record) => record.id === rejected.record.id));
  assert.ok(!liveList.some((record) => record.id === legacySample.id));

  const sampleListResponse = await dispatch(
    new Request("http://localhost/api/records?structureMode=sample&includeSamples=true&limit=250"),
    { DB },
  );
  assert.equal(sampleListResponse.status, 200);
  const sampleList = (await sampleListResponse.json()).records;
  assert.ok(sampleList.some((record) => record.id === legacySample.id));

  const approvalResponse = await dispatch(
    jsonRequest(`/api/records/${created.record.id}`, "PATCH", {
      decision: "approved",
      reviewerCode: "REVIEW-01",
      reviewNote: "원문과 구조화 결과를 확인함",
    }),
    { DB },
  );
  assert.equal(approvalResponse.status, 200);
  const approved = await approvalResponse.json();
  assert.equal(approved.record.status, "승인");
  assert.equal(approved.record.reviewerCode, "REVIEW-01");

  const approvalRetryResponse = await dispatch(
    jsonRequest(`/api/records/${created.record.id}`, "PATCH", {
      decision: "approved",
      reviewerCode: "REVIEW-01",
      reviewNote: "원문과 구조화 결과를 확인함",
    }),
    { DB },
  );
  assert.equal(approvalRetryResponse.status, 200);
  const approvalRetry = await approvalRetryResponse.json();
  assert.equal(approvalRetry.deduplicated, true);
  assert.equal(approvalRetry.record.id, created.record.id);

  const secondDecisionResponse = await dispatch(
    jsonRequest(`/api/records/${created.record.id}`, "PATCH", {
      decision: "rejected",
      reviewerCode: "REVIEW-02",
      rejectionReason: "이미 승인된 기록을 되돌리려는 요청",
    }),
    { DB },
  );
  assert.equal(secondDecisionResponse.status, 409);
  assert.equal(
    (await secondDecisionResponse.json()).error.code,
    "REVIEW_ALREADY_DECIDED",
  );

  const missingReasonResponse = await dispatch(
    jsonRequest(`/api/records/${rejected.record.id}`, "PATCH", {
      decision: "rejected",
      reviewerCode: "REVIEW-01",
    }),
    { DB },
  );
  assert.equal(missingReasonResponse.status, 400);
  assert.match(
    (await missingReasonResponse.json()).error.details.join(" "),
    /rejectionReason/,
  );

  const rejectionResponse = await dispatch(
    jsonRequest(`/api/records/${rejected.record.id}`, "PATCH", {
      decision: "rejected",
      reviewerCode: "REVIEW-01",
      rejectionReason: "원인 근거 보완 필요",
    }),
    { DB },
  );
  assert.equal(rejectionResponse.status, 200);
  const rejectedDecision = await rejectionResponse.json();
  assert.equal(rejectedDecision.record.status, "반려");
  assert.equal(rejectedDecision.record.rejectionReason, "원인 근거 보완 필요");

  const rejectionRetryResponse = await dispatch(
    jsonRequest(`/api/records/${rejected.record.id}`, "PATCH", {
      decision: "rejected",
      reviewerCode: "REVIEW-01",
      rejectionReason: "원인 근거 보완 필요",
    }),
    { DB },
  );
  assert.equal(rejectionRetryResponse.status, 200);
  const rejectionRetry = await rejectionRetryResponse.json();
  assert.equal(rejectionRetry.deduplicated, true);
  assert.equal(rejectionRetry.record.id, rejected.record.id);

  const approvedListResponse = await dispatch(
    new Request("http://localhost/api/records?status=approved&includeSamples=false&limit=250"),
    { DB },
  );
  assert.equal(approvedListResponse.status, 200);
  const approvedList = (await approvedListResponse.json()).records;
  assert.ok(approvedList.some((record) => record.id === created.record.id));
  assert.ok(!approvedList.some((record) => record.id === rejected.record.id));
  assert.ok(!approvedList.some((record) => record.id === legacySample.id));

  const checkInPayload = {
    participantCode: "PILOT-01",
    workOrder: `WO-${runId}`,
    periodKey,
    product: "A모델 밸브 Assy",
    process: "A모델 최종 조립",
    equipment: "조립 2라인 · AS-02",
    durationSeconds: 180,
  };
  const tooLongCheckInResponse = await dispatch(
    jsonRequest("/api/check-ins", "POST", {
      ...checkInPayload,
      durationSeconds: 181,
    }),
    { DB },
  );
  assert.equal(tooLongCheckInResponse.status, 400);
  assert.match(
    (await tooLongCheckInResponse.json()).error.details.join(" "),
    /0부터 180/,
  );

  const firstCheckInResponse = await dispatch(
    jsonRequest("/api/check-ins", "POST", checkInPayload),
    { DB },
  );
  assert.equal(firstCheckInResponse.status, 201);
  const firstCheckIn = await firstCheckInResponse.json();
  assert.equal(firstCheckIn.upserted, "created");

  const updatedCheckInResponse = await dispatch(
    jsonRequest("/api/check-ins", "POST", {
      ...checkInPayload,
      durationSeconds: 45,
    }),
    { DB },
  );
  assert.equal(updatedCheckInResponse.status, 200);
  const updatedCheckIn = await updatedCheckInResponse.json();
  assert.equal(updatedCheckIn.upserted, "updated");
  assert.equal(updatedCheckIn.checkIn.id, firstCheckIn.checkIn.id);
  assert.equal(updatedCheckIn.checkIn.durationSeconds, 45);

  const checkInListResponse = await dispatch(
    new Request(
      `http://localhost/api/check-ins?periodKey=${encodeURIComponent(periodKey)}&participantCode=PILOT-01`,
    ),
    { DB },
  );
  assert.equal(checkInListResponse.status, 200);
  const checkIns = (await checkInListResponse.json()).checkIns;
  assert.equal(checkIns.length, 1);
  assert.equal(checkIns[0].durationSeconds, 45);

  const overviewAfterResponse = await dispatch(
    new Request(`http://localhost/api/overview?periodKey=${encodeURIComponent(periodKey)}`),
    { DB },
  );
  assert.equal(overviewAfterResponse.status, 200);
  const overviewAfter = (await overviewAfterResponse.json()).overview;
  assert.equal(overviewAfter.totalRecords, overviewBefore.totalRecords + 2);
  assert.equal(overviewAfter.approvedRecords, overviewBefore.approvedRecords + 1);
  assert.equal(overviewAfter.rejectedRecords, overviewBefore.rejectedRecords + 1);
  assert.equal(overviewAfter.pendingRecords, overviewBefore.pendingRecords);
  assert.equal(overviewAfter.rulesRecords, overviewBefore.rulesRecords + 2);
  assert.equal(overviewAfter.completedCheckIns, 1);
  assert.equal(overviewAfter.samplesExcluded, true);

  const recordWithoutTitle = { ...baseRecord };
  delete recordWithoutTitle.title;
  const generatedTitleResponse = await dispatch(
    jsonRequest("/api/records", "POST", {
      ...recordWithoutTitle,
      clientRequestId: `node-${runId}-generated-title`,
      workOrder: `WO-${runId}-T`,
      process: "공".repeat(240),
      symptom: "증".repeat(200),
    }),
    { DB },
  );
  assert.equal(generatedTitleResponse.status, 201);
  const generatedTitle = (await generatedTitleResponse.json()).record.title;
  assert.equal(generatedTitle.length, 300);
});
