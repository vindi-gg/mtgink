import { test, expect } from "@playwright/test";
import { STATIC_ROUTES, DYNAMIC_ROUTES } from "../lib/routes";
import { visitPage, checkUrl } from "../lib/helpers";
import { collectLinks } from "../lib/crawler";

const CRAWL_ROUTES = [...STATIC_ROUTES, ...DYNAMIC_ROUTES];

test.describe("Link checker", () => {
  test("all internal links resolve", async ({ page }) => {
    const allLinks = new Map<string, string[]>(); // href -> source pages

    for (const route of CRAWL_ROUTES) {
      await visitPage(page, route);
      const { hrefs } = await collectLinks(page, route);
      for (const href of hrefs) {
        // Skip anchors with query params that are dynamic
        const path = href.split("?")[0];
        if (!allLinks.has(path)) allLinks.set(path, []);
        allLinks.get(path)!.push(route);
      }
    }

    const broken: { href: string; sources: string[]; status: number }[] = [];

    // Check unique links
    const uniqueLinks = [...allLinks.keys()];
    for (const href of uniqueLinks) {
      // Skip external, mailto, tel
      if (href.startsWith("http") || href.startsWith("mailto") || href.startsWith("tel")) continue;

      const { status, ok } = await checkUrl(page, href);
      if (!ok) {
        broken.push({ href, sources: allLinks.get(href)!, status });
      }
    }

    if (broken.length > 0) {
      const report = broken
        .map((b) => `  ${b.href} (${b.status}) — found on: ${b.sources.join(", ")}`)
        .join("\n");
      expect(broken, `Broken links:\n${report}`).toHaveLength(0);
    }
  });
});
