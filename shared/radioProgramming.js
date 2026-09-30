// Provider fields are unverified directory reports, not instructions to transmit.
export const CTCSS_TONES = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0,
  103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2,
  151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8, 177.3, 179.9, 183.5,
  186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5, 210.7, 218.1, 225.7, 229.1,
  233.6, 241.8, 250.3, 254.1,
];
export const validCtcss = (value) =>
  typeof value === "string" &&
  CTCSS_TONES.some((tone) => tone.toFixed(1) === value);

export function directoryTone(raw) {
  const value = String(raw ?? "").trim();
  if (!value || /^0(?:\.0+)?$/.test(value))
    return { label: "Not specified (verify with repeater owner)", ctcss: null };
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const tone = Number(value).toFixed(1);
    if (validCtcss(tone))
      return {
        label: `${tone} Hz CTCSS (directory report; verify)`,
        ctcss: tone,
      };
  }
  if (/^CC\d+$/i.test(value))
    return {
      label: `DMR color code ${value.slice(2)} (not a UV-5R analog tone)`,
      ctcss: null,
    };
  if (/^DCS\d{3}[NI]?$/i.test(value))
    return {
      label: `${value} DCS (verify polarity; CSV export supports CTCSS only)`,
      ctcss: null,
    };
  return {
    label: `${value.slice(0, 40)} (unverified / unsupported tone format)`,
    ctcss: null,
  };
}

export function radioChannelFromRepeater(repeater) {
  if (
    !repeater ||
    typeof repeater.id !== "string" ||
    repeater.id.length > 120 ||
    !Number.isFinite(repeater.frequencyMHz) ||
    repeater.frequencyMHz <= 0
  )
    throw Error("Repeater data cannot be added to the programming list.");
  const tx = directoryTone(repeater.raw?.encode);
  const rx = directoryTone(repeater.raw?.decode);
  return {
    repeaterId: repeater.id,
    callsign: String(repeater.callsign || "").slice(0, 32),
    city: String(repeater.city || "").slice(0, 100),
    outputMHz: repeater.frequencyMHz,
    offsetMHz: Number.isFinite(repeater.offsetMHz) ? repeater.offsetMHz : null,
    mode: String(repeater.mode || "")
      .trim()
      .slice(0, 32),
    directoryEncode: tx.label,
    directoryDecode: rx.label,
    // Do not infer which direction the provider's encode/decode values describe.
    // The operator must independently choose a verified radio transmit tone.
    directoryStatus:
      String(repeater.raw?.operational) === "0"
        ? "Reported offline"
        : "Unverified",
    restriction: String(repeater.raw?.restriction || "").slice(0, 100),
  };
}

export function canExportChannel(channel) {
  const c = channel?.snapshot || channel;
  const f = c?.outputMHz;
  return (
    !!channel?.verified &&
    !c.restriction &&
    c.directoryStatus !== "Reported offline" &&
    (c.mode === "FM" || c.mode === "NFM") &&
    Number.isFinite(f) &&
    ((f >= 136 && f <= 174) || (f >= 400 && f <= 520)) &&
    Number.isFinite(channel.offsetMHz) &&
    Math.abs(channel.offsetMHz) <= 10 &&
    (!c.receiveOnly ||
      (channel.offsetMHz === 0 && channel.toneMode === "none")) &&
    (channel.toneMode === "none" ||
      (channel.toneMode === "tone" && validCtcss(channel.txTone)))
  );
}

const csv = (value) =>
  `"${String(value ?? "")
    .replaceAll('"', '""')
    .replaceAll(/[\r\n]+/g, " ")}"`;
const safeComment = (value) =>
  /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
export function chirpCsv(channels) {
  if (
    !Array.isArray(channels) ||
    channels.length === 0 ||
    channels.length > 128 ||
    channels.some((row) => !canExportChannel(row))
  )
    throw Error(
      "Choose 1–128 verified analog channels with valid frequency, offset and tone settings.",
    );
  const header = [
    "Location",
    "Name",
    "Frequency",
    "Duplex",
    "Offset",
    "Tone",
    "rToneFreq",
    "cToneFreq",
    "DtcsCode",
    "DtcsPolarity",
    "Mode",
    "TStep",
    "Skip",
    "Comment",
  ];
  return (
    [
      header.map(csv).join(","),
      ...channels.map((row, i) => {
        const c = row.snapshot;
        return [
          i,
          (c.callsign || "CH" + (i + 1))
            .replace(/[^A-Za-z0-9_-]/g, "")
            .slice(0, 7),
          c.outputMHz.toFixed(5),
          c.receiveOnly
            ? "off"
            : row.offsetMHz > 0
              ? "+"
              : row.offsetMHz < 0
                ? "-"
                : "",
          Math.abs(row.offsetMHz).toFixed(5),
          row.toneMode === "tone" ? "Tone" : "",
          row.toneMode === "tone" ? row.txTone : "",
          "",
          "",
          "",
          c.mode,
          "",
          "",
          safeComment(
            `${c.callsign} ${c.city} · hearham.com; verify before TX`,
          ),
        ]
          .map(csv)
          .join(",");
      }),
    ].join("\r\n") + "\r\n"
  );
}
