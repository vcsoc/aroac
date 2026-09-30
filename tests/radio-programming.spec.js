import { test, expect } from "@playwright/test";

test("radio programming list and directory download are discoverable without claiming direct USB support", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Radio programming", exact: true })
    .click();
  const drawer = page.getByRole("complementary", {
    name: "Radio programming",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(
    "Direct USB programming is available only in the tested Linux desktop app.",
  );
  await expect(drawer).toContainText(
    "Sign in to create a private programming list.",
  );
  await expect(
    drawer.getByRole("button", { name: "Download repeaters for offline use" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Radio programming", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("button", { name: "Radio programming", exact: true })
    .click();
  await expect(page.locator("#map-drawer")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});
