// Takes the README screenshots from a LOCAL n8n instance (127.0.0.1:5678).
//
// Prerequisites (see README "Reproduce the screenshots"):
//   - n8n running locally with N8N_USER_FOLDER=./.n8n-data
//   - workflows imported (clean exports + the pinned-data demo variant)
//   - N8N_DEMO_EMAIL / N8N_DEMO_PASSWORD = the local owner account you created
//
//   node scripts/screenshots.mjs [canvas|run|all]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'docs/screenshots');
const base = process.env.N8N_URL || 'http://127.0.0.1:5678';
const email = process.env.N8N_DEMO_EMAIL;
const password = process.env.N8N_DEMO_PASSWORD;
if (!email || !password) throw new Error('Set N8N_DEMO_EMAIL and N8N_DEMO_PASSWORD (local demo owner).');
const what = process.argv[2] || 'all';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const login = await ctx.request.post(base + '/rest/login', { data: { emailOrLdapLoginId: email, password } });
if (!login.ok()) throw new Error('login failed: ' + login.status());
const page = await ctx.newPage();

// Hide transient UI (toasts, tooltips) so captures are clean.
await page.addInitScript(() => {
  const css = `.el-notification, .n8n-tooltip, [role="tooltip"], .el-popper.is-dark { display: none !important; }`;
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  });
});

async function openWorkflow(id) {
  await page.goto(`${base}/workflow/${id}`);
  await page.locator('.vue-flow__node').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await fitView();
}

async function fitView() {
  await page.mouse.click(720, 120); // focus the canvas (empty area)
  await page.keyboard.press('1'); // n8n shortcut: zoom to fit
  await page.waitForTimeout(800);
  await page.mouse.move(1430, 700); // keep hover effects off the nodes
  await page.waitForTimeout(300);
}

async function canvas(id, file) {
  await openWorkflow(id);
  await page.screenshot({ path: path.join(shots, file) });
  console.log('wrote', file);
}

if (what === 'canvas' || what === 'all') {
  await canvas('InboxPilotMain01', '01-main-workflow.png');
  await canvas('InboxPilotDigest', '05-daily-digest.png');
  await canvas('InboxPilotErrors', '06-error-workflow.png');
}

if (what === 'run' || what === 'all') {
  // Demo variant: identical workflow with sample outputs pinned on the AI node and on
  // the Gmail/Sheets/Slack nodes, so a manual run needs no credentials and makes no API calls.
  await openWorkflow('InboxPilotDemo01');
  // Run from the demo trigger: hover the trigger node and press its execute button.
  const trigger = page
    .locator('.vue-flow__node')
    .filter({ hasText: 'Run demo (sample inbox)' })
    .filter({ hasNotText: 'How to run' });
  await trigger.hover();
  await trigger.getByRole('button', { name: /execute workflow/i }).first().click();
  await page.waitForTimeout(6000);
  await fitView();
  await page.screenshot({ path: path.join(shots, '02-demo-run.png') });
  console.log('wrote 02-demo-run.png');

  // Open the AI node to show the structured classification output.
  await page.locator('.vue-flow__node').filter({ hasText: 'Classify with Claude' }).filter({ hasNotText: '2 · Classify' }).dblclick();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, '03-classification-output.png') });
  console.log('wrote 03-classification-output.png');
}

await browser.close();
