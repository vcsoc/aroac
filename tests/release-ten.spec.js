import { test, expect } from "@playwright/test";
import { defaultTimeConfig } from "../shared/workspace.js";

test("Quick Switch help renders above the popover and About shows licenses and developer links", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Switch", exact: true }).click();
  const panel = page.locator("#quick-switch-panel");
  await panel.getByRole("button", { name: "About MUF", exact: true }).focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  expect(
    await tooltip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/oar-0.3.10-tooltip.png" });
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close Quick Switch" }).click();
  await page.getByRole("button", { name: "About AROAC", exact: true }).click();
  const about = page.getByRole("dialog", { name: "About AROAC" });
  await expect(
    about.getByRole("link", { name: "Chris Visser" }),
  ).toHaveAttribute("href", "https://github.com/vcsoc");
  await about.getByRole("tab", { name: "License", exact: true }).click();
  await expect(about).toContainText("AROAC Free Noncommercial Use License");
  await expect(about).toContainText("Third-party materials");
});

test("Sources validates before applying and offers reset/ignore without damaging active configuration", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  const dialog = page.locator("#settings-dialog");
  await expect(
    dialog.getByRole("tab", { name: "Sources", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const editor = dialog.getByRole("textbox", { name: "Sources YAML" });
  await expect(editor).toHaveValue(/version: 1/);
  const original = await editor.inputValue();
  await editor.fill("version: [");
  await dialog
    .getByRole("button", { name: "Validate and apply sources" })
    .click();
  const fault = page.getByRole("region", {
    name: "Source configuration error",
  });
  await expect(fault).toContainText("active configuration has not changed");
  await fault.getByRole("button", { name: "Ignore", exact: true }).click();
  await expect(editor).toHaveValue("version: [");
  expect((await (await page.request.get("/api/sources")).json()).text).toBe(
    original,
  );
  await editor.fill(original);
  await dialog
    .getByRole("button", { name: "Validate and apply sources" })
    .click();
  await expect(page.locator(".oar-toast")).toContainText(
    "validated and applied",
  );
});

test("profile country defaults from home and contacts reveal only on focus or hover", async ({
  page,
}) => {
  const prefs = await (
    await page.request.get("/api/preferences/world-time")
  ).json();
  await page.request.put("/api/preferences/world-time", {
    data: {
      ...(prefs.value || defaultTimeConfig),
      home: {
        name: "Toronto",
        zone: "America/Toronto",
        lat: 43.65,
        lng: -79.38,
      },
    },
  });
  await page.request.post("/api/register", {
    data: {
      callsign: "P" + Date.now().toString().slice(-7),
      name: "Private Operator",
      email: "alice@example.com",
      password: "private-fields-test-123",
    },
  });
  await page.goto("/");
  await page.locator(".profile-button").click();
  await page.getByRole("menuitem", { name: "Edit Profile" }).click();
  const profile = page.locator(".profile-editor-form"),
    email = profile.getByLabel("Email address (optional)", { exact: true }),
    mobile = profile.getByLabel("Mobile number", { exact: true });
  await profile.getByRole("button", { name: "About local directory" }).hover();
  const directoryHelp = page.getByRole("tooltip");
  await expect(directoryHelp).toContainText(
    "local directory lists station profiles",
  );
  expect(
    parseFloat(
      await directoryHelp.evaluate((el) => getComputedStyle(el).fontSize),
    ),
  ).toBeLessThan(13);
  expect((await directoryHelp.boundingBox()).width).toBeLessThanOrEqual(310);
  const privacyHelp = profile.getByRole("button", {
    name: "About profile privacy",
  });
  await privacyHelp.scrollIntoViewIfNeeded();
  await privacyHelp.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "No cloud synchronization",
  );
  await page.mouse.move(0, 0);
  await expect(email).toHaveValue("a###############m");
  await email.hover();
  await expect(email).toHaveValue("alice@example.com");
  await page.mouse.move(0, 0);
  await expect(email).toHaveValue("a###############m");
  const countryPicker = profile.getByRole("combobox", {
    name: "Mobile country code",
  });
  await expect(countryPicker).toContainText("🇨🇦 +1");
  await countryPicker.click();
  await profile
    .getByRole("searchbox", { name: "Search country or dial code" })
    .fill("Canada");
  await expect(
    profile.getByRole("option", { name: /Canada.*\+1/ }),
  ).toBeVisible();
  await profile.getByRole("option", { name: /Canada.*\+1/ }).click();
  await expect(countryPicker).toContainText("🇨🇦 +1");
  await mobile.fill("1234567890");
  await expect(mobile).toHaveValue("123-456-7890");
  await email.focus();
  await page.mouse.move(0, 0);
  await expect(mobile).toHaveValue("12#-###-####");
  await email.fill("not-an-email");
  await expect(email).toHaveJSProperty(
    "validationMessage",
    "Enter a valid email address or leave it blank.",
  );
  await email.fill("alice@example.com");
  await profile
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(page.locator(".oar-toast")).toContainText(
    "Updated the local operator profile",
  );
  await expect(page.locator(".account-dialog")).not.toBeVisible();
  const saved = await (await page.request.get("/api/account")).json();
  expect(saved.mobile).toBe("123-456-7890");
  expect(saved.mobileCountry).toBe("CA");
  expect(saved.mobileDialCode).toBe("+1");
  expect(saved.email).toBe("alice@example.com");
  await page.screenshot({ path: "/tmp/oar-0.3.10-profile.png" });
  await page.request.put("/api/preferences/world-time", {
    data: prefs.value || defaultTimeConfig,
  });
});

test("selected location cards can be pinned, collapsed, saved and closed independently", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  let box = await canvas.boundingBox();
  await canvas.click({
    position: { x: box.width * 0.48, y: box.height * 0.48 },
  });
  const cards = page.getByRole("region", {
    name: "Selected location details",
    exact: true,
  });
  await expect(cards).toHaveCount(1);
  await cards
    .first()
    .getByRole("button", { name: "Pin selected location", exact: true })
    .click();
  box = await canvas.boundingBox();
  await canvas.click({
    position: { x: box.width * 0.62, y: box.height * 0.55 },
  });
  await expect(cards).toHaveCount(2);
  await cards
    .first()
    .getByRole("button", { name: "Collapse selected location", exact: true })
    .click();
  await expect(
    cards
      .first()
      .getByRole("button", { name: "Expand selected location", exact: true }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/pins")).json();
  await cards
    .last()
    .getByRole("button", { name: "Save selected location", exact: true })
    .click();
  await expect(page.locator(".oar-toast")).toContainText("Saved location");
  const after = await (await page.request.get("/api/pins")).json();
  expect(after.length).toBe(before.length + 1);
  await cards
    .first()
    .getByRole("button", { name: "Close selected location", exact: true })
    .click();
  await expect(cards).toHaveCount(1);
  for (const pin of after.filter((p) => !before.some((old) => old.id === p.id)))
    await page.request.delete("/api/pins/" + pin.id);
  expect(errors).toEqual([]);
});
