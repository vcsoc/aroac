// Native ImageMagick + Node only. Never invoke legacy Android/Gradle tooling.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const input = "public/oar-logo-sq.png";
execFileSync("magick", [input, "-resize", "512x512", "public/icon-512.png"]);
execFileSync("magick", [
  input,
  "-define",
  "icon:auto-resize=256,128,64,48,32,16",
  "public/icon.ico",
]);
const blocks = [];
for (const [type, size] of [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
]) {
  const png = execFileSync(
    "magick",
    [input, "-resize", `${size}x${size}`, "png:-"],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(png.length + 8, 4);
  blocks.push(header, png);
}
const data = Buffer.concat(blocks),
  header = Buffer.alloc(8);
header.write("icns");
header.writeUInt32BE(data.length + 8, 4);
writeFileSync("public/icon.icns", Buffer.concat([header, data]));
execFileSync("magick", [
  input,
  "-resize",
  "1024x1024",
  "-background",
  "#101513",
  "-alpha",
  "remove",
  "-alpha",
  "off",
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
]);
console.log(
  "Generated Linux PNG, Windows ICO, macOS ICNS and iOS app-icon assets. Android uses the shared source logo when its native app is ready; legacy scaffold untouched.",
);
