import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packaged = path.join(root, "releases/linux-unpacked/oar");
const usePackaged = process.platform === "linux" && existsSync(packaged);
const desktop = spawn(
  usePackaged ? packaged : createRequire(import.meta.url)("electron"),
  usePackaged ? [] : ["."],
  { cwd: root, stdio: "inherit" },
);
desktop.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
desktop.on("exit", (code) => {
  process.exitCode = code || 0;
});
