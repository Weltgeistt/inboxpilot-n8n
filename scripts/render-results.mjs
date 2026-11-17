// Renders docs/results.html from samples/emails.json + samples/classifications.json
// (the same sample outputs that are pinned on the AI node), then screenshots it to
// docs/screenshots/04-results-table.png at 1440x900.
//
//   node scripts/render-results.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emails = JSON.parse(await readFile(path.join(root, 'samples/emails.json'), 'utf8'));
const results = JSON.parse(await readFile(path.join(root, 'samples/classifications.json'), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const senderName = (from) => from.replace(/\s*<.*>$/, '');
const senderDomain = (from) => (from.match(/@([^>]+)>?$/) || [, ''])[1];

const ROUTE = {
  lead: 'Leads sheet + Gmail draft',
  support: 'Support sheet',
  invoice: 'Label Finance + log',
  spam: 'Label Spam + archive',
  other: 'Log only',
};

const rows = results
  .map((r) => ({ ...r, email: emails.find((e) => e.id === r.messageId) }))
  .sort((a, b) => b.urgency - a.urgency);

const counts = rows.reduce((acc, r) => ((acc[r.category] = (acc[r.category] || 0) + 1), acc), {});
const urgent = rows.filter((r) => r.urgency >= 4).length;

const dots = (n) =>
  `<span class="dots" aria-label="urgency ${n} of 5">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i <= n ? 'on u' + n : ''}"></i>`)
    .join('')}</span><b class="un">${n}</b>`;

const route = (r) => {
  let t = ROUTE[r.category];
  if (r.category === 'support' && r.urgency >= 4) t += ' + alert';
  return t;
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>InboxPilot results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#f4f5f8;--card:#fff;--ink:#14161f;--mut:#646b7d;--line:#e6e8ef;
    --lead:#0f8a5f;--lead-bg:#e3f5ed;--support:#c2410c;--support-bg:#fdecdf;--invoice:#3b5bdb;--invoice-bg:#e6ebfd;
    --spam:#7a7f8e;--spam-bg:#eceef2;--other:#8a5cd6;--other-bg:#f0e9fb}
  *{box-sizing:border-box;margin:0}
  body{background:var(--bg);font-family:Inter,system-ui,sans-serif;color:var(--ink);width:1440px;height:900px;padding:36px 48px;overflow:hidden}
  header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px}
  .brand{display:flex;gap:14px;align-items:center}
  .logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#ff6d5a,#ea4b71);display:grid;place-items:center;color:#fff;font-weight:700;font-size:20px}
  h1{font-size:24px;font-weight:700;letter-spacing:-.02em}
  .sub{color:var(--mut);font-size:13.5px;margin-top:3px}
  .meta{font:500 12px 'JetBrains Mono',monospace;color:var(--mut);text-align:right;line-height:1.6}
  .stats{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:18px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .stat b{display:block;font-size:22px;font-weight:700;letter-spacing:-.02em}
  .stat span{font-size:12px;color:var(--mut)}
  .stat.k b{color:var(--c)}
  table{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;font-size:13px}
  th{text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);background:#fafbfc;padding:10px 14px;border-bottom:1px solid var(--line)}
  td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
  tr:last-child td{border-bottom:0}
  .from b{display:block;font-weight:600;white-space:nowrap}
  .from span{color:var(--mut);font-size:11.5px}
  .subj{max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#2b2f3c}
  .cat{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:600;font-size:11.5px;color:var(--c);background:var(--b)}
  .dots{display:inline-flex;gap:3px;vertical-align:middle}
  .dots i{width:9px;height:9px;border-radius:50%;background:#e3e5eb}
  .dots i.on.u1,.dots i.on.u2{background:#9aa1b2}.dots i.on.u3{background:#e3a008}.dots i.on.u4{background:#ea6c1a}.dots i.on.u5{background:#dc2626}
  .un{font-weight:600;margin-left:7px;font-size:12px}
  .sum{color:#2b2f3c;line-height:1.4}
  .route{font-size:12px;color:var(--mut);white-space:nowrap}
  .conf{font:500 12px 'JetBrains Mono',monospace;color:var(--mut)}
  footer{margin-top:14px;font-size:12px;color:var(--mut);display:flex;justify-content:space-between}
</style></head>
<body>
<header>
  <div class="brand"><div class="logo">IP</div><div>
    <h1>InboxPilot &mdash; triage results</h1>
    <div class="sub">n8n workflow &middot; Claude classification &middot; structured output (category, urgency, summary, reply draft)</div>
  </div></div>
  <div class="meta">run: manual (sample inbox)<br>emails: ${rows.length} &middot; parser failures: 0</div>
</header>
<section class="stats">
  <div class="stat"><b>${rows.length}</b><span>emails triaged</span></div>
  ${['lead', 'support', 'invoice', 'spam', 'other']
    .map((c) => `<div class="stat k" style="--c:var(--${c})"><b>${counts[c] || 0}</b><span>${c}</span></div>`)
    .join('\n  ')}
  <div class="stat k" style="--c:#dc2626"><b>${urgent}</b><span>urgent (urgency 4&ndash;5)</span></div>
</section>
<table>
  <thead><tr><th>From</th><th>Subject</th><th>Category</th><th>Urgency</th><th>AI summary</th><th>Action taken</th><th>Conf.</th></tr></thead>
  <tbody>
  ${rows
    .map(
      (r) => `<tr>
    <td class="from"><b>${esc(senderName(r.email.from))}</b><span>${esc(senderDomain(r.email.from))}</span></td>
    <td><div class="subj">${esc(r.email.subject)}</div></td>
    <td><span class="cat" style="--c:var(--${r.category});--b:var(--${r.category}-bg)">${r.category}</span></td>
    <td style="white-space:nowrap">${dots(r.urgency)}</td>
    <td class="sum">${esc(r.summary)}</td>
    <td class="route">${route(r)}</td>
    <td class="conf">${r.confidence.toFixed(2)}</td>
  </tr>`,
    )
    .join('\n  ')}
  </tbody>
</table>
<footer><span>Sample data: fictional senders and companies. Classifications are pinned example outputs (no live API call).</span><span>InboxPilot &middot; n8n + Claude</span></footer>
</body></html>`;

const htmlPath = path.join(root, 'docs/results.html');
await writeFile(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
await page.evaluate(() => document.fonts.ready);
const out = path.join(root, 'docs/screenshots/04-results-table.png');
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
