// A suggested basename only: the OS save dialog still lets the user choose a path.
export function themeExportFilename(name) {
  const slug = String(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return `aroac-${slug || "theme"}.yaml`;
}
