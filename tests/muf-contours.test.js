import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContours, MUF_CONTOURS } from "../server/mufContours.js";
import { createApp } from "../server/app.js";
const sample = () => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { "level-value": 14 },
      geometry: {
        type: "LineString",
        coordinates: [
          [10, 20],
          [11, 21],
          [12, 22],
        ],
      },
    },
  ],
});
test("provider contours preserve geographic coordinates and MHz, reject bad data, and do not draw across the antimeridian", () => {
  const s = sample(),
    out = validateContours(s);
  assert.deepEqual(out.features[0].geometry.coordinates, [
    s.features[0].geometry.coordinates,
  ]);
  assert.equal(out.features[0].properties.label, "14.0 MHz");
  assert.throws(() =>
    validateContours({ type: "FeatureCollection", features: [] }),
  );
  const bad = sample();
  bad.features[0].geometry.coordinates[0][0] = 181;
  assert.throws(() => validateContours(bad));
  const wrap = sample();
  wrap.features[0].geometry.coordinates = [
    [170, 10],
    [179, 10],
    [-179, 10],
    [-170, 10],
  ];
  assert.equal(
    validateContours(wrap).features[0].geometry.coordinates.length,
    2,
  );
});
test("contours keep publication metadata, persist in SQLite, coalesce downloads and work offline without fetching", async (t) => {
  const original = fetch;
  let calls = 0,
    offline = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, MUF_CONTOURS);
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return Response.json(sample(), {
      headers: { "Last-Modified": new Date().toUTCString() },
    });
  });
  const { app, db } = createApp({
    dbPath: ":memory:",
    isOffline: () => offline,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + server.address().port + "/api/muf-contours";
  try {
    const rows = await Promise.all([
      original(url).then((r) => r.json()),
      original(url).then((r) => r.json()),
    ]);
    assert.equal(calls, 1);
    assert.equal(rows[0].geojson.features.length, 1);
    assert.ok(rows[0].publishedAt);
    offline = true;
    const cache = await (await original(url)).json();
    assert.equal(cache.stale, true);
    assert.equal(cache.offline, true);
    assert.equal(calls, 1);
    db.prepare("DELETE FROM feed_cache WHERE name='muf-contours'").run();
    assert.equal((await original(url)).status, 503);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
