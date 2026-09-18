import { chromium } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
const svg =
  "data:image/svg+xml;base64," +
  readFileSync("public/icon.svg").toString("base64");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
});
try {
  const page = await browser.newPage();
  async function image(file, w, h, size) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(
      `<body style="margin:0;background:#101816;display:grid;place-items:center;width:100vw;height:100vh"><img width="${size}" height="${size}" src="${svg}"></body>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({ path: file });
  }
  for (const [density, size] of Object.entries({
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  })) {
    const base = `android/app/src/main/res/mipmap-${density}`;
    for (const name of ["ic_launcher", "ic_launcher_round"])
      await image(`${base}/${name}.png`, size, size, size);
    await image(
      `${base}/ic_launcher_foreground.png`,
      Math.round(size * 2.25),
      Math.round(size * 2.25),
      Math.round(size * 1.3),
    );
  }
  const splashes = readdirSync("android/app/src/main/res")
    .filter((x) => x.startsWith("drawable"))
    .map((x) => `android/app/src/main/res/${x}/splash.png`);
  splashes.push(
    ...readdirSync("ios/App/App/Assets.xcassets/Splash.imageset")
      .filter((x) => x.endsWith(".png"))
      .map((x) => "ios/App/App/Assets.xcassets/Splash.imageset/" + x),
  );
  for (const file of splashes) {
    let png;
    try {
      png = readFileSync(file);
    } catch {
      continue;
    }
    const w = png.readUInt32BE(16),
      h = png.readUInt32BE(20);
    await image(file, w, h, Math.round(Math.min(w, h) * 0.22));
  }
  await image(
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    1024,
    1024,
    1024,
  );
} finally {
  await browser.close();
}
