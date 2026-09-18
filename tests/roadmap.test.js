import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRoadmap, ROADMAP_URL, ROADMAP_LIMIT } from "../shared/roadmap.js";

test("roadmap fetch uses only the fixed public URL, without credentials", async () => {
  const text = await fetchRoadmap({
    fetcher: async (url, options) => {
      assert.equal(url, ROADMAP_URL);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response("# Plans\n\n- Better maps", {
        headers: { "content-type": "text/plain" },
      });
    },
  });
  assert.match(text, /Better maps/);
});
test("roadmap respects offline mode and rejects missing, HTML, empty and oversized responses", async () => {
  await assert.rejects(
    fetchRoadmap({
      offline: true,
      fetcher: () => {
        throw Error("Must not fetch");
      },
    }),
    /offline/,
  );
  for (const response of [
    new Response("Not found", { status: 404 }),
    new Response("<html>login</html>", {
      headers: { "content-type": "text/html" },
    }),
    new Response("  "),
    new Response("x".repeat(ROADMAP_LIMIT + 1)),
  ]) {
    await assert.rejects(fetchRoadmap({ fetcher: async () => response }));
  }
});
