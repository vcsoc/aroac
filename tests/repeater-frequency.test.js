import test from "node:test";
import assert from "node:assert/strict";
import { formatRawFrequencyHz } from "../shared/repeaterFrequency.js";

test("repeater directory frequency retains grouped Hz and scales its parenthetical unit", () => {
  assert.equal(formatRawFrequencyHz(445950000), "445,950,000 Hz (445.95 MHz)");
  assert.equal(
    formatRawFrequencyHz("145270000"),
    "145,270,000 Hz (145.27 MHz)",
  );
  assert.equal(formatRawFrequencyHz(2450000000), "2,450,000,000 Hz (2.45 GHz)");
  assert.equal(formatRawFrequencyHz(12500), "12,500 Hz (12.5 kHz)");
  assert.equal(formatRawFrequencyHz(990), "990 Hz (990 Hz)");
  assert.equal(formatRawFrequencyHz("unknown"), "unknown");
  assert.equal(formatRawFrequencyHz(0), "0");
});
