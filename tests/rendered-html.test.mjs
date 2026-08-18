import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
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
  assert.match(html, /href="\/app"/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("server-renders the interactive MVP workspace", async () => {
  const response = await render("/app");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>TAID Workspace.*현장 지식 운영<\/title>/i);
  assert.match(html, /INTERACTIVE MVP/);
  assert.match(html, /오늘의 현장/);
  assert.match(html, /새 음성 기록/);
  assert.match(html, /상시 녹음하지 않습니다/);
});
