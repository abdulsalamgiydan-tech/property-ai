import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const envPath = process.argv[2];
const outDir = process.argv[3];
const mode = process.argv[4] || "all";
if (!envPath || !outDir) {
  console.error("usage: node tmp-pause-dump.mjs <env-file> <out-dir> [dry-run|roles|schema|data|auth-storage|all]");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    })
);

const url = process.env.BACKUP_DB_URL || env.WAREHOUSE_VALIDATION_DB_URL || env.DATABASE_URL;
if (!url) {
  console.error("No database URL found");
  process.exit(1);
}

const supabase = path.join(process.env.APPDATA, "npm", "supabase.cmd");
fs.mkdirSync(outDir, { recursive: true });

function run(args, file) {
  const full = ["db", "dump", "--db-url", url, ...args];
  if (file) full.push("-f", file);
  console.log(`running supabase db dump ${args.join(" ")}`);
  const result = spawnSync("cmd.exe", ["/c", supabase, ...full], {
    encoding: "utf8",
    windowsHide: true,
  });
  const logPath = path.join(outDir, `dump-${mode}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `STATUS=${result.status}\nSTDOUT\n${result.stdout || ""}\nSTDERR\n${result.stderr || ""}`);
  if (result.stdout) console.log(result.stdout.slice(0, 3000));
  if (result.stderr) console.log(result.stderr.slice(0, 3000));
  if (result.status !== 0) {
    throw new Error(`dump failed: ${args.join(" ")}`);
  }
}

if (mode === "dry-run") {
  run(["--dry-run"]);
  process.exit(0);
}

if (mode === "roles" || mode === "all") {
  run(["--role-only"], path.join(outDir, "roles.sql"));
}
if (mode === "schema" || mode === "all") {
  run([], path.join(outDir, "schema.sql"));
}
if (mode === "auth-storage" || mode === "all") {
  run(["--schema", "auth,storage"], path.join(outDir, "auth_storage_schema.sql"));
}
if (mode === "data" || mode === "all") {
  run(
    ["--data-only", "--use-copy", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"],
    path.join(outDir, "data.sql")
  );
}

console.log(`dumps written under ${outDir}`);
