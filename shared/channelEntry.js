// Manual entries are operator reports, never automatically verified.
import { validCtcss } from "./radioProgramming.js";
export function manualChannel(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Enter channel settings.");
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "name",
          "rxMHz",
          "txMHz",
          "receiveOnly",
          "tone",
          "mode",
          "notes",
        ].includes(key),
    )
  )
    throw Error("Unexpected channel field.");
  const name = String(input.name || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_-]{1,7}$/.test(name))
    throw Error(
      "Radio name must be 1–7 letters, digits, underscores or hyphens.",
    );
  const receiveOnly = input.receiveOnly === true;
  const rxMHz = Number(input.rxMHz),
    txMHz = receiveOnly ? rxMHz : Number(input.txMHz);
  for (const [label, value] of [
    ["RX", rxMHz],
    ["TX", txMHz],
  ]) {
    const hz = value * 1_000_000;
    if (
      !Number.isFinite(value) ||
      !((value >= 136 && value <= 174) || (value >= 400 && value <= 520)) ||
      Math.abs(hz - Math.round(hz / 10) * 10) > 0.001
    )
      throw Error(
        `${label} must be in 136–174 or 400–520 MHz on a 10 Hz step.`,
      );
  }
  const offsetMHz = Math.round((txMHz - rxMHz) * 1_000_000) / 1_000_000;
  if (Math.abs(offsetMHz) > 10)
    throw Error("RX/TX separation must be at most 10 MHz.");
  const tone = String(input.tone ?? "")
    .trim()
    .toLowerCase();
  const noTone = ["", "none", "off", "0"].includes(tone);
  const txTone = noTone ? null : Number(tone).toFixed(1);
  if (!noTone && !validCtcss(txTone))
    throw Error("Choose a standard CTCSS transmit tone or none.");
  if (receiveOnly && !noTone)
    throw Error("Receive-only channels cannot have a transmit tone.");
  const mode = input.mode || "FM";
  if (!["FM", "NFM"].includes(mode))
    throw Error("Only analog FM or NFM is supported.");
  return {
    snapshot: {
      callsign: name,
      city: String(input.notes || "").slice(0, 200),
      outputMHz: rxMHz,
      offsetMHz,
      mode,
      receiveOnly,
      directoryEncode: "Manual entry; verify independently",
      directoryDecode: "Receive tone off",
      directoryStatus: "Operator-entered; unverified",
      restriction: "",
      source: "manual",
    },
    offsetMHz,
    toneMode: noTone ? "none" : "tone",
    txTone,
    verified: false,
  };
}

export function parseChannelCsv(text) {
  if (typeof text !== "string" || text.length > 100_000)
    throw Error("Paste at most 100 KB of channel CSV.");
  const records = [],
    row = [];
  let value = "",
    quoted = false;
  const field = () => {
    row.push(value.trim());
    value = "";
  };
  const record = () => {
    field();
    if (row.some(Boolean)) records.push(row.splice(0));
    else row.length = 0;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ",") field();
    else if (!quoted && (c === "\n" || c === "\r")) {
      record();
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else value += c;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  if (value || row.length) record();
  if (records[0]?.[0]?.toLowerCase() === "name") records.shift();
  if (!records.length || records.length > 128)
    throw Error("Enter 1–128 channel rows.");
  return records.map((fields, index) => {
    if (fields.length < 3 || fields.length > 6)
      throw Error(
        `Row ${index + 1}: use Name,RX MHz,TX MHz or off,Tone,Mode,Notes.`,
      );
    const [name, rxMHz, txMHz, tone = "none", mode = "FM", notes = ""] = fields;
    const input = {
      name,
      rxMHz,
      txMHz,
      receiveOnly: txMHz.toLowerCase() === "off",
      tone,
      mode,
      notes,
    };
    try {
      manualChannel(input);
    } catch (error) {
      throw Error(`Row ${index + 1}: ${error.message}`);
    }
    return input;
  });
}
