import { test, expect } from "@playwright/test";

test("repeated saves require explicit duplicate consent; Enter and Space default to Cancel", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 213, y: 171 } });
  const save = page
    .getByRole("region", { name: "Selected location details", exact: true })
    .getByRole("button", { name: "Save selected location", exact: true });
  const before = await (await page.request.get("/api/pins")).json();
  await save.click();
  await expect(
    page.locator(".oar-toast").filter({ hasText: "Saved location" }),
  ).toBeVisible();
  const count = async () =>
    (await (await page.request.get("/api/pins")).json()).length;
  await expect.poll(count).toBe(before.length + 1);
  for (const key of ["Enter", "Space"]) {
    await save.click();
    const dialog = page.getByRole("dialog", { name: "Please confirm" });
    await expect(dialog).toContainText("Create a duplicate?");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press(key);
    await expect(dialog).toHaveCount(0);
    expect(await count()).toBe(before.length + 1);
  }
  await save.click();
  const dialog = page.getByRole("dialog", { name: "Please confirm" });
  await dialog.getByRole("button", { name: "Confirm", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(count).toBe(before.length + 2);
  for (const pin of await (await page.request.get("/api/pins")).json())
    if (!before.some((p) => p.id === pin.id))
      await page.request.delete("/api/pins/" + pin.id);
});

test("profile photo updates the topbar immediately and survives reload; removal restores initials", async ({
  page,
}) => {
  await page.goto("/");
  const callsign = "P" + Date.now().toString().slice(-8);
  expect(
    (
      await page.request.post("/api/register", {
        data: {
          callsign,
          name: "Photo Test",
          email: "photo@example.com",
          password: "photo-test-password-123",
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await page.locator(".profile-button").click();
  await page
    .getByRole("menuitem", { name: "Edit Profile", exact: true })
    .click();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    c.getContext("2d").fillRect(0, 0, 16, 16);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload avatar").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.locator(".profile-button img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".profile-button img")).toBeVisible();
  await page.locator(".profile-button").click();
  await page
    .getByRole("menuitem", { name: "Edit Profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove avatar", exact: true })
    .click();
  await expect(page.locator(".profile-button img")).toHaveCount(0);
});

test("completed update checks automatically hide within six seconds and a manual recheck can show them again", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.oarDesktop = {
      connection: async () => ({ demo: false }),
      request: async (route, options = {}) => {
        const response = await fetch("/api" + route, options);
        if (!response.ok) throw Error("Local test request failed");
        return response.json();
      },
      onUpdate: (fn) => {
        window.testUpdate = fn;
        return () => {};
      },
      update: async () => ({ phase: "idle" }),
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.testUpdate === "function");
  await page.evaluate(() =>
    window.testUpdate({
      phase: "current",
      message: "You are running the latest version.",
    }),
  );
  const notice = page.getByRole("region", { name: "AROAC update" });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(0, { timeout: 6500 });
  await page.evaluate(() =>
    window.testUpdate({ phase: "checking", message: "Checking" }),
  );
  await expect(notice).toBeVisible();
  await page.evaluate(() =>
    window.testUpdate({
      phase: "current",
      message: "You are running the latest version.",
    }),
  );
  await expect(notice).toContainText("latest version");
});
