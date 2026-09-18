import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const paths = execFileSync(
  process.env.npm_execpath ? process.execPath : "npm",
  [
    ...(process.env.npm_execpath ? [process.env.npm_execpath] : []),
    "ls", "--omit=dev", "--all", "--parseable",
  ],
  { encoding: "utf8", maxBuffer: 8e6, shell: !process.env.npm_execpath && process.platform === "win32" },
)
  .trim()
  .split(/\r?\n/)
  .slice(1);
const rows = new Map();
for (const dir of paths) {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const key = pkg.name + "@" + pkg.version;
  if (rows.has(key)) continue;
  const texts = readdirSync(dir)
    .filter((name) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name))
    .flatMap((name) => {
      try {
        return [readFileSync(path.join(dir, name), "utf8")];
      } catch {
        return [];
      }
    });
  rows.set(key, {
    name: key,
    license:
      typeof pkg.license === "string"
        ? pkg.license
        : JSON.stringify(pkg.license || pkg.licenses || "See upstream package"),
    text: texts.join("\n\n"),
  });
}
const electron = JSON.parse(
  readFileSync("node_modules/electron/package.json", "utf8"),
);
rows.set("electron", {
  name: "Electron " + electron.version,
  license: "MIT (Chromium has separate notices)",
  text: readFileSync("node_modules/electron/dist/LICENSE", "utf8"),
});
writeFileSync(
  "public/dependency-licenses.json",
  JSON.stringify(
    [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
  ),
);
