import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
test("embedded data service requires private capability and serves disk observations offline", async () => {
  const { app, db } = createApp({
    dbPath: ":memory:",
    localKey: "test-private-capability",
    isOffline: () => true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin + "/api/me")).status, 403);
    const headers = { "X-OAR-Local-Key": "test-private-capability" };
    assert.equal((await fetch(origin + "/api/me", { headers })).status, 200);
    assert.equal(
      (await fetch(origin + "/api/feeds/kp", { headers })).status,
      503,
    );
    db.prepare("INSERT INTO feed_cache VALUES(?,?,?)").run(
      "kp",
      JSON.stringify({
        data: [["2026-01-01", 2]],
        source: "test",
        fetchedAt: "2026-01-01T00:00:00Z",
      }),
      0,
    );
    const cached = await (
      await fetch(origin + "/api/feeds/kp", { headers })
    ).json();
    assert.equal(cached.stale, true);
    assert.equal(cached.offline, true);
    assert.equal(cached.data[0][1], 2);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
