import { test, expect } from "@playwright/test";
test("guest menu, tutorial shortcut, branding, license typography and small text controls", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".brand-logo")).toBeVisible();
  const canvas = page.locator(".maplibregl-canvas");
  await canvas.evaluate((el) => el.focus());
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveCSS("outline-style", "none");
  await expect(canvas).toHaveAttribute("data-escape-focus", "true");
  await page.keyboard.press("Tab");
  await expect(canvas).not.toHaveAttribute("data-escape-focus", "true");
  const timeline = page.getByRole("slider", {
    name: "Compare world clock times",
  });
  await expect(timeline).toHaveCSS(
    "accent-color",
    await page
      .evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim(),
      )
      .then((value) =>
        page.evaluate((color) => {
          const el = document.createElement("span");
          el.style.color = color;
          document.body.append(el);
          const rgb = getComputedStyle(el).color;
          el.remove();
          return rgb;
        }, value),
      ),
  );
  await expect(
    page.getByRole("button", {
      name: "Save application screenshot",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".profile-button").click();
  for (const name of ["Help", "About AROAC", "Check for updates", "Sign in"])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Start tutorial", exact: true })
    .click();
  await expect(page.locator(".tutorial-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About AROAC", exact: true }).click();
  await expect(page.locator(".about-logo")).toBeVisible();
  await expect(page.locator(".about-description")).toContainText("local-first");
  await page.getByRole("tab", { name: "License", exact: true }).click();
  const materials = page.locator(".third-party-licenses");
  await expect(materials).not.toHaveAttribute("open", "");
  await expect(page.locator(".license-content")).toHaveCSS(
    "font-family",
    /JetBrains Mono/,
  );
  expect(
    await page
      .locator(".license-content h3")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe(
    await page
      .locator(".license-content > pre")
      .evaluate((el) => getComputedStyle(el).fontSize),
  );
  await page.locator(".license-content").evaluate((el) => {
    el.scrollTop = 100;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator(".license-content")).toHaveClass(/oar-scrolling/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  const slider = page.getByRole("slider", {
    name: "Small interface text size",
    exact: true,
  });
  await slider.fill("1.3");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--small-font-scale"),
      ),
    )
    .toBe("1.3");
  await page.evaluate(() => {
    window.oarDesktop = {
      loginSettings: async () => ({
        persistLogin: false,
        secureStorage: false,
      }),
    };
  });
  await page.getByRole("tab", { name: "Login", exact: true }).click();
  await expect(page.locator("#settings-panel-Login .help-tip")).toHaveCount(1);
  expect(errors).toEqual([]);
});
