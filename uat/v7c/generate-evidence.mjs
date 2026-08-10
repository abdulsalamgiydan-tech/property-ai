#!/usr/bin/env node
/**
 * V7C UAT evidence generator. Reads the Playwright JSON report and curated screenshots,
 * then emits a machine-readable result (docs/decisions/v7c_screenshots/uat-result.json)
 * and refreshes the "Automated browser UAT results" section of the evidence markdown.
 * Never reads or writes secrets.
 */
import fs from "node:fs";
import path from "node:path";

const REPORT = "uat/v7c/.artifacts/report.json";
const SHOT_DIR = "docs/decisions/v7c_screenshots";
const RESULT_JSON = path.join(SHOT_DIR, "uat-result.json");
const EVIDENCE_MD = "docs/decisions/V7C_preview_UAT_evidence.md";
const MARK = "<!-- AUTOMATED-UAT-RESULTS -->";

function flatten(suite, acc = []) {
  for (const s of suite.suites ?? []) flatten(s, acc);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const project = t.projectName || t.projectId || "unknown";
      const status = t.results?.[t.results.length - 1]?.status ?? "unknown";
      acc.push({ title: spec.title, project, ok: t.status === "expected", status });
    }
  }
  return acc;
}

let report;
try {
  report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
} catch {
  console.error(`No Playwright report at ${REPORT} — run \`npm run uat:v7c\` first.`);
  process.exit(1);
}

const tests = (report.suites ?? []).flatMap((s) => flatten(s));
const byProject = {};
for (const t of tests) {
  byProject[t.project] ??= { passed: 0, failed: 0, tests: [] };
  byProject[t.project][t.ok ? "passed" : "failed"]++;
  byProject[t.project].tests.push({ title: t.title, ok: t.ok, status: t.status });
}
const shots = fs.existsSync(SHOT_DIR)
  ? fs.readdirSync(SHOT_DIR).filter((f) => f.endsWith(".png")).sort()
  : [];
const allPassed = tests.length > 0 && tests.every((t) => t.ok);

const result = {
  generatedAt: new Date().toISOString(),
  preview: process.env.VERCEL_PREVIEW_URL ?? null,
  isolatedSupabaseRef: "mmqxwwjshnpcqngciqtx",
  totals: { tests: tests.length, passed: tests.filter((t) => t.ok).length, failed: tests.filter((t) => !t.ok).length },
  byProject,
  screenshots: shots,
  allPassed,
};
fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.writeFileSync(RESULT_JSON, JSON.stringify(result, null, 2));

const rows = tests
  .sort((a, b) => a.title.localeCompare(b.title) || a.project.localeCompare(b.project))
  .map((t) => `| ${t.title} | ${t.project} | ${t.ok ? "PASS" : "**FAIL**"} |`)
  .join("\n");
const section = [
  MARK,
  "",
  `## Automated browser UAT results (Playwright)`,
  `Generated ${result.generatedAt} against \`${result.preview ?? "(preview)"}\` — isolated ref \`mmqx...iqtx\`.`,
  ``,
  `**Totals:** ${result.totals.passed}/${result.totals.tests} passed (${result.totals.failed} failed).`,
  ``,
  `| Journey | Viewport | Result |`,
  `|---|---|---|`,
  rows || "| (no tests recorded) | | |",
  ``,
  `**Curated screenshots (${shots.length}):** ${shots.map((s) => `\`${s}\``).join(", ") || "none"}.`,
  MARK,
].join("\n");

let md = fs.existsSync(EVIDENCE_MD) ? fs.readFileSync(EVIDENCE_MD, "utf8") : "# V7C — Safe Preview UAT evidence\n";
const re = new RegExp(`${MARK}[\\s\\S]*?${MARK}`);
md = re.test(md) ? md.replace(re, section) : `${md}\n\n${section}\n`;
fs.writeFileSync(EVIDENCE_MD, md);

console.log(`Wrote ${RESULT_JSON} and updated ${EVIDENCE_MD} (allPassed=${allPassed}).`);
process.exit(allPassed ? 0 : 1);
