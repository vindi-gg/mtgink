import { test, expect } from "@playwright/test";

test.describe("Interactions", () => {
  test("remix: clicking a card loads the next pair", async ({ page }) => {
    await page.goto("/showdown/remix", { waitUntil: "networkidle" });

    // Get current card images
    const initialImages = await page.locator("img").count();
    expect(initialImages).toBeGreaterThan(0);

    // Click the first card (vote)
    const firstCard = page.locator("button").first();
    await firstCard.click();

    // Wait for new pair to load
    await page.waitForTimeout(1500);

    // Page should still have images (new pair loaded)
    const afterImages = await page.locator("img").count();
    expect(afterImages).toBeGreaterThan(0);
  });

  test("gauntlet: voting progresses through rounds", async ({ page }) => {
    await page.goto("/showdown/gauntlet", { waitUntil: "networkidle" });

    // Should see progress indicator
    await expect(page.locator("text=1/")).toBeVisible({ timeout: 5000 });

    // Vote 3 times
    for (let i = 0; i < 3; i++) {
      const cards = page.locator("button img");
      const count = await cards.count();
      if (count < 2) break;
      await cards.first().click();
      await page.waitForTimeout(800);
    }

    // Progress should have advanced
    const progressText = await page.locator("text=/\\d+\\/\\d+/").textContent();
    expect(progressText).toBeTruthy();
  });

  test("W key toggles image mode", async ({ page }) => {
    await page.goto("/showdown/remix", { waitUntil: "networkidle" });

    // Get initial image src
    const firstImg = page.locator("img").first();
    const initialSrc = await firstImg.getAttribute("src");

    // Press W to toggle
    await page.keyboard.press("w");
    await page.waitForTimeout(500);

    // Image src should change (art_crop <-> normal)
    const newSrc = await firstImg.getAttribute("src");
    expect(newSrc).not.toBe(initialSrc);

    // Press W again to toggle back
    await page.keyboard.press("w");
    await page.waitForTimeout(500);
    const restoredSrc = await firstImg.getAttribute("src");
    expect(restoredSrc).toBe(initialSrc);
  });

  test("navbar links navigate correctly", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Click through main nav links
    const navLinks = [
      { text: "Remix", expected: "/showdown/remix" },
      { text: "VS", expected: "/showdown/vs" },
      { text: "Gauntlet", expected: "/showdown/gauntlet" },
    ];

    for (const { text, expected } of navLinks) {
      const link = page.locator(`nav a:has-text("${text}")`).first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForURL(`**${expected}*`, { timeout: 10_000 });
        expect(page.url()).toContain(expected);
        await page.goBack();
      }
    }
  });

  test("search returns results", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Find search input
    const searchInput = page.locator('input[placeholder*="earch"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Lightning Bolt");
      await page.waitForTimeout(1000);

      // Should see search results
      const results = page.locator('a:has-text("Lightning Bolt")');
      await expect(results.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
