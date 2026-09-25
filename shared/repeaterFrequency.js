const number = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 }).format(value);

// Directory fields are supplied in Hz; retain that exact unit alongside a readable scale.
export function formatRawFrequencyHz(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return String(value);
  const hz = Number(text);
  if (!Number.isFinite(hz) || hz <= 0) return String(value);
  const [scale, unit] =
    hz >= 1e9
      ? [1e9, "GHz"]
      : hz >= 1e6
        ? [1e6, "MHz"]
        : hz >= 1e3
          ? [1e3, "kHz"]
          : [1, "Hz"];
  return `${number(hz)} Hz (${number(hz / scale)} ${unit})`;
}
