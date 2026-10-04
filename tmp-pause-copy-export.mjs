import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";
import { to as copyTo } from "pg-copy-streams";

const envPath = process.argv[2];
const outDir = process.argv[3];
if (!envPath || !outDir) {
  console.error("usage: node tmp-pause-copy-export.mjs <env-file> <out-dir>");
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

const url = process.env.BACKUP_DB_URL || env.BACKUP_DB_URL || env.WAREHOUSE_VALIDATION_DB_URL || env.DATABASE_URL;
const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: "propellect-pause-copy-export",
});

await client.connect();
await client.query("SET default_transaction_read_only = on");
await client.query("SET statement_timeout = 0");
await client.query("SET idle_in_transaction_session_timeout = 0");
await client.query("SET lock_timeout = 0");
await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

const tables = await client.query(`
  select n.nspname as schema, c.relname as name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
    and c.relkind in ('r', 'p', 'm')
  order by 1, 2
`);

const dataDir = path.join(outDir, "copy");
await fsp.mkdir(dataDir, { recursive: true });
const results = [];

for (const row of tables.rows) {
  const file = path.join(dataDir, `${row.schema}.${row.name}.copy`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0 && row.schema === "auth") {
    console.log(`skip existing ${row.schema}.${row.name}`);
  }
  const sql = `COPY "${row.schema}"."${row.name}" TO STDOUT WITH (FORMAT text, ENCODING 'UTF8')`;
  try {
    await client.query("SAVEPOINT export_table");
    await new Promise((resolve, reject) => {
      const stream = client.query(copyTo(sql));
      const out = fs.createWriteStream(file);
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      stream.on("data", (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      stream.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => {
        results.push({
          schema: row.schema,
          name: row.name,
          file: path.basename(file),
          bytes,
          sha256: hash.digest("hex"),
        });
        resolve();
      });
      stream.pipe(out);
    });
    await client.query("RELEASE SAVEPOINT export_table");
    console.log(`exported ${row.schema}.${row.name}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT export_table");
    } catch {
      // ignore
    }
    results.push({
      schema: row.schema,
      name: row.name,
      error: err.message,
    });
    console.log(`failed ${row.schema}.${row.name}: ${err.message}`);
  }
}

await client.query("COMMIT");
await client.end();

const manifest = {
  captured_at: new Date().toISOString(),
  format: "postgresql COPY text",
  table_count: results.length,
  exported: results.filter((r) => !r.error).length,
  failed: results.filter((r) => r.error).length,
  total_bytes: results.reduce((sum, r) => sum + (r.bytes || 0), 0),
  tables: results,
};
await fsp.writeFile(path.join(outDir, "copy-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`exported=${manifest.exported} failed=${manifest.failed} bytes=${manifest.total_bytes}`);
