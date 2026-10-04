import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ref = process.argv[2];
const sqlFile = process.argv[3];
const outPath = process.argv[4];
const sb = path.join(process.env.APPDATA, "npm", "supabase.cmd");
const wd = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/cli-workdir";
const result = spawnSync(
  "cmd.exe",
  ["/c", sb, "--workdir", wd, "db", "query", "--linked", "--project-ref", ref, "-o", "json", "-f", sqlFile],
  { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
);
const text = `${result.stdout || ""}\n${result.stderr || ""}`;
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, text);
}
if (result.status !== 0) {
  console.log(`FAIL ${ref}`);
  console.log((result.stderr || result.stdout || "").slice(0, 500));
  process.exit(1);
}
const jsonStart = (result.stdout || "").indexOf("{");
const parsed = JSON.parse((result.stdout || "").slice(jsonStart));
console.log(`${ref} ${JSON.stringify(parsed.rows)}`);
