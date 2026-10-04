// Playwright E2E for the Digital Monster game against the live CloudFront site.
// Run: node .agents/tasks/task-digital-monster/e2e.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE_URL || "https://dctfcixprjknt.cloudfront.net";
const ART = ".agents/tasks/task-digital-monster/artifacts";
mkdirSync(ART, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

function log(...a) { console.log("[e2e]", ...a); }

async function shot(page, name) {
  const path = `${ART}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  log("screenshot:", path);
}

// Read StatsPanel values from the DOM.
async function readStats(page) {
  return page.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const stage = txt(".stage-badge");
    const mood = txt(".mood");
    const train = txt(".train-count");
    const hp = txt(".stat-row .stat-value");
    return { stage, mood, train, hp };
  });
}

async function errorBanner(page) {
  return page.evaluate(() => document.querySelector(".app-error")?.textContent?.trim() ?? null);
}

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  log(ok ? "PASS" : "FAIL", step, detail ? `- ${detail}` : "");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
});

try {
  // 1. Load
  log("navigating to", SITE);
  await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".game-grid", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const title = await page.textContent("h1").catch(() => null);
  record("load:title", title?.includes("デジタルモンスター") ?? false, `h1="${title}"`);

  const spriteCount = await page.locator(".sprite-wrap svg").count();
  record("load:sprite-renders", spriteCount > 0, `svg count=${spriteCount}`);

  const stageBadge = await page.textContent(".stage-badge").catch(() => null);
  record("load:baby-stage", stageBadge === "幼年期", `stage=${stageBadge}`);

  // Japanese labels present
  const bodyText = await page.textContent("body");
  const labels = ["お世話", "餌やり", "トレーニング", "睡眠", "清掃", "バトル", "会話"];
  const missing = labels.filter((l) => !bodyText.includes(l));
  record("load:jp-labels", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : "all present");

  await shot(page, "01-load-baby");

  // 2. Care: feed
  const beforeFeed = await readStats(page);
  await page.click(".care-btn.feed");
  await page.waitForTimeout(1500);
  const afterFeed = await readStats(page);
  record("care:feed-no-error", (await errorBanner(page)) === null, `mood ${beforeFeed.mood} -> ${afterFeed.mood}`);
  await shot(page, "02-after-feed");

  // 3. Care: train (x3 to also reach evolution threshold of 2)
  let trainOk = true;
  for (let i = 0; i < 3; i++) {
    await page.click(".care-btn.train");
    await page.waitForTimeout(1200);
    if ((await errorBanner(page)) !== null) trainOk = false;
  }
  const afterTrain = await readStats(page);
  record("care:train-no-error", trainOk, `trainCount=${afterTrain.train}`);
  record("care:train-count-up", afterTrain.train !== beforeFeed.train, `${beforeFeed.train} -> ${afterTrain.train}`);
  await shot(page, "03-after-train");

  // 4. Care: sleep toggle
  const sleepBtnBefore = await page.textContent(".care-btn.sleep");
  await page.click(".care-btn.sleep");
  await page.waitForTimeout(1500);
  const sleepBtnAfter = await page.textContent(".care-btn.sleep");
  const moodSleep = await readStats(page);
  record("care:sleep-toggle", sleepBtnBefore !== sleepBtnAfter, `btn "${sleepBtnBefore?.trim()}" -> "${sleepBtnAfter?.trim()}"`);
  record("care:sleep-no-error", (await errorBanner(page)) === null, `mood=${moodSleep.mood}`);
  await shot(page, "04-after-sleep");
  // wake back up
  await page.click(".care-btn.sleep");
  await page.waitForTimeout(1200);

  // 5. Care: clean
  await page.click(".care-btn.clean");
  await page.waitForTimeout(1500);
  record("care:clean-no-error", (await errorBanner(page)) === null, "");
  await shot(page, "05-after-clean");

  // 6. Battle
  const hpBefore = (await readStats(page)).hp;
  await page.click(".battle-btn");
  await page.waitForTimeout(4000);
  const battleResult = await page.textContent(".battle-result").catch(() => null);
  const battleLogCount = await page.locator(".battle-log li").count();
  const hpAfter = (await readStats(page)).hp;
  record("battle:result-renders", battleResult !== null, `result=${battleResult}`);
  record("battle:log-renders", battleLogCount > 0, `log lines=${battleLogCount}`);
  record("battle:no-error", (await errorBanner(page)) === null, `hp ${hpBefore} -> ${hpAfter}`);
  await shot(page, "06-after-battle");

  // 7. Evolution: we have >=2 training; wait for the >1min age gate + the 15s tick.
  log("waiting for evolution (age gate 1min + 15s tick)...");
  let evolved = false;
  const evoDeadline = Date.now() + 90000;
  while (Date.now() < evoDeadline) {
    const banner = await page.locator(".evolution-banner").count();
    const stage = await page.textContent(".stage-badge").catch(() => null);
    if (banner > 0 || stage === "成長期") { evolved = true; break; }
    await page.waitForTimeout(5000);
  }
  const stageNow = await page.textContent(".stage-badge").catch(() => null);
  record("evolution:reached-rookie", stageNow === "成長期", `stage=${stageNow}, bannerSeen=${evolved}`);
  await shot(page, "07-evolution");

  // 8. Chat
  const chatDisabledHint = await page.locator(".chat-disabled-hint").count();
  const chatInput = await page.locator(".chat-form input").count();
  if (stageNow === "成長期" && chatInput > 0) {
    await page.fill(".chat-form input", "こんにちは、げんき？");
    await page.click(".chat-form button[type=submit]");
    log("chat sent, waiting for reply...");
    await page.waitForTimeout(15000);
    const monsterLines = await page.locator(".chat-line.monster .chat-bubble").allTextContents();
    const gotReply = monsterLines.some((t) => t && t !== "…");
    record("chat:reply-renders", gotReply, `lines=${JSON.stringify(monsterLines)}`);
    await shot(page, "08-chat");
  } else {
    record("chat:baby-disabled", chatDisabledHint > 0, `disabled hint present=${chatDisabledHint > 0} (still baby)`);
    await shot(page, "08-chat-baby");
  }

} catch (err) {
  record("fatal", false, String(err));
} finally {
  log("=== CONSOLE ERRORS ===", JSON.stringify(consoleErrors, null, 2));
  log("=== PAGE ERRORS ===", JSON.stringify(pageErrors, null, 2));
  log("=== FAILED REQUESTS ===", JSON.stringify(failedRequests, null, 2));
  log("=== RESULTS ===");
  for (const r of results) log(`${r.ok ? "PASS" : "FAIL"} :: ${r.step} :: ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(0);
}
