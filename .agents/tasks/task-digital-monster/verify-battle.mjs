// Focused re-verification: battle log is localized to Japanese after the fix.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE_URL || "http://localhost:4178";
const ART = ".agents/tasks/task-digital-monster/artifacts";
mkdirSync(ART, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await (await browser.newContext()).newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

try {
  await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".game-grid", { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.click(".battle-btn");
  await page.waitForTimeout(4000);

  const result = await page.textContent(".battle-result").catch(() => null);
  const logLines = await page.locator(".battle-log li").allTextContents();
  console.log("[verify] battle result headline:", JSON.stringify(result));
  console.log("[verify] battle log lines:");
  for (const l of logLines) console.log("   ", JSON.stringify(l));

  await page.screenshot({ path: `${ART}/09-battle-localized.png`, fullPage: true });
  console.log("[verify] screenshot:", `${ART}/09-battle-localized.png`);

  // Assertions: no raw English tokens remain in the visible battle log.
  const joined = logLines.join("\n");
  const hasEnglish = /\b(hits|HP|Result|enemy|player|T\d+:)\b/.test(joined);
  const hasJaTurn = logLines.some((l) => l.includes("ターン目") && l.includes("ダメージ"));
  const hasJaResult = logLines.some((l) => l.startsWith("結果:"));
  console.log("[verify] englishTokensPresent:", hasEnglish, "jaTurnPresent:", hasJaTurn, "jaResultPresent:", hasJaResult);
  console.log("[verify] consoleErrors:", JSON.stringify(consoleErrors));
  console.log("[verify] VERDICT:", (!hasEnglish && hasJaTurn && hasJaResult) ? "PASS" : "FAIL");
} catch (err) {
  console.log("[verify] FATAL", String(err));
} finally {
  await browser.close();
  process.exit(0);
}
