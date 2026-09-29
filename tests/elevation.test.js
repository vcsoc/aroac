import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { DatabaseSync } from "node:sqlite";
import { samplePath, estimateClearance, installElevation } from "../server/elevation.js";

test("geodesic DEM sampling handles the dateline and terrain obstruction", () => {
  const samples = samplePath({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
  assert.equal(samples.length, 33);
  assert.ok(Math.abs(Math.abs(samples[16].lng) - 180) < 0.001);
  assert.equal(estimateClearance([100, 100, 100], 1, 10, 10) > 0, true);
  assert.equal(estimateClearance([100, 130, 100], 1, 10, 10) < 0, true);
  assert.equal(estimateClearance([100, 100, 100], 100, 10, 10) < 0, true);
  assert.equal(estimateClearance([100, NaN, 100], 1, 10, 10), null);
});

test("elevation profile validates, caches, and serves marked offline profiles without contacting provider", async () => {
  const db = new DatabaseSync(":memory:"), app = express();
  let offline = false, calls = 0;
  installElevation(app, db, { isOffline: () => offline, fetcher: async (url) => {
    calls++;
    assert.equal(url.hostname, "api.open-meteo.com");
    const latitudes = url.searchParams.get("latitude").split(",");
    assert.ok([2, 33].includes(latitudes.length));
    assert.equal(url.searchParams.get("longitude").split(",").length, latitudes.length);
    return new Response(JSON.stringify({ elevation: latitudes.map(() => 105) }));
  } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${server.address().port}/api/elevation-profile`;
  const query = "?lat1=43.476915&lng1=-79.802799&lat2=44.412921&lng2=-79.571535";
  try {
    const value = await (await fetch(root + query)).json();
    assert.equal(value.elevations.length, 33);
    assert.equal(value.stale, false);
    assert.equal(calls, 1);
    await fetch(root + query);
    assert.equal(calls, 1);
    offline = true;
    assert.equal((await (await fetch(root + query)).json()).stale, true);
    assert.equal(calls, 1);
    assert.equal((await fetch(root + "?lat1=99&lng1=0&lat2=0&lng2=0")).status, 400);
    assert.equal((await fetch(root + "?lat1=0&lng1=0&lat2=0&lng2=0")).status, 400);
    assert.equal((await fetch(root + "?lat1=0&lng1=0&lat2=1&lng2=1")).status, 503);
    offline = false;
    const longPath = await (await fetch(root + "?lat1=43.642566&lng1=-79.387057&lat2=51.5034&lng2=-0.1276")).json();
    assert.equal(longPath.endpointsOnly, true);
    assert.equal(longPath.elevations.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
