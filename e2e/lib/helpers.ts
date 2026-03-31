import type { Page } from "@playwright/test";

export interface ConsoleError {
  type: string;
  text: string;
}

/** Navigate to a route and wait for network idle. Returns the response status. */
export async function visitPage(page: Page, route: string): Promise<number> {
  const response = await page.goto(route, { waitUntil: "networkidle", timeout: 20_000 });
  return response?.status() ?? 0;
}

/** Collect console errors during a callback. */
export async function collectConsoleErrors(
  page: Page,
  fn: () => Promise<void>
): Promise<ConsoleError[]> {
  const errors: ConsoleError[] = [];
  const handler = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") {
      errors.push({ type: msg.type(), text: msg.text() });
    }
  };
  page.on("console", handler);
  await fn();
  page.removeListener("console", handler);
  return errors;
}

/** Check a URL responds with a non-error status via HEAD request. */
export async function checkUrl(
  page: Page,
  url: string
): Promise<{ url: string; status: number; ok: boolean }> {
  try {
    const response = await page.request.head(url, { timeout: 10_000 });
    return { url, status: response.status(), ok: response.status() < 400 };
  } catch {
    return { url, status: 0, ok: false };
  }
}
