/**
 * V7C UAT global setup — fail fast with exact instructions when access is missing.
 * Never prints the secret value.
 */
export default async function globalSetup() {
  const url = process.env.VERCEL_PREVIEW_URL;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const missing: string[] = [];
  if (!url) missing.push("VERCEL_PREVIEW_URL");
  if (!bypass) missing.push("VERCEL_AUTOMATION_BYPASS_SECRET");
  if (missing.length) {
    throw new Error(
      [
        `\nV7C UAT cannot run — missing env: ${missing.join(", ")}.`,
        `Do NOT disable Vercel Authentication. Instead add a Protection Bypass for Automation:`,
        `  1. Vercel → property-ai (zeebusiness93 team) → Settings → Deployment Protection`,
        `     → "Protection Bypass for Automation" → enable → copy the secret.`,
        `  2. Locally (never commit): export VERCEL_AUTOMATION_BYPASS_SECRET=<secret>`,
        `     export VERCEL_PREVIEW_URL=https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`,
        `  3. Re-run: npm run uat:v7c:auth (one-time headed sign-in) then npm run uat:v7c.`,
      ].join("\n"),
    );
  }
}
