import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import {
  defaultTheme,
  validateTheme,
  defaultTimeConfig,
  validateTimeConfig,
} from "../shared/workspace.js";
import { installWeather } from "../server/weather.js";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { parseDocument, stringify } from "yaml";
async function serve(app, fn) {
  const s = app.listen(0, "127.0.0.1");
  await new Promise((r) => s.once("listening", r));
  try {
    await fn("http://127.0.0.1:" + s.address().port);
  } finally {
    await new Promise((r) => s.close(r));
  }
}
test("clock settings validate IANA zones and coordinates; theme YAML round-trips safely", () => {
  assert.equal(validateTimeConfig(defaultTimeConfig()).clocks.length, 4);
  assert.throws(() =>
    validateTimeConfig({
      ...defaultTimeConfig(),
      home: { name: "x", zone: "not/a/timezone" },
    }),
  );
  assert.throws(() =>
    validateTimeConfig({
      ...defaultTimeConfig(),
      home: { name: "x", zone: "UTC", lat: 91, lng: 1 },
    }),
  );
  assert.deepEqual(
    validateTheme(
      parseDocument(stringify(defaultTheme)).toJS({ maxAliasCount: 0 }),
    ),
    defaultTheme,
  );
  assert.throws(() =>
    validateTheme({
      ...defaultTheme,
      colors: { ...defaultTheme.colors, accent: "url(https://evil)" },
    }),
  );
  assert.throws(() =>
    parseDocument("a: &a [1,2]\nb: *a").toJS({ maxAliasCount: 0 }),
  );
  const instant = new Date("2026-03-08T07:30:00Z");
  assert.match(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
    }).format(instant),
    /03:30/,
  );
});
test("workspace SQLite preferences and atomic, deduplicating location/contact import", async () => {
  const { app, db } = createApp({ dbPath: ":memory:", isOffline: () => true });
  try {
    await serve(app, async (root) => {
      const send = (p, method = "GET", body) =>
        fetch(root + "/api" + p, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      assert.equal(
        (await send("/preferences/theme", "PUT", defaultTheme)).status,
        200,
      );
      assert.deepEqual(
        (await (await send("/preferences/theme")).json()).value,
        defaultTheme,
      );
      const data = {
        format: "oar-location-book",
        version: 1,
        pins: [
          {
            label: "Home",
            callsign: "zs1abc",
            lat: -33.9,
            lng: 18.4,
            notes: "Private note",
          },
        ],
        contacts: [
          {
            name: "Friend",
            callsign: "zs2abc",
            email: "friend@example.test",
            grid: "JF96",
            notes: "Address book",
          },
        ],
        qsos: [],
      };
      assert.equal(
        (await send("/library/preview", "POST", { data })).status,
        200,
      );
      let r = await (await send("/library/import", "POST", { data })).json();
      assert.deepEqual(r.imported, { pins: 1, contacts: 1, qsos: 0 });
      r = await (await send("/library/import", "POST", { data })).json();
      assert.deepEqual(r.skipped, { pins: 1, contacts: 1, qsos: 0 });
      const bad = {
        ...data,
        pins: [
          { ...data.pins[0], label: "Must not import" },
          { ...data.pins[0], lat: 100 },
        ],
      };
      assert.equal(
        (await send("/library/import", "POST", { data: bad })).status,
        400,
      );
      assert.equal((await (await send("/pins")).json()).length, 1);
      const exported = await (await send("/library/export")).json();
      assert.equal(exported.contacts[0].callsign, "ZS2ABC");
      assert.equal(JSON.stringify(exported).includes("password"), false);
      assert.equal(exported.qsos.length, 0);
      assert.equal(
        (
          await send("/library/import", "POST", {
            data: {
              ...data,
              qsos: [
                {
                  callsign: "ZS1ABC",
                  frequency: 14.2,
                  mode: "SSB",
                  created: "2026-01-01T00:00:00Z",
                  notes: "",
                },
              ],
            },
            includeLogbook: true,
          })
        ).status,
        400,
      );
    });
  } finally {
    db.close();
  }
});
test("weather provider caches seven-day data and never fetches in offline mode", async () => {
  const db = new DatabaseSync(":memory:"),
    app = express();
  let offline = false,
    calls = 0;
  installWeather(app, db, {
    isOffline: () => offline,
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("forecast_days"), "7");
      return new Response(
        JSON.stringify({
          current: { time: 1770000000, temperature_2m: 10 },
          daily: { time: [1770000000] },
        }),
      );
    },
  });
  try {
    await serve(app, async (root) => {
      const get = () => fetch(root + "/api/weather?lat=51.5&lng=-0.1");
      assert.equal((await get()).status, 200);
      await get();
      assert.equal(calls, 1);
      offline = true;
      assert.equal((await (await get()).json()).stale, true);
      assert.equal(calls, 1);
      assert.equal(
        (await fetch(root + "/api/weather?lat=100&lng=1")).status,
        400,
      );
      assert.equal(
        (await fetch(root + "/api/weather?lat=50&lng=1")).status,
        503,
      );
    });
  } finally {
    db.close();
  }
});
