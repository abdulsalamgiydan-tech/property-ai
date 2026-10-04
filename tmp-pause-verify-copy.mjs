import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";

const inventoryPath = process.argv[2];
const copyDir = process.argv[3];
const outPath = process.argv[4];

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const results = [];

async function countLines(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return 0;
  const stream = fs.createReadStream(file);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let n = 0;
  for await (const _line of rl) n += 1;
  return n;
}

function sha256File(file) {
  if (!fs.existsSync(file)) return null;
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

for (const table of inventory.tables) {
  const file = path.join(copyDir, `${table.schema}.${table.name}.copy`);
  const bytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  let lines = null;
  let error = null;
  try {
    lines = await countLines(file);
  } catch (err) {
    error = err.message;
  }
  const expected = table.exact_count;
  results.push({
    schema: table.schema,
    name: table.name,
    expected,
    lines,
    bytes,
    sha256: bytes > 0 ? await sha256File(file) : null,
    match: expected === 0 ? bytes === 0 || lines === 0 : lines === expected,
    error,
  });
  const status = results[results.length - 1].match ? "OK" : "MISMATCH";
  console.log(`${status} ${table.schema}.${table.name} expected=${expected} lines=${lines} bytes=${bytes}`);
}

const payload = {
  verified_at: new Date().toISOString(),
  table_count: results.length,
  matched: results.filter((r) => r.match).length,
  mismatched: results.filter((r) => !r.match).length,
  total_bytes: results.reduce((sum, r) => sum + r.bytes, 0),
  tables: results,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`matched=${payload.matched} mismatched=${payload.mismatched} bytes=${payload.total_bytes}`);
