import { build } from "esbuild";
await build({
  entryPoints: ["server/app.js"],
  outfile: "desktop/generated/local-service.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["node:*"],
  logLevel: "info",
});
await build({
  entryPoints: ["desktop/updates.cjs"],
  outfile: "desktop/generated/updates.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["electron", "node:*"],
  logLevel: "info",
});
