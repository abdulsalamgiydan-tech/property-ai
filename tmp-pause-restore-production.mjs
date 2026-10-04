import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const copyDir = process.argv[2];
const outPath = process.argv[3];
const tables = process.argv[4]
  ? JSON.parse(fs.readFileSync(process.argv[4], "utf8"))
  : [
      ["public.waitlist", 2],
      ["public.watchlist_items", 1],
      ["public.strategy_reports", 1],
      ["public.strategy_generations", 1],
      ["auth.users", 4],
      ["supabase_migrations.schema_migrations", 29],
    ];
const db = new PGlite();
const results = [];
for (const [name, expected] of tables) {
  const file = path.join(copyDir, `${name}.copy`);
  const text = fs.readFileSync(file, "utf8");
  const lines = text ? text.replace(/\n$/, "").split("\n").filter((line) => line.length > 0) : [];
  const safe = name.replace(/\./g, "_");
  await db.exec(`create table ${safe} (line text);`);
  for (const line of lines) {
    await db.query(`insert into ${safe}(line) values ($1)`, [line]);
  }
  const count = await db.query(`select count(*)::int as n from ${safe}`);
  results.push({
    table: name,
    source_rows: expected,
    file_rows: lines.length,
    restored_rows: count.rows[0].n,
    match: lines.length === expected && count.rows[0].n === expected,
  });
}
await db.close();
const payload = {
  restored_at: new Date().toISOString(),
  engine: "pglite-isolated",
  remote_writes: false,
  matched: results.filter((r) => r.match).length,
  tables: results,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
