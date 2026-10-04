import fs from "node:fs";
import { Client } from "pg";

const env = Object.fromEntries(
  fs
    .readFileSync(process.argv[2], "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    })
);
const client = new Client({
  connectionString: env.WAREHOUSE_VALIDATION_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query("SET default_transaction_read_only = on");
const cols = await client.query(`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
  order by ordinal_position
`);
const rows = await client.query(`select * from supabase_migrations.schema_migrations order by 1`);
await client.end();
fs.writeFileSync(
  process.argv[3],
  JSON.stringify({ columns: cols.rows, migrations: rows.rows }, null, 2)
);
console.log(`columns=${cols.rows.map((c) => c.column_name).join(",")}`);
console.log(`migrations=${rows.rows.length}`);
