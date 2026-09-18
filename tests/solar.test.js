import { test } from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import { nightGeometry, globeOverviewZoom } from "../src/solar.js";
test("night overlay matches solar altitude across seasons and longitudes", () => {
  for (const time of [
    "2026-03-20T12:00:00Z",
    "2026-06-21T00:00:00Z",
    "2026-09-17T19:00:00Z",
    "2026-12-21T18:00:00Z",
  ]) {
    const now = new Date(time),
      geo = nightGeometry(now);
    assert.ok(geo.features.length > 100);
    for (let lng = -179.5; lng < 180; lng += 15)
      for (let lat = -70; lat <= 70; lat += 20) {
        const feature = geo.features.find(
          (f) => f.geometry.coordinates[0][0][0] === Math.floor(lng),
        );
        let covered = false;
        if (feature) {
          const r = feature.geometry.coordinates[0],
            bottom = (r[0][1] + r[1][1]) / 2,
            top = (r[2][1] + r[3][1]) / 2;
          covered = lat >= bottom && lat <= top;
        }
        const altitude = SunCalc.getPosition(now, lat, lng).altitude;
        if (Math.abs(altitude) > 0.03)
          assert.equal(covered, altitude < 0, `${time}: ${lat},${lng}`);
      }
  }
});
test("globe overview fits small and large windows", () => {
  assert.ok(globeOverviewZoom(390, 300) < 1);
  assert.ok(globeOverviewZoom(1200, 700) <= 2);
});
