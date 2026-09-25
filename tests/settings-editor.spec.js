import { test, expect } from "@playwright/test";

test("YAML editor wraps with aligned soft line numbers and only its thin scrolling scrollbar", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Sources YAML" });
  await expect(input).toBeEnabled();
  await input.fill(
    "# " +
      "long-source-name-".repeat(90) +
      "\nversion: 1\n" +
      Array.from({ length: 100 }, (_, i) => "# line " + i).join("\n"),
  );
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 760 });
    await expect
      .poll(() => input.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator("#settings-panel-Sources")
          .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      )
      .toBe(true);
    expect(
      await input.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    const gutter = page.locator(".yaml-gutter > div > div");
    await expect(gutter).toHaveCount(102);
    await expect
      .poll(() =>
        gutter.first().evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeGreaterThan(40);
    await input.evaluate((el) => {
      el.scrollTop = 170;
      el.dispatchEvent(new Event("scroll"));
    });
    await expect(input).toHaveClass(/scrolling/);
    await expect
      .poll(() =>
        page.locator(".yaml-gutter > div").evaluate((el) => el.style.transform),
      )
      .toBe("translateY(-170px)");
    expect(
      await input.evaluate(
        (el) => getComputedStyle(el, "::-webkit-scrollbar").width,
      ),
    ).toBe("4px");
    await expect(input).not.toHaveClass(/scrolling/, { timeout: 1500 });
  }
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.screenshot({ path: "/tmp/oar-yaml-editor.png" });
  expect(errors).toEqual([]);
});

test("theme settings use three bordered columns at normal window width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  const labels = page.locator(".theme-colors label");
  await expect(labels.first()).toBeVisible();
  const first = await labels.nth(0).boundingBox(),
    second = await labels.nth(1).boundingBox(),
    third = await labels.nth(2).boundingBox(),
    fourth = await labels.nth(3).boundingBox();
  expect(first.y).toBe(second.y);
  expect(second.y).toBe(third.y);
  expect(fourth.y).toBeGreaterThan(first.y);
  await expect(labels.first()).toHaveCSS("border-top-width", "1px");
  const apply = await page
    .getByRole("button", { name: "Apply theme" })
    .boundingBox();
  const exportYAML = page.getByRole("button", { name: "Export YAML" });
  const exportBox = await exportYAML.boundingBox();
  expect(Math.abs(apply.y - exportBox.y)).toBeLessThan(3);
  expect(exportBox.x).toBeGreaterThan(apply.x + 200);
  await page.getByLabel("Theme name").fill("Night Sky / 70 cm");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportYAML.click(),
  ]);
  expect(download.suggestedFilename()).toBe("aroac-night-sky-70-cm.yaml");
  await page.screenshot({ path: "/tmp/oar-theme-grid.png" });
});
