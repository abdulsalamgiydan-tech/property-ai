import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const envPath = process.argv[2];
const outDir = process.argv[3];
if (!envPath || !outDir) {
  console.error("usage: node tmp-pause-schema-export.mjs <env-file> <out-dir>");
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
const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: "propellect-pause-schema-export",
});
await client.connect();
await client.query("SET default_transaction_read_only = on");

const schemas = await client.query(`
  select nspname
  from pg_namespace
  where nspname not like 'pg_%'
  order by 1
`);
const extensions = await client.query(`select extname, extversion from pg_extension order by 1`);
const functions = await client.query(`
  select n.nspname as schema, p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
  order by 1, p.proname
`);
const views = await client.query(`
  select schemaname as schema, viewname as name
  from pg_views
  where schemaname not like 'pg_%' and schemaname <> 'information_schema'
  order by 1, 2
`);
const policies = await client.query(`
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  order by 1, 2, 3
`);
const grants = await client.query(`
  select table_schema, table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema not like 'pg_%'
  order by 1, 2, 3, 4
`);
const migrations = await client.query(`
  select version, name, inserted_at
  from supabase_migrations.schema_migrations
  order by version
`).catch(() => ({ rows: [] }));

const lines = [];
lines.push("-- Generated schema catalog export for restart. Not a substitute for pg_dump.");
lines.push(`-- captured ${new Date().toISOString()}`);
for (const s of schemas.rows) lines.push(`-- schema ${s.nspname}`);
lines.push("");
for (const e of extensions.rows) {
  lines.push(`CREATE EXTENSION IF NOT EXISTS "${e.extname}" WITH VERSION '${e.extversion}';`);
}
lines.push("");

const functionSql = [];
for (const fn of functions.rows) {
  try {
    const def = await client.query("select pg_get_functiondef($1::oid) as def", [fn.oid]);
    if (def.rows[0]?.def) functionSql.push(def.rows[0].def + ";");
  } catch {
    // skip system-inaccessible functions
  }
}

const viewSql = [];
for (const v of views.rows) {
  try {
    const def = await client.query("select pg_get_viewdef($1::regclass, true) as def", [`${v.schema}.${v.name}`]);
    viewSql.push(`CREATE OR REPLACE VIEW "${v.schema}"."${v.name}" AS\n${def.rows[0].def};`);
  } catch {
    // skip
  }
}

await client.end();

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "functions.sql"), functionSql.join("\n\n") + "\n");
fs.writeFileSync(path.join(outDir, "views.sql"), viewSql.join("\n\n") + "\n");
fs.writeFileSync(
  path.join(outDir, "policies.json"),
  JSON.stringify({ captured_at: new Date().toISOString(), policies: policies.rows }, null, 2)
);
fs.writeFileSync(
  path.join(outDir, "grants.json"),
  JSON.stringify({ captured_at: new Date().toISOString(), grants: grants.rows }, null, 2)
);
fs.writeFileSync(
  path.join(outDir, "migration-history.json"),
  JSON.stringify({ captured_at: new Date().toISOString(), migrations: migrations.rows }, null, 2)
);
fs.writeFileSync(path.join(outDir, "schema-catalog.sql"), lines.join("\n") + "\n");
console.log(`functions=${functionSql.length}`);
console.log(`views=${viewSql.length}`);
console.log(`policies=${policies.rows.length}`);
console.log(`grants=${grants.rows.length}`);
console.log(`migrations=${migrations.rows.length}`);
