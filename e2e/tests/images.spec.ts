import { test, expect } from "@playwright/test";
import { STATIC_ROUTES, DYNAMIC_ROUTES } from "../lib/routes";
import { visitPage } from "../lib/helpers";
import { collectImages } from "../lib/crawler";

const CRAWL_ROUTES = [...STATIC_ROUTES, ...DYNAMIC_ROUTES];

test.describe("Image checker", () => {
  test("no broken images on key pages", async ({ page }) => {
    const allBroken: { src: string; route: string }[] = [];

    for (const route of CRAWL_ROUTES) {
      await visitPage(page, route);
      // Give lazy images a moment to load
      await page.waitForTimeout(1000);
      const { broken } = await collectImages(page, route);
      for (const src of broken) {
        allBroken.push({ src, route });
      }
    }

    if (allBroken.length > 0) {
      const report = allBroken
        .map((b) => `  ${b.src} — on ${b.route}`)
        .join("\n");
      expect(allBroken, `Broken images:\n${report}`).toHaveLength(0);
    }
  });
});
