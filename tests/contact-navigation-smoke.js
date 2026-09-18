import { _electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(tmpdir(), "oar-contact-nav-"));
let app, page;
try {
  app = await _electron.launch({
    ...(process.env.OAR_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.OAR_DESKTOP_EXECUTABLE }
      : {}),
    args: [
      ...(process.env.OAR_DESKTOP_EXECUTABLE ? [] : ["."]),
      "--user-data-dir=" + dir,
    ],
    env: { ...process.env, OAR_DEV_URL: "" },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "Add clock", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await window.oarDesktop.setOffline(true);
    const post = (route, body) =>
      window.oarDesktop.request(route, {
        method: "POST",
        body: JSON.stringify(body),
      });
    await post("/pins", {
      label: "Durban home",
      callsign: "ZS1ABC",
      lat: -29.8579,
      lng: 31.0292,
    });
    await post("/pins", {
      label: "Valletta portable",
      callsign: "9H1ABC",
      lat: 35.8992,
      lng: 14.5141,
    });
    await post("/address-book", {
      name: "Durban operator",
      callsign: "ZS1ABC",
    });
    await post("/address-book", {
      name: "Grid operator",
      callsign: "VE3ABC",
      grid: "FN03",
    });
    await post("/address-book", {
      name: "Unknown location",
      callsign: "N0UNKNOWN",
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Saved locations", exact: true })
    .click();
  const map = page.locator(".world-map");
  await page
    .getByRole("button", {
      name: "Go to saved location Durban home",
      exact: true,
    })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "-29.8579,31.0292",
  );
  await page
    .getByRole("button", {
      name: "Go to saved location Valletta portable",
      exact: true,
    })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "35.8992,14.5141",
  );
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page
    .getByRole("button", { name: "Go to contact Durban operator", exact: true })
    .click();
  await expect(map).toHaveAttribute(
    "data-selected-location",
    "-29.8579,31.0292",
  );
  await expect(
    page.getByRole("img", {
      name: "Selected contact Durban operator",
      exact: true,
    }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Go to contact Grid operator", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-selected-location", "43.5,-79");
  await expect(page.locator(".location-pane")).toContainText(
    "Approximate centre of grid FN03",
  );
  await expect(
    page.getByRole("img", {
      name: "Selected contact Grid operator",
      exact: true,
    }),
  ).toHaveCount(1);
  const row = page.locator("[data-contact-id]").filter({
    has: page.getByRole("button", {
      name: "Go to contact Grid operator",
      exact: true,
    }),
  });
  await row
    .getByRole("button", { name: "Edit contact Grid operator", exact: true })
    .click();
  await row.getByLabel(/email for contact/).fill("edited@example.test");
  assert.equal(await map.getAttribute("data-selected-location"), "43.5,-79");
  await page
    .getByRole("button", {
      name: "Go to contact Unknown location",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /No location saved for this contact/ }),
  ).toBeVisible();
  await expect(map).toHaveAttribute("data-selected-location", "43.5,-79");
  await page.screenshot({ path: "/tmp/oar-contact-navigation.png" });
  console.log(
    "Contact navigation passed: saved-pin name clicks, callsign-matched coordinates, grid-centre navigation and markers, edit controls, and explicit missing-location messages.",
  );
} catch (e) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "/tmp/oar-contact-navigation-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-5000));
  }
  throw e;
} finally {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
}
