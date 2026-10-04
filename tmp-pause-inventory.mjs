import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const envPath = process.argv[2];
const outPath = process.argv[3];
if (!envPath || !outPath) {
  console.error("usage: node tmp-pause-inventory.mjs <env-file> <out-json>");
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
  console.error("No database URL found in env file");
  process.exit(1);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 180000,
  application_name: "propellect-pause-inventory",
});

await client.connect();
await client.query("SET default_transaction_read_only = on");
await client.query("SET statement_timeout = '180s'");

const db = await client.query(`
  select
    current_database() as database,
    current_setting('server_version') as server_version,
    pg_size_pretty(pg_database_size(current_database())) as database_size_pretty,
    pg_database_size(current_database())::bigint as database_size_bytes
`);

const schemas = await client.query(`
  select nspname as schema
  from pg_namespace
  where nspname not like 'pg_%'
  order by 1
`);

const tables = await client.query(`
  select
    n.nspname as schema,
    c.relname as name,
    c.relkind,
    pg_total_relation_size(c.oid)::bigint as total_bytes,
    pg_relation_size(c.oid)::bigint as table_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not like 'pg_%'
    and c.relkind in ('r', 'p', 'm')
  order by 1, 2
`);

const counts = [];
for (const row of tables.rows) {
  try {
    const q = await client.query(`select count(*)::bigint as n from "${row.schema}"."${row.name}"`);
    counts.push({
      schema: row.schema,
      name: row.name,
      relkind: row.relkind,
      exact_count: Number(q.rows[0].n),
      total_bytes: Number(row.total_bytes),
      table_bytes: Number(row.table_bytes),
    });
    console.log(`counted ${row.schema}.${row.name}=${q.rows[0].n}`);
  } catch (err) {
    counts.push({
      schema: row.schema,
      name: row.name,
      relkind: row.relkind,
      exact_count: null,
      error: err.message,
      total_bytes: Number(row.total_bytes),
      table_bytes: Number(row.table_bytes),
    });
    console.log(`failed ${row.schema}.${row.name}`);
  }
}

const roles = await client.query(`select rolname from pg_roles order by 1`);
const extensions = await client.query(`select extname, extversion from pg_extension order by 1`);
const functions = await client.query(`
  select n.nspname as schema, p.proname as name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not like 'pg_%'
  order by 1, 2
`);
const triggers = await client.query(`
  select event_object_schema as schema, event_object_table as table, trigger_name
  from information_schema.triggers
  order by 1, 2, 3
`);
const policies = await client.query(`
  select schemaname as schema, tablename as table, policyname
  from pg_policies
  order by 1, 2, 3
`);

let storageBuckets = [];
try {
  const b = await client.query(`select id, name, public from storage.buckets order by name`);
  storageBuckets = b.rows.map((r) => ({ id: r.id, name: r.name, public: r.public }));
} catch {
  storageBuckets = [];
}

await client.end();

const payload = {
  captured_at: new Date().toISOString(),
  database: {
    name: db.rows[0].database,
    server_version: db.rows[0].server_version,
    size_pretty: db.rows[0].database_size_pretty,
    size_bytes: Number(db.rows[0].database_size_bytes),
  },
  schemas: schemas.rows.map((r) => r.schema),
  table_count: counts.length,
  row_count_total: counts.reduce((sum, r) => sum + (r.exact_count || 0), 0),
  tables: counts,
  roles: roles.rows.map((r) => r.rolname),
  extensions: extensions.rows,
  function_count: functions.rows.length,
  trigger_count: triggers.rows.length,
  policy_count: policies.rows.length,
  storage_buckets: storageBuckets,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`wrote ${outPath}`);
console.log(`database_size=${payload.database.size_pretty}`);
console.log(`schemas=${payload.schemas.length}`);
console.log(`tables=${payload.table_count}`);
console.log(`rows=${payload.row_count_total}`);
console.log(`functions=${payload.function_count}`);
console.log(`policies=${payload.policy_count}`);
console.log(`buckets=${payload.storage_buckets.length}`);
