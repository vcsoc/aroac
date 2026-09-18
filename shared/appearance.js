export const defaultAppearance = { fontScale: 1.12 };
export function validateAppearance(value) {
  if (
    typeof value?.fontScale !== "number" ||
    !Number.isFinite(value.fontScale) ||
    value.fontScale < 0.9 ||
    value.fontScale > 1.6
  )
    throw Error("Text size must be between 90% and 160%.");
  return { fontScale: Math.round(value.fontScale * 100) / 100 };
}
