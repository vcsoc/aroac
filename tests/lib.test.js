import { test } from "node:test";
import assert from "node:assert/strict";
import { maidenhead, gridCenter, adif, timeAt } from "../src/lib.js";
test("Maidenhead conversion round trips valid grid centres", () => {
  for (const grid of ["FN03ck", "JF96aa", "AA00aa", "RR99xx"]) {
    const { lat, lng } = gridCenter(grid);
    assert.equal(maidenhead(lat, lng).toUpperCase(), grid.toUpperCase());
  }
});
test("ADIF lengths and UTC timestamps", () => {
  const result = adif([
    {
      callsign: "W1XYZ",
      frequency: 14.074,
      mode: "FT8",
      created: "2026-09-17T12:34:56Z",
    },
  ]);
  assert.match(result, /<CALL:5>W1XYZ/);
  assert.match(result, /<QSO_DATE:8>20260917/);
  assert.match(result, /<TIME_ON:6>123456/);
  assert.equal(timeAt(new Date("2026-09-17T12:34:56Z")), "12:34:56");
});
