export const defaultAppearance = { fontScale: 1.12, smallFontScale: 1 };
export function validateAppearance(value) {
  if (
    typeof value?.fontScale !== "number" ||
    !Number.isFinite(value.fontScale) ||
    value.fontScale < 0.9 ||
    value.fontScale > 1.6
  )
    throw Error("Text size must be between 90% and 160%.");
  const small = value.smallFontScale ?? 1;
  if (
    typeof small !== "number" ||
    !Number.isFinite(small) ||
    small < 0.9 ||
    small > 1.8
  )
    throw Error("Small text size must be between 90% and 180%.");
  return {
    fontScale: Math.round(value.fontScale * 100) / 100,
    smallFontScale: Math.round(small * 100) / 100,
  };
}
