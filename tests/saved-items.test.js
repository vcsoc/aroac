import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { installPins } from "../server/pins.js";
import { installLibrary } from "../server/library.js";
import {
  homeDifference,
  linkGeometry,
  utcOffset,
} from "../src/contactContext.js";
test("clock differences use current DST and fractional offsets; link geometry never invents missing coordinates", () => {
  assert.equal(utcOffset("Asia/Kathmandu", new Date("2026-07-01")), 345);
  assert.equal(
    homeDifference("Asia/Kathmandu", "America/Toronto", new Date("2026-07-01")),
    "+9h 45m vs home",
  );
  assert.equal(
    homeDifference("Asia/Kathmandu", "America/Toronto", new Date("2026-12-01")),
    "+10h 45m vs home",
  );
  assert.equal(
    linkGeometry({ lat: null, lng: null }, { lat: 0, lng: 0 }),
    null,
  );
  const link = linkGeometry({ lat: 0, lng: 0 }, { lat: 0, lng: 90 });
  assert.equal(link.bearing, 90);
  assert.ok(Math.abs(link.distance - 10007.54) < 1);
  assert.equal(
    linkGeometry({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }).bearing,
    null,
  );
});
test("legacy pins migrate safely, contact names survive API/export/import and saved search resolves locally", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE pins(id INTEGER PRIMARY KEY,label TEXT NOT NULL,callsign TEXT NOT NULL DEFAULT '',lat REAL NOT NULL,lng REAL NOT NULL,notes TEXT NOT NULL DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL);INSERT INTO pins VALUES(1,'Durban station','ZS1ABC',-29.8579,31.0292,'','old','old')",
  );
  const app = express();
  app.use(express.json());
  installPins(app, db);
  installLibrary(app, db);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  const request = async (route, method = "GET", body) => {
    const r = await fetch(base + route, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await request("/pins")).data[0].name, "");
    assert.equal(
      (await request("/pins/1", "PATCH", { name: "Captain Local" })).data.name,
      "Captain Local",
    );
    assert.equal(
      (await request("/pins/1", "PATCH", { name: "x".repeat(121) })).status,
      400,
    );
    assert.equal((await request("/pins/1", "PATCH", { name: 42 })).status, 400);
    await request("/address-book", "POST", {
      name: "Private Friend",
      callsign: "ZS1ABC",
    });
    const saved = (await request("/saved-search?q=PRIVATE")).data;
    assert.equal(saved.contacts[0].name, "Private Friend");
    assert.equal(saved.contactPins[0].lat, -29.8579);
    assert.equal(
      (await request("/saved-search?q=captain")).data.pins[0].name,
      "Captain Local",
    );
    const exported = (await request("/library/export")).data;
    assert.equal(exported.pins[0].name, "Captain Local");
    await request("/pins/1", "DELETE");
    assert.equal(
      (await request("/library/import", "POST", { data: exported })).data
        .imported.pins,
      1,
    );
    assert.equal((await request("/pins")).data[0].name, "Captain Local");
    assert.equal(
      (await request("/library/import", "POST", { data: exported })).data
        .skipped.pins,
      1,
    );
    assert.equal(
      db
        .prepare("PRAGMA table_info(pins)")
        .all()
        .filter((c) => c.name === "name").length,
      1,
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
