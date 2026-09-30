import { test, expect } from "@playwright/test";

test("radio programming opens a full-page workspace with map-independent navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Radio programming", exact: true })
    .click();
  const workspace = page.locator("#radio-workspace");
  await expect(workspace).toBeVisible();
  await expect(
    workspace.getByRole("heading", { name: "Radio channels & programming" }),
  ).toBeVisible();
  await expect(workspace).toContainText(
    "Sign in to create a private programming list.",
  );
  await expect(
    workspace.getByRole("button", {
      name: "Download repeaters for offline use",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Radio programming", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#map-drawer")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page
    .getByRole("button", { name: "Radio channels", exact: true })
    .click();
  await expect(workspace).toBeVisible();
});
