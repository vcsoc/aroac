import { test, expect } from "@playwright/test";
test("desktop registration, logbook, globe and mobile navigation", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to have you on air." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign in", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "New here? Create your station" })
    .click();
  const callsign = "T" + Date.now().toString().slice(-7) + "A";
  await page.getByLabel("Callsign", { exact: true }).fill(callsign);
  await page.getByLabel("Name", { exact: true }).fill("Browser Operator");
  await page.getByLabel("Email").fill("browser@example.com");
  await expect(page.getByLabel("Maidenhead grid")).not.toHaveAttribute(
    "required",
  );
  // Register without knowing a station locator.
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("checkbox").last().check();
  await page
    .getByRole("button", { name: "Create station", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Log a contact", exact: true })
    .click();
  await page.getByRole("button", { name: "Log contact", exact: true }).click();
  await page.getByLabel("Callsign", { exact: true }).fill("W1XYZ");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(
    page.getByRole("cell", { name: "W1XYZ", exact: true }),
  ).toBeVisible();
  const peerCall = "R" + Date.now().toString().slice(-7) + "B";
  const peerResponse = await request.post("/api/register", {
    data: {
      callsign: peerCall,
      name: "Remote operator",
      email: "remote@example.com",
      grid: "JF96",
      password: "remote-test-password",
    },
  });
  expect(peerResponse.status()).toBe(201);
  await page
    .getByRole("button", { name: "Messages", exact: false })
    .first()
    .click();
  await page.getByLabel("Find callsign").fill(peerCall);
  await page.getByRole("button", { name: new RegExp(peerCall) }).click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("CQ from the browser. 73!");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("CQ from the browser. 73!", { exact: true }),
  ).toBeVisible();
  const me = await (await page.request.get("/api/me")).json();
  const received = await (await request.get("/api/messages/" + me.id)).json();
  expect(received.at(-1).body).toBe("CQ from the browser. 73!");
  await request.post("/api/messages/" + me.id, {
    data: { body: "Received, 73 from the remote operator." },
  });
  await expect(
    page.getByText("Received, 73 from the remote operator.", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "World atlas" }).click();
  await page
    .getByRole("switch", { name: "Map projection", exact: true })
    .click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect(
    (await page.locator(".world-map").boundingBox()).height,
  ).toBeGreaterThan(300);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "/tmp/oar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "/tmp/oar-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
