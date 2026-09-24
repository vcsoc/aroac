import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { parseSources, selectSources } from "../shared/sourceConfig.js";
import { createApp } from "../server/app.js";
import { countryAt, privateAddress } from "../server/sources.js";
import {
  formatMobile,
  maskMobile,
  maskEmail,
  validateContacts,
} from "../shared/profile.js";
const original = readFileSync("sources.yaml", "utf8");
test("source YAML validates schema, adapters, global coverage and safe URLs/attribution", () => {
  const config = parseSources(original);
  assert.ok(config.sources.length >= 13);
  assert.ok(
    selectSources(config, "mapTopographic")[0].url.includes("World_Topo_Map"),
  );
  const legacy = {
    ...config,
    sources: config.sources.filter((s) => s.kind !== "mapTopographic"),
  };
  assert.doesNotThrow(() => parseSources(stringify(legacy)));
  const badTopo = structuredClone(config);
  badTopo.sources.find((s) => s.kind === "mapTopographic").url =
    "https://tiles.example.com/no-template";
  assert.throws(() => parseSources(stringify(badTopo)), /placeholders/);
  assert.equal(countryAt(43.65, -79.38), "CA");
  assert.equal(countryAt(-33.9, 18.4), "ZA");
  for (const text of [
    "version: [",
    "version: 1\nversion: 1",
    original.replace("adapter: open-meteo", "adapter: arbitrary"),
    original.replace("https://api.open-meteo.com", "http://127.0.0.1"),
    original.replace(
      "attribution: RainViewer",
      'attribution: "<img src=x onerror=alert(1)>"',
    ),
    original.replace(/countries: \[['"]\*['"]\]/, "countries: ['CA']"),
  ])
    assert.throws(() => parseSources(text));
  config.sources.unshift({
    ...config.sources[0],
    id: "canada-weather",
    countries: ["CA"],
    url: "https://weather.example.com/forecast",
  });
  assert.equal(selectSources(config, "weather", "CA")[0].id, "canada-weather");
  assert.equal(selectSources(config, "weather", "ZA")[0].id, "open-meteo");
  for (const ip of [
    "127.0.0.1",
    "192.168.1.1",
    "10.0.0.1",
    "172.16.0.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
  ])
    assert.equal(privateAddress(ip), true);
});
test("invalid external edits retain last valid config; API changes route country sources with fallback and reset safely", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "oar-sources-")),
    sourcesPath = path.join(temp, "sources.yaml");
  let offline = false;
  const urls = [];
  const { app, db } = createApp({
    dbPath: ":memory:",
    sourcesPath,
    isOffline: () => offline,
    sourceFetcher: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("weather.example.com"))
        return new Response("down", { status: 503 });
      return Response.json({ current: { time: 1 }, daily: { time: [1] } });
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  const request = (route, data, method = "PUT") =>
    fetch(
      base + route,
      data === undefined
        ? {}
        : {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          },
    );
  try {
    const config = parseSources(original);
    config.sources.unshift({
      ...config.sources[0],
      id: "canada-weather",
      countries: ["CA"],
      url: "https://weather.example.com/forecast",
    });
    assert.equal(
      (await request("/sources", { text: stringify(config) })).status,
      200,
    );
    const weather = await (
      await request("/weather?lat=43.65&lng=-79.38")
    ).json();
    assert.equal(weather.stale, false);
    assert.ok(urls[0].includes("weather.example.com"));
    assert.ok(urls[1].includes("api.open-meteo.com"));
    assert.equal(
      (await request("/sources", { text: "sources: [" })).status,
      400,
    );
    assert.match(readFileSync(sourcesPath, "utf8"), /canada-weather/);
    writeFileSync(sourcesPath, "version: [");
    const bad = await (await request("/sources")).json();
    assert.match(bad.error, /last valid configuration/);
    assert.equal(bad.active.weather.id, "open-meteo");
    offline = true;
    const reset = await (await request("/sources/reset", {}, "POST")).json();
    assert.match(reset.restoredFrom, /bundled/);
    assert.equal(reset.error, "");
    assert.equal(
      parseSources(readFileSync(sourcesPath, "utf8")).sources[0].id,
      "open-meteo",
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
test("a configuration change invalidates an in-flight source download rather than caching the old provider", async () => {
  let release,
    announce,
    first = true;
  const ready = new Promise((resolve) => {
    announce = resolve;
  });
  const { app, db } = createApp({
    dbPath: ":memory:",
    sourceFetcher: async () => {
      if (first) {
        first = false;
        announce();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return Response.json({ current: { time: 1 }, daily: { time: [1] } });
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  try {
    const pending = fetch(base + "/weather?lat=43.65&lng=-79.38");
    await ready;
    const text = original.replace(
      "https://api.open-meteo.com/v1/forecast",
      "https://weather.example.com/v1/forecast",
    );
    assert.equal(
      (
        await fetch(base + "/sources", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        })
      ).status,
      200,
    );
    release();
    const rejected = await pending;
    assert.equal(rejected.status, 503);
    assert.match((await rejected.json()).error, /could not be downloaded/);
    const current = await (
      await fetch(base + "/weather?lat=43.65&lng=-79.38")
    ).json();
    assert.match(current.sourceUrl, /weather.example.com/);
  } finally {
    release?.();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
test("private contact formatting masks display only and validates optional values", () => {
  assert.equal(formatMobile("1234567890"), "123-456-7890");
  assert.equal(maskMobile("123-456-7890"), "12#-###-####");
  assert.equal(maskEmail("alice@example.com"), "a###############m");
  assert.equal(
    validateContacts({
      mobile: "1234567890",
      mobileCountry: "CA",
      email: "alice@example.com",
    }).mobileDialCode,
    "+1",
  );
  assert.doesNotThrow(() => validateContacts({ mobile: "", email: "" }));
  assert.throws(() => validateContacts({ mobile: "123", email: "" }));
  assert.throws(() => validateContacts({ mobile: "", email: "not-an-email" }));
});
