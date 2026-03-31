import { test, expect } from "@playwright/test";
import { VISUAL_ROUTES } from "../lib/routes";
import { visitPage } from "../lib/helpers";

test.describe("Visual regression", () => {
  for (const { name, path } of VISUAL_ROUTES) {
    test(`${name} matches screenshot`, async ({ page }) => {
      await visitPage(page, path);
      // Wait for images and animations to settle
      await page.waitForTimeout(2000);
      await expect(page).toHaveScreenshot({
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  }
});
