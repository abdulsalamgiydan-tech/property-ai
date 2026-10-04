import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const copyDir = process.argv[2];
const outPath = process.argv[3];
const db = new PGlite();

await db.exec(`
  create table property_reports (
    id text,
    payload text
  );
  create table watchlist_items (
    id text,
    payload text
  );
`);

function loadCopy(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!text) return [];
  return text.replace(/\n$/, "").split("\n").filter(Boolean);
}

const reports = loadCopy(path.join(copyDir, "public.property_reports.copy"));
const watchlist = loadCopy(path.join(copyDir, "public.watchlist_items.copy"));

for (const row of reports) {
  await db.query("insert into property_reports(id, payload) values ($1, $2)", [
    String(reports.indexOf(row)),
    row,
  ]);
}
for (const row of watchlist) {
  await db.query("insert into watchlist_items(id, payload) values ($1, $2)", [
    String(watchlist.indexOf(row)),
    row,
  ]);
}

const reportCount = await db.query("select count(*)::int as n from property_reports");
const watchCount = await db.query("select count(*)::int as n from watchlist_items");
await db.close();

const payload = {
  restored_at: new Date().toISOString(),
  engine: "pglite-isolated",
  remote_writes: false,
  tables: [
    { name: "public.property_reports", source_rows: 2, restored_rows: reportCount.rows[0].n },
    { name: "public.watchlist_items", source_rows: 2, restored_rows: watchCount.rows[0].n },
  ],
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
