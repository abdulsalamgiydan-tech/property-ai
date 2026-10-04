import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ref = "nmburuqjypcalqeegaae";
const outDir = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/supabase/second-main/jsonl";
const sqlDir = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/scripts/pages";
const sb = path.join(process.env.APPDATA, "npm", "supabase.cmd");
const wd = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/cli-workdir";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(sqlDir, { recursive: true });

const groups = {
  small: [
    ["public", "app_products_flat", 1000],
    ["public", "app_products_missing_nutrition_investigation", 500],
    ["public", "claude_categories", 300],
    ["public", "claude_retailers", 50],
    ["public", "claude_unknown_fields", 50],
    ["auth", "schema_migrations", 200],
    ["storage", "migrations", 200],
    ["supabase_migrations", "schema_migrations", 20],
  ],
  nutrition: [
    ["public", "claude_nutrition", 80],
    ["public", "claude_product_details", 80],
  ],
  scrapes: [
    ["public", "claude_products", 200],
    ["public", "claude_raw_scrapes", 80],
  ],
};
const tables = groups[process.argv[2] || "small"];
if (!tables) {
  console.error("usage: node tmp-pause-second-export.mjs small|nutrition|scrapes");
  process.exit(1);
}

function query(sqlFile) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", sb, "--workdir", wd, "db", "query", "--linked", "--project-ref", ref, "-o", "json", "-f", sqlFile],
    { encoding: "utf8", windowsHide: true, maxBuffer: 128 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "query failed").slice(0, 400));
  }
  const start = result.stdout.indexOf("{");
  return JSON.parse(result.stdout.slice(start));
}

function existingRows(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return 0;
  let n = 0;
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1024 * 1024);
  let leftover = "";
  try {
    for (;;) {
      const read = fs.readSync(fd, buf, 0, buf.length, null);
      if (read === 0) break;
      leftover += buf.toString("utf8", 0, read);
      const parts = leftover.split("\n");
      leftover = parts.pop();
      n += parts.length;
    }
    if (leftover.length > 0) n += 1;
  } finally {
    fs.closeSync(fd);
  }
  return n;
}

const summary = [];
for (const [schema, table, pageSize] of tables) {
  const file = path.join(outDir, `${schema}.${table}.jsonl`);
  const already = existingRows(file);
  let offset = already;
  let rows = already;
  if (already) console.log(`${schema}.${table} resume rows=${already}`);
  for (;;) {
    const sqlFile = path.join(sqlDir, `page-${process.argv[2] || "small"}.sql`);
    fs.writeFileSync(
      sqlFile,
      `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text as payload
       from (
         select * from "${schema}"."${table}"
         order by 1
         offset ${offset}
         limit ${pageSize}
       ) t;`
    );
    let payload;
    let parsed;
    for (let attempt = 1; ; attempt += 1) {
      try {
        parsed = query(sqlFile);
        break;
      } catch (err) {
        const transient = /503|connection termination|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
        if (transient && attempt < 6) {
          console.log(`retry ${schema}.${table} offset ${offset} attempt ${attempt}`);
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
          continue;
        }
        if (pageSize > 5 && /too large|payload|413|statement timeout/i.test(err.message)) {
          console.log(`shrink ${schema}.${table} at offset ${offset}`);
        }
        throw err;
      }
    }
    payload = parsed.rows?.[0]?.payload ?? "[]";
    const batch = JSON.parse(payload);
    if (batch.length > 0) {
      fs.appendFileSync(file, batch.map((row) => JSON.stringify(row)).join("\n") + "\n");
    }
    rows += batch.length;
    offset += batch.length;
    console.log(`${schema}.${table} rows=${rows}`);
    if (batch.length < pageSize) break;
  }
  summary.push({ schema, table, rows, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0 });
}
fs.writeFileSync(
  `C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/supabase/second-main/jsonl-summary-${process.argv[2] || "small"}.json`,
  JSON.stringify({ captured_at: new Date().toISOString(), tables: summary }, null, 2)
);
console.log(`done tables=${summary.length} rows=${summary.reduce((s, t) => s + t.rows, 0)}`);
