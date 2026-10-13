import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = (process.env.SITE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../test-results");
const storageKey = "neuroshift.cart.v1";
const report = { base, passes: [], viewports: [], screenshots: [], errors: [] };
const pass = (name) => {
  report.passes.push(name);
  console.log(`PASS ${name}`);
};
await mkdir(output, { recursive: true });
let browser;

try {
  for (const [path, status] of [
    ["/healthz", 200],
    ["/missing-qa-page", 404],
    ["/README.md", 404],
    ["/assets/favicon.svg", 200],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, status, `HTTP status: ${path}`);
  }
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy") || "", /default-src 'self'/);
  assert.match(home.headers.get("content-security-policy") || "", /object-src 'none'/);
  pass("HTTP health, CSP, favicon and private/missing paths");

  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => report.errors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push({ type: "console", message: message.text() });
  });
  page.on("requestfailed", (request) =>
    report.errors.push({ type: "requestfailed", url: request.url(), message: request.failure()?.errorText }),
  );
  const count = async (selector, expected) => assert.equal(await page.locator(selector).count(), expected, selector);
  const hidden = async (selector) => assert.equal(await page.locator(selector).isVisible(), false, selector);
  const waitCount = async (selector, expected) => {
    await page.waitForFunction(({ selector, expected }) => document.querySelectorAll(selector).length === expected, {
      selector,
      expected,
    });
    await count(selector, expected);
  };
  const total = async (expected) =>
    assert.equal((await page.locator("#cart-total").innerText()).replace(/\D/g, ""), String(expected));
  const close = async (id) => {
    await page.locator(`${id} [data-close]`).click();
    await hidden(id);
  };
  const downloadText = async (selector, file) => {
    const event = page.waitForEvent("download");
    await page.locator(selector).first().click();
    const download = await event;
    assert.equal(await download.failure(), null);
    await download.saveAs(resolve(output, file));
    return { text: await readFile(await download.path(), "utf8"), filename: download.suggestedFilename() };
  };

  await page.goto(base, { waitUntil: "networkidle" });
  await waitCount("#course-grid .course-card", 6);
  await count("#project-grid .project-item", 8);
  await count("#module-list details", 8);
  await count("#faq-list details", 8);
  await count("#resource-list .resource-row", 4);
  pass("Content counts: 6 courses, 8 projects/modules/FAQ, 4 resources");

  await page.locator('[data-category="creative"]').click();
  await waitCount("#course-grid .course-card", 2);
  await page.locator("#level-filter").selectOption("beginner");
  await waitCount("#course-grid .course-card", 1);
  await page.locator('[data-category="business"]').click();
  await waitCount("#course-grid .course-card", 0);
  assert.equal(await page.locator("#catalog-empty").isVisible(), true);
  await page.locator("#reset-filters").click();
  await waitCount("#course-grid .course-card", 6);
  assert.equal(await page.locator("#level-filter").inputValue(), "all");
  await page.locator('[data-route="work"]').click();
  await waitCount("#course-grid .course-card", 2);
  assert.equal(await page.locator('[data-category="work"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-category="all"]').click();
  await waitCount("#course-grid .course-card", 6);
  pass("Catalog combined filters, empty/reset state and work route");

  await page.locator('[data-course="prompt-basics"]').click();
  assert.equal(await page.locator("#detail-dialog").isVisible(), true);
  await count("#detail-dialog .detail-modules li", 4);
  await page.locator('#detail-dialog [data-add="prompt-basics"]').click();
  assert.equal(await page.locator("#cart-count").innerText(), "1");
  await page.locator('#detail-dialog [data-add="prompt-basics"]').click();
  await hidden("#detail-dialog");
  await count("#cart-items .cart-item", 1);
  await total(9900);
  await close("#cart-dialog");
  await page.locator('#course-grid [data-add="ai-work"]').click();
  await page.locator("[data-open-cart]").click();
  await count("#cart-items .cart-item", 2);
  await total(24800);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#cart-count").innerText(), "2");
  await page.locator("[data-open-cart]").click();
  await count("#cart-items .cart-item", 2);
  await total(24800);
  await page.locator('[data-remove="prompt-basics"]').click();
  await count("#cart-items .cart-item", 1);
  await total(14900);
  const selectedTitle = await page.locator("#cart-items h3").innerText();
  pass("Course detail, duplicate prevention, totals, persistence and removal");

  await page.locator("#cart-checkout").click();
  assert.equal(await page.locator("#request-dialog").isVisible(), true);
  await page.locator('#request-form button[type="submit"]').click();
  assert.equal(await page.locator("#request-form").evaluate((form) => form.checkValidity()), false);
  await hidden("#request-result");
  await page.locator('[name="name"]').fill("QA Test");
  await page.locator('[name="email"]').fill("invalid-email");
  assert.equal(await page.locator('[name="email"]').evaluate((input) => input.validity.typeMismatch), true);
  await page.locator('[name="email"]').fill("qa@example.com");
  await page.locator('[name="goal"]').fill("Учебная QA задача: подготовка рабочего документа.");
  await page.locator('#request-form button[type="submit"]').click();
  assert.equal(await page.locator("#request-result").isVisible(), true);
  const request = await downloadText("#request-download", "request-qa.txt");
  assert.match(request.filename, /\.txt$/);
  assert.ok(request.text.includes("QA Test") && request.text.includes("qa@example.com"));
  assert.ok(request.text.includes(selectedTitle));
  assert.match(request.text, /не отправлен автоматически/i);
  await page.locator('[name="goal"]').fill("Изменённая учебная QA задача.");
  await hidden("#request-result");
  assert.equal(await page.locator("#request-download").getAttribute("href"), null);
  await close("#request-dialog");
  pass("Native form validation, local request download and stale-file reset");

  await page.locator('[data-scenario="learning"]').click();
  assert.equal(await page.locator('[data-scenario="learning"]').getAttribute("aria-pressed"), "true");
  const prompt = await page.locator("#improved-prompt").innerText();
  assert.ok(prompt.length > 100);
  await page.locator("#copy-prompt").click();
  await page.waitForFunction((expected) => navigator.clipboard.readText().then((value) => value === expected), prompt);
  const module = page.locator("#module-list details").nth(1);
  await module.locator("summary").click();
  assert.equal(await module.getAttribute("open"), "");
  const faq = page.locator("#faq-list details").first();
  await faq.locator("summary").click();
  assert.equal(await faq.getAttribute("open"), "");
  await page.locator('[data-project="automation"]').click();
  assert.ok((await page.locator("#detail-dialog pre").innerText()).length > 100);
  await close("#detail-dialog");
  await page.locator('[data-project="poster"]').click();
  assert.equal(
    await page.locator("#detail-dialog img").evaluate(async (img) => {
      await img.decode();
      return img.naturalWidth > 0;
    }),
    true,
  );
  await close("#detail-dialog");
  const material = await downloadText("#resource-list a[download]", "prompt-checklist.md");
  assert.match(material.filename, /\.md$/);
  assert.ok(material.text.length > 1000);
  pass("Prompt switch/copy, disclosures, gallery document/image and material download");

  await page.evaluate((key) => localStorage.setItem(key, "{corrupt-json"), storageKey);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#cart-count").innerText(), "0");
  await page.locator("[data-open-cart]").click();
  await count("#cart-items .cart-item", 0);
  await close("#cart-dialog");
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify(["unknown-course", "ai-work", "ai-work"])),
    storageKey,
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#cart-count").innerText(), "1");
  await page.locator("[data-open-cart]").click();
  await count("#cart-items .cart-item", 1);
  await total(14900);
  await close("#cart-dialog");
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.reload({ waitUntil: "networkidle" });
  pass("Corrupt cart storage, unknown IDs and duplicate IDs recover");

  for (const image of await page.locator("main img").all()) {
    await image.scrollIntoViewIfNeeded();
    assert.equal(
      await image.evaluate(async (img) => {
        await img.decode();
        return img.complete && img.naturalWidth > 0;
      }),
      true,
    );
  }
  pass("All main images load and decode");
  for (const width of [1920, 1440, 1024, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    assert.ok(
      dimensions.page <= dimensions.viewport + 1,
      `Horizontal page overflow at ${width}: ${JSON.stringify(dimensions)}`,
    );
    report.viewports.push({ width, ...dimensions });
    if (width === 1440 || width === 390) {
      const filename = width === 1440 ? "desktop-1440.png" : "mobile-390.png";
      await page.screenshot({ path: resolve(output, filename), fullPage: true });
      report.screenshots.push(filename);
    }
  }
  report.shortViewports = [];
  for (const [width, height] of [[390, 667], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const heroBottom = await page.locator(".hero").evaluate((hero) => hero.getBoundingClientRect().bottom);
    assert.ok(heroBottom <= height - 20, `Hero hides next section at ${width}x${height}: ${heroBottom}`);
    report.shortViewports.push({ width, height, heroBottom });
    const filename = `short-${width}.png`;
    await page.screenshot({ path: resolve(output, filename), fullPage: true });
    report.screenshots.push(filename);
  }
  pass("Short viewports reveal the following section");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#menu-toggle").click();
  assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "true");
  await page.locator('#main-nav a[href="#courses"]').click();
  assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "false");
  await page.locator("#menu-toggle").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "false");
  pass("Seven responsive widths, full-page screenshots and mobile menu");
  assert.deepEqual(report.errors, [], "Browser errors");
  pass("No page errors, console errors or failed requests");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.stack || String(error);
  throw error;
} finally {
  try {
    await browser?.close();
  } finally {
    await writeFile(resolve(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
}
