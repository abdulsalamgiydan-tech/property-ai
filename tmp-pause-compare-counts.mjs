import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const rawPath = process.argv[2];
const copyDir = process.argv[3];
const outPath = process.argv[4];
const raw = fs.readFileSync(rawPath, "utf8");
const start = raw.indexOf("[");
const end = raw.lastIndexOf("]");
const rows = JSON.parse(raw.slice(start, end + 1));

async function countLines(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  let n = 0;
  for await (const _line of rl) n += 1;
  return n;
}

const results = [];
for (const row of rows) {
  const file = path.join(copyDir, `${row.schema}.${row.name}.copy`);
  const lines = await countLines(file);
  const expected = Number(row.exact_count);
  results.push({
    schema: row.schema,
    name: row.name,
    expected,
    lines,
    match: lines === expected,
  });
}
const payload = {
  verified_at: new Date().toISOString(),
  compared: results.length,
  matched: results.filter((r) => r.match).length,
  mismatched: results.filter((r) => !r.match).map((r) => `${r.schema}.${r.name} expected=${r.expected} lines=${r.lines}`),
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`matched=${payload.matched}/${payload.compared}`);
console.log(payload.mismatched.join("\n") || "no mismatches");
