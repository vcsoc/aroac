import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installCities } from "../server/cities.js";
import { installPins } from "../server/pins.js";
import { installGeocoding } from "../server/geocoding.js";
import { validateAppearance } from "../shared/appearance.js";
async function serve(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("offline city aliases, country queries, Durban timezone and honest nearest-place fallback", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "oar-cities-")),
    file = path.join(dir, "cities.json"),
    db = new DatabaseSync(":memory:");
  writeFileSync(
    file,
    JSON.stringify([
      [
        "Durban",
        "ZA",
        "KwaZulu-Natal",
        -29.8579,
        31.0292,
        "Africa/Johannesburg",
        3000000,
        "eThekwini",
      ],
      [
        "Valletta",
        "MT",
        "Valletta",
        35.8992,
        14.5141,
        "Europe/Malta",
        6784,
        "Il-Belt Valletta",
      ],
    ]),
  );
  const app = express();
  let online = false,
    calls = 0;
  installCities(app, {
    db,
    citiesPath: file,
    isOffline: () => !online,
    fetcher: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                city: "Durban",
                state: "KwaZulu-Natal",
                country: "South Africa",
              },
            },
          ],
        }),
      );
    },
  });
  try {
    await serve(app, async (root) => {
      const city = await (await fetch(root + "/api/cities?q=Il-Belt")).json();
      assert.equal(city.results[0].title, "Valletta");
      assert.equal(city.total, 2);
      const durban = await (
        await fetch(root + "/api/cities?q=Durban%20South%20Africa")
      ).json();
      assert.equal(durban.results[0].zone, "Africa/Johannesburg");
      let place = await (
        await fetch(root + "/api/places/reverse?lat=-29.8579&lng=31.0292")
      ).json();
      assert.equal(place.kind, "nearest");
      assert.equal(place.name, "Durban");
      assert.ok(place.distanceKm < 0.001);
      assert.equal(calls, 0);
      online = true;
      place = await (
        await fetch(root + "/api/places/reverse?lat=-29.8579&lng=31.0292")
      ).json();
      assert.equal(place.kind, "mapped");
      assert.equal(place.name, "Durban");
      online = false;
      place = await (
        await fetch(root + "/api/places/reverse?lat=-29.8579&lng=31.0292")
      ).json();
      assert.equal(place.cached, true);
      assert.equal(calls, 1);
      assert.equal(
        (await fetch(root + "/api/places/reverse?lat=999&lng=1")).status,
        400,
      );
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("pin-based address corrections remain local, follow pin moves and can be undone offline", async () => {
  const db = new DatabaseSync(":memory:"),
    app = express();
  app.use(express.json());
  installPins(app, db);
  installGeocoding(app, db, { isOffline: () => true });
  db.prepare("INSERT INTO geocode_cache VALUES(?,?,?)").run(
    "example address",
    JSON.stringify([{ id: "test", title: "Example address", lat: 1, lng: 2 }]),
    Date.now(),
  );
  try {
    await serve(app, async (root) => {
      const send = (p, method = "GET", body) =>
        fetch(root + "/api" + p, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      const pin = await (
        await send("/pins", "POST", {
          label: "Precise pin",
          lat: 1.001,
          lng: 2.001,
        })
      ).json();
      assert.equal(
        (
          await send("/geocode/correction", "POST", {
            query: "Example address",
            resultId: "test",
            pinId: pin.id,
          })
        ).status,
        200,
      );
      const query = async () =>
        (await (await send("/geocode?q=Example%20address")).json()).results[0];
      assert.equal((await query()).lat, 1.001);
      assert.equal((await query()).corrected, true);
      await send("/pins/" + pin.id, "PATCH", { lat: 1.002 });
      assert.equal((await query()).lat, 1.002);
      await send("/geocode/correction?q=Example%20address", "DELETE");
      assert.equal((await query()).lat, 1);
      assert.equal((await query()).corrected, undefined);
    });
  } finally {
    db.close();
  }
});
test("text size settings only accept bounded numbers", () => {
  assert.equal(validateAppearance({ fontScale: 1.12 }).fontScale, 1.12);
  for (const fontScale of [-1, 0, 10, "1.2", NaN])
    assert.throws(() => validateAppearance({ fontScale }));
});
