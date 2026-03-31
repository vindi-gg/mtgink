import { test, expect } from "@playwright/test";
import { ALL_ROUTES } from "../lib/routes";
import { visitPage, collectConsoleErrors } from "../lib/helpers";

test.describe("Smoke tests", () => {
  for (const route of ALL_ROUTES) {
    test(`${route} returns 200 with no console errors`, async ({ page }) => {
      const errors: { type: string; text: string }[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          // Ignore known noisy errors
          const text = msg.text();
          if (text.includes("favicon") || text.includes("_next/static")) return;
          errors.push({ type: msg.type(), text });
        }
      });

      const status = await visitPage(page, route);
      expect(status, `${route} returned ${status}`).toBe(200);
      expect(errors, `Console errors on ${route}: ${errors.map((e) => e.text).join(", ")}`).toHaveLength(0);
    });
  }
});
