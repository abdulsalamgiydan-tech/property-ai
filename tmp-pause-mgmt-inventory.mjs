import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ref = process.argv[2];
const outPath = process.argv[3];
const sqlFile = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/scripts/inventory.sql";
const sql = `
select json_build_object(
  'database', current_database(),
  'version', current_setting('server_version'),
  'size_pretty', pg_size_pretty(pg_database_size(current_database())),
  'size_bytes', pg_database_size(current_database()),
  'schemas', (
    select coalesce(json_agg(nspname order by nspname), '[]'::json)
    from pg_namespace
    where nspname not like 'pg_%'
  ),
  'tables', (
    select coalesce(json_agg(row_to_json(t) order by t.schema, t.name), '[]'::json)
    from (
      select n.nspname as schema, c.relname as name, c.relkind,
             pg_total_relation_size(c.oid) as total_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname not like 'pg_%'
        and n.nspname <> 'information_schema'
        and c.relkind in ('r','p','m')
    ) t
  )
)::text as inventory
`;

const sb = path.join(process.env.APPDATA, "npm", "supabase.cmd");
const wd = "C:/Users/abdul/Propellect-Restart-Backups/2026-10-05/cli-workdir";
const result = spawnSync(
  "cmd.exe",
  ["/c", sb, "--workdir", wd, "db", "query", "--linked", "--project-ref", ref, "-o", "json", "-f", sqlFile],
  { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
);
if (result.status !== 0) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath + ".error.txt", (result.stderr || result.stdout || "query failed").slice(0, 4000));
  console.error(`query failed for ${ref}`);
  process.exit(1);
}
const parsed = JSON.parse(result.stdout);
const row = parsed.rows?.[0]?.inventory;
const inventory = typeof row === "string" ? JSON.parse(row) : row;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ ref, captured_at: new Date().toISOString(), ...inventory }, null, 2));
console.log(`${ref} size=${inventory.size_pretty} schemas=${inventory.schemas.length} tables=${inventory.tables.length}`);
