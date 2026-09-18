import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMuf, mufView, MUF_SOURCE } from "../server/muf.js";
import { createApp } from "../server/app.js";
const sample = (time = new Date().toISOString()) => ({
  station: {
    code: "TEST",
    name: "Test ionosonde",
    latitude: "30.4",
    longitude: "262.3",
  },
  mufd: 28.827,
  time,
  cs: 100,
});
test("MUF observations use real coordinates, UTC measurement times, valid numbers and explicit age limits", () => {
  const now = Date.now(),
    rows = normalizeMuf([
      sample(new Date(now - 3600000).toISOString().replace("Z", "")),
      {
        ...sample(),
        station: { ...sample().station, code: "OLD" },
        time: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        ...sample(),
        station: { ...sample().station, code: "FUTURE" },
        time: new Date(now + 3600000).toISOString(),
      },
      { ...sample(), mufd: null },
      { ...sample(), station: { code: "BAD", latitude: "", longitude: 10 } },
      { ...sample(), mufd: -1 },
    ]);
  assert.equal(rows.length, 3);
  assert.ok(Math.abs(rows[0].lng + 97.7) < 1e-8);
  assert.equal(rows[0].mhz, 28.827);
  assert.ok(rows[0].observedAt.endsWith("Z"));
  const view = mufView(
    { observations: rows },
    { now, stale: true, offline: true },
  );
  assert.equal(view.stations.length, 1);
  assert.equal(view.omitted, 2);
  assert.equal(view.offline, true);
  assert.equal(view.stale, true);
  assert.equal(view.stations[0].old, false);
  assert.equal(
    mufView({ observations: rows }, { now: now + 3600000 }).stations.find(
      (p) => p.code === "TEST",
    ).old,
    true,
  );
  assert.throws(() => normalizeMuf({}), /Invalid/);
});
test("MUF downloads are coalesced and cached in SQLite; offline never fetches, failures use marked stale data", async (t) => {
  let offline = false,
    calls = 0,
    fail = false;
  const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, MUF_SOURCE);
    calls++;
    await new Promise((r) => setTimeout(r, 15));
    if (fail) throw Error("unavailable");
    return Response.json([sample()]);
  });
  const { app, db } = createApp({
    dbPath: ":memory:",
    isOffline: () => offline,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + server.address().port + "/api/muf";
  try {
    const results = await Promise.all([
      original(url).then((r) => r.json()),
      original(url).then((r) => r.json()),
    ]);
    assert.equal(calls, 1);
    assert.equal(results[0].stations.length, 1);
    assert.equal(results[0].stale, false);
    await original(url);
    assert.equal(calls, 1);
    offline = true;
    const cache = await (await original(url)).json();
    assert.equal(cache.offline, true);
    assert.equal(cache.stale, true);
    assert.equal(calls, 1);
    offline = false;
    fail = true;
    db.prepare("UPDATE feed_cache SET fetched=0 WHERE name='muf'").run();
    assert.equal((await (await original(url)).json()).stale, true);
    assert.equal(calls, 2);
    db.prepare("DELETE FROM feed_cache WHERE name='muf'").run();
    offline = true;
    assert.equal((await original(url)).status, 503);
    assert.equal(calls, 2);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
