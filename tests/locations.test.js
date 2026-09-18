import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { installGeocoding } from "../server/geocoding.js";
import { coordinatesFromQuery, withTimezone } from "../src/locations.js";
test("coordinates resolve timezone and optional station grid without network", () => {
  const place = withTimezone(coordinatesFromQuery("51.5034, -0.1276"));
  assert.equal(place.zone, "Europe/London");
  assert.match(place.grid, /^[A-R]{2}\d{2}[a-x]{2}$/);
  assert.equal(coordinatesFromQuery("91, 0"), null);
  assert.equal(coordinatesFromQuery("address"), null);
});
test("address lookup encodes query, normalizes results, and persists offline cache", async () => {
  const db = new DatabaseSync(":memory:"),
    app = express();
  let offline = false,
    calls = 0;
  installGeocoding(app, db, {
    isOffline: () => offline,
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("q"), "10 Downing Street, London");
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [-0.1276, 51.5034] },
              properties: {
                osm_id: 1,
                name: "10 Downing Street",
                housenumber: "10",
                street: "Downing Street",
                city: "London",
                country: "United Kingdom",
              },
            },
          ],
        }),
      };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/geocode?q=`;
  try {
    const initial = await (
      await fetch(base + encodeURIComponent("10 Downing Street, London"))
    ).json();
    assert.equal(initial.results[0].lat, 51.5034);
    assert.equal(initial.results[0].zoom, 17);
    offline = true;
    const cached = await (
      await fetch(base + encodeURIComponent("10 Downing Street, London"))
    ).json();
    assert.equal(cached.cached, true);
    assert.equal(calls, 1);
    assert.equal((await fetch(base + "Unknown+address")).status, 503);
    assert.equal((await fetch(base + "a")).status, 400);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
