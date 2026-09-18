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
