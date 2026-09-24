import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoverage,
  coverageBounds,
  normalizeCoverage,
  rangeRing,
  distanceKm,
  localRadius,
  hfEnvelope,
  repeaterFootprint,
} from "../shared/coverage.js";
const origin = { lat: 43.5, lng: -79.7 };
test("camera bounds fit small and HF ranges, dateline and secondary footprints", () => {
  const local = buildCoverage(origin, { enabled: true });
  const hf = buildCoverage(origin, { enabled: true, band: "160m" });
  const small = coverageBounds(local),
    large = coverageBounds(hf);
  assert.ok(large[1][0] - large[0][0] > 50 * (small[1][0] - small[0][0]));
  const crossing = coverageBounds(
    buildCoverage({ lat: 0, lng: 179.99 }, { enabled: true }),
  );
  assert.ok(crossing[1][0] > 180);
  assert.ok(crossing[1][0] - crossing[0][0] < 1);
  local.features.push(
    rangeRing({ lat: 0, lng: 0 }, 100, { kind: "selected-repeater" }),
  );
  assert.deepEqual(coverageBounds(local), small);
  local.features.push(
    rangeRing({ lat: 43.5, lng: -79.5 }, 30, { kind: "secondary" }),
  );
  assert.ok(coverageBounds(local)[1][0] > small[1][0]);
  assert.equal(coverageBounds(buildCoverage(null, { enabled: true })), null);
  assert.equal(coverageBounds(buildCoverage(origin, { enabled: false })), null);
  assert.equal(
    coverageBounds(
      buildCoverage(origin, { enabled: true, band: "10m", foF2: 1 }),
    ),
    null,
  );
  const polar = coverageBounds(
    buildCoverage({ lat: 89, lng: 0 }, { enabled: true, band: "160m" }),
  );
  assert.ok(polar.flat().every(Number.isFinite));
  for (const lat of [-89, 89]) {
    const bounds = coverageBounds(
      buildCoverage({ lat, lng: 0 }, { enabled: true }),
    );
    assert.ok(bounds[0][1] <= bounds[1][1]);
    assert.ok(bounds.flat().every(Number.isFinite));
    assert.ok(Math.abs(bounds[0][1]) <= 85.051129);
    assert.ok(Math.abs(bounds[1][1]) <= 85.051129);
  }
});
test("coverage defaults, bounds and absent/invalid origin fail safely", () => {
  assert.equal(normalizeCoverage(null).band, "2m");
  assert.equal(
    normalizeCoverage({ band: "invalid", power: -1, foF2: Infinity }).power,
    0.001,
  );
  assert.equal(normalizeCoverage({ foF2: Infinity }).foF2, 7);
  assert.equal(buildCoverage(origin, {}).features.length, 0);
  assert.equal(
    buildCoverage({ lat: NaN, lng: 0 }, { enabled: true }).features.length,
    0,
  );
  assert.equal(buildCoverage(null, { enabled: true }).features.length, 0);
});
test("local model obeys height, power and frequency; horizon may limit multiple bands equally", () => {
  const s = normalizeCoverage();
  assert.ok(
    Math.abs(localRadius(s, 145) - 4.12 * (Math.sqrt(10) + Math.sqrt(1.5))) <
      1e-8,
  );
  const weak = { ...s, power: 0.001, margin: 40 };
  assert.ok(localRadius(weak, 435) < localRadius(weak, 145));
  assert.ok(localRadius({ ...s, txHeight: 100 }, 145) > localRadius(s, 145));
  const footprint = repeaterFootprint({ ...origin, frequencyMHz: 145 }, s);
  assert.ok(footprint.radiusKm > localRadius(s, 145));
  assert.equal(repeaterFootprint({ ...origin, frequencyMHz: NaN }, s), null);
});
test("HF spherical shell yields bounded skip annulus and no path above assumed MUF", () => {
  const s = normalizeCoverage();
  const low = hfEnvelope(s, 3.7),
    high = hfEnvelope(s, 14.2),
    shut = hfEnvelope(s, 29);
  assert.ok(low.innerKm < 0.001);
  assert.ok(high.innerKm > 0 && high.innerKm < high.outerKm);
  assert.ok(low.outerKm > 2000 && low.outerKm < 4000);
  assert.equal(shut.outerKm, 0);
  assert.ok(hfEnvelope({ ...s, hmF2: 500 }, 3.7).outerKm > low.outerKm);
  assert.equal(
    buildCoverage(origin, { enabled: true, band: "20m" }, [
      { ...origin, frequencyMHz: 145, offsetMHz: -0.6 },
    ]).shown,
    0,
  );
});
test("secondary circles include only same-band candidate sites within assumed reach and cap work", () => {
  const rows = [
    { ...origin, id: "near", frequencyMHz: 145, offsetMHz: -0.6 },
    { ...origin, id: "other-band", frequencyMHz: 435, offsetMHz: -5 },
    { ...origin, id: "missing-input", frequencyMHz: 145, offsetMHz: null },
    { ...origin, id: "wrong-input", frequencyMHz: 145, offsetMHz: 300 },
    { lat: -43, lng: 0, id: "far", frequencyMHz: 145, offsetMHz: -0.6 },
  ];
  const result = buildCoverage(origin, { enabled: true }, rows);
  assert.equal(result.shown, 1);
  assert.equal(
    result.features.filter((f) => f.properties.kind === "secondary").length,
    1,
  );
  const capped = buildCoverage(
    origin,
    { enabled: true },
    Array.from({ length: 50 }, (_, id) => ({ ...rows[0], id })),
  );
  assert.equal(capped.shown, 40);
  assert.equal(capped.capped, true);
  assert.equal(capped.eligible, 50);
});
test("range rings preserve geodesic radius and split dateline without globe-spanning edges", () => {
  for (const center of [
    origin,
    { lat: 0, lng: 179.9 },
    { lat: 89, lng: -179 },
    { lat: -89, lng: 0 },
  ]) {
    const feature = rangeRing(center, 1000);
    for (const segment of feature.geometry.coordinates) {
      for (let i = 0; i < segment.length; i++) {
        const [lng, lat] = segment[i];
        assert.ok(
          Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lng) <= 180,
        );
        if (Math.abs(lng) !== 180)
          assert.ok(Math.abs(distanceKm(center, { lat, lng }) - 1000) < 1e-6);
        if (i) assert.ok(Math.abs(lng - segment[i - 1][0]) <= 180);
      }
    }
  }
});
