import { test } from "node:test";
import assert from "node:assert/strict";
import { contactLocation } from "../src/contactLocation.js";
test("contact navigation uses a unique callsign pin or a valid grid, never a guessed default", () => {
  const pin = {
    id: 1,
    label: "Home",
    callsign: "ZS1ABC",
    lat: -29.8579,
    lng: 31.0292,
  };
  const p = contactLocation({ name: "Operator", callsign: "zs1abc" }, [pin]);
  assert.equal(p.lat, pin.lat);
  assert.equal(p.kind, "contact");
  assert.equal(p.zone, "Africa/Johannesburg");
  const grid = contactLocation({ name: "Portable", grid: "fn03" });
  assert.equal(grid.lat, 43.5);
  assert.equal(grid.lng, -79);
  assert.match(grid.locationSource, /Approximate/);
  assert.throws(() => contactLocation({ name: "Unknown" }), /No location/);
  assert.throws(
    () => contactLocation({ callsign: "ZS1ABC" }, [pin, { ...pin, id: 2 }]),
    /Several saved pins/,
  );
  assert.throws(
    () => contactLocation({ name: "Bad grid", grid: "XX00" }),
    /No location/,
  );
});
