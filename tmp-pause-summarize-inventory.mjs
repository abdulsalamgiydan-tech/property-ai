import fs from "node:fs";

const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const bySchema = {};
for (const t of j.tables) {
  bySchema[t.schema] = (bySchema[t.schema] || 0) + 1;
}
const top = [...j.tables].sort((a, b) => Number(b.total_bytes) - Number(a.total_bytes)).slice(0, 15);
console.log(`ref=${j.ref} size=${j.size_pretty} schemas=${j.schemas.join(",")}`);
console.log("table_counts=" + Object.entries(bySchema).map(([k, v]) => `${k}:${v}`).join(" "));
for (const t of top) {
  console.log(`${t.schema}.${t.name} bytes=${t.total_bytes}`);
}
