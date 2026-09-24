// Native ImageMagick + Node only. Never invoke legacy Android/Gradle tooling.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const input = "public/aroac-logo.png";
for (const size of [192, 512])
  execFileSync("magick", [
    input,
    "-resize",
    `${size}x${size}`,
    `public/icon-${size}.png`,
  ]);
writeFileSync(
  "public/icon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,${readFileSync("public/icon-192.png").toString("base64")}"/></svg>\n`,
);
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
  "#081c30",
  "-alpha",
  "remove",
  "-alpha",
  "off",
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
]);
console.log(
  "Generated PNG/SVG, Windows ICO, macOS ICNS and iOS app-icon assets from public/aroac-logo.png. Android remains blocked; legacy scaffold untouched.",
);
