import type { Page } from "@playwright/test";

export interface PageLinks {
  route: string;
  hrefs: string[];
}

export interface PageImages {
  route: string;
  srcs: string[];
  broken: string[];
}

/** Collect all internal <a href> links on a page. */
export async function collectLinks(page: Page, route: string): Promise<PageLinks> {
  const baseUrl = new URL(page.url()).origin;

  const hrefs = await page.evaluate((origin) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors
      .map((a) => a.getAttribute("href")!)
      .filter((href) => {
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
        if (href.startsWith("/")) return true;
        try {
          return new URL(href).origin === origin;
        } catch {
          return false;
        }
      })
      .map((href) => (href.startsWith("/") ? href : new URL(href).pathname));
  }, baseUrl);

  return { route, hrefs: [...new Set(hrefs)] };
}

/** Collect all <img> sources and check which are broken. */
export async function collectImages(page: Page, route: string): Promise<PageImages> {
  const result = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const srcs: string[] = [];
    const broken: string[] = [];
    for (const img of imgs) {
      const src = img.src || img.getAttribute("src") || "";
      if (!src) continue;
      srcs.push(src);
      if (img.complete && img.naturalWidth === 0) {
        broken.push(src);
      }
    }
    return { srcs, broken };
  });

  return { route, ...result };
}
