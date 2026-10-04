import fs from "node:fs";

const envPath = process.argv[2];
const key = process.argv[3] || "WAREHOUSE_VALIDATION_DB_URL";
const text = fs.readFileSync(envPath, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
if (!line) {
  console.log(`${key}=missing`);
  process.exit(0);
}
const value = line.slice(key.length + 1).replace(/^['"]|['"]$/g, "");
try {
  const u = new URL(value);
  console.log(`key=${key}`);
  console.log(`user=${u.username}`);
  console.log(`host=${u.hostname}`);
  console.log(`port=${u.port || "(default)"}`);
  console.log(`db=${u.pathname}`);
} catch {
  console.log(`${key}=non-url`);
}
