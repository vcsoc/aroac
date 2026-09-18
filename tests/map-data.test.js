import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { installPins } from "../server/pins.js";
import { installRepeaters, normalizeRepeaters } from "../server/repeaters.js";
async function serve(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("saved pins support validated creation, partial inline edits, relocation and deletion", async () => {
  const db = new DatabaseSync(":memory:"),
    app = express();
  app.use(express.json());
  installPins(app, db);
  try {
    await serve(app, async (root) => {
      const send = (path, method, body) =>
        fetch(root + "/api/pins" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      const bad = await send("", "POST", {
        label: "Station",
        lat: 91,
        lng: 10,
      });
      assert.equal(bad.status, 400);
      const created = await send("", "POST", {
        label: " Home ",
        callsign: "zs1abc",
        lat: -33.9,
        lng: 18.4,
        notes: "My QTH",
      });
      assert.equal(created.status, 201);
      const pin = await created.json();
      assert.equal(pin.callsign, "ZS1ABC");
      const edited = await (
        await send("/" + pin.id, "PATCH", { label: "Portable" })
      ).json();
      assert.equal(edited.label, "Portable");
      assert.equal(edited.lat, -33.9);
      assert.equal(edited.notes, "My QTH");
      const moved = await (
        await send("/" + pin.id, "PATCH", { lat: 51.5, lng: -0.1 })
      ).json();
      assert.equal(moved.callsign, "ZS1ABC");
      assert.equal(moved.lat, 51.5);
      assert.equal(
        (await send("/" + pin.id, "PATCH", { lng: "oops" })).status,
        400,
      );
      assert.equal((await (await send("", "GET")).json()).length, 1);
      assert.equal((await send("/" + pin.id, "DELETE")).status, 200);
      assert.equal((await (await send("", "GET")).json()).length, 0);
      assert.equal(
        (await send("/" + pin.id, "PATCH", { label: "Deleted" })).status,
        404,
      );
    });
  } finally {
    db.close();
  }
});
const records = [
  {
    id: 1,
    callsign: "VE7RHS",
    latitude: 49.26973,
    longitude: -123.24992,
    frequency: 145270000,
    offset: -600000,
    mode: "FM",
    encode: "100.0",
    decode: "100.0",
    description: "Full provider details",
    operational: 1,
  },
  { id: 2, latitude: 0, longitude: 0, frequency: 146000000 },
  null,
];
test("repeater normalization preserves all provider details and converts Hz accurately", () => {
  const rows = normalizeRepeaters(records);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].frequencyMHz, 145.27);
  assert.equal(rows[0].offsetMHz, -0.6);
  assert.equal(rows[0].raw.description, "Full provider details");
  assert.equal(rows[0].raw.encode, "100.0");
});
test("global repeater directory is cached, reused, available offline and not silently truncated", async () => {
  const db = new DatabaseSync(":memory:"),
    app = express();
  let offline = false,
    calls = 0;
  installRepeaters(app, db, {
    isOffline: () => offline,
    fetcher: async () => {
      calls++;
      return new Response(JSON.stringify(records), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  try {
    await serve(app, async (root) => {
      const response = await fetch(root + "/api/repeaters");
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.repeaters.length, 1);
      assert.equal(data.providerCount, 3);
      assert.equal(data.omitted, 2);
      await fetch(root + "/api/repeaters?refresh=1");
      assert.equal(calls, 1);
      offline = true;
      const cache = await (await fetch(root + "/api/repeaters")).json();
      assert.equal(cache.offline, true);
      assert.equal(cache.stale, true);
      assert.equal(cache.repeaters[0].raw.description, "Full provider details");
      db.prepare("DELETE FROM repeater_cache").run();
      assert.equal((await fetch(root + "/api/repeaters")).status, 503);
    });
  } finally {
    db.close();
  }
});
