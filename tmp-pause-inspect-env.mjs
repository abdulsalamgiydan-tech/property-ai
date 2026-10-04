import fs from "node:fs";

const path = new URL("./.env.local", import.meta.url);
const text = fs.readFileSync(path, "utf8");
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const key = line.slice(0, i);
  const value = line.slice(i + 1).replace(/^['"]|['"]$/g, "");
  if (/URL|HOST/i.test(key)) {
    try {
      const u = new URL(value);
      console.log(`${key} host=${u.hostname} proto=${u.protocol} path=${u.pathname}`);
    } catch {
      console.log(`${key}=non-url`);
    }
  } else if (/ENABLED$/i.test(key)) {
    console.log(`${key}=${value}`);
  } else {
    console.log(`${key}=REDACTED`);
  }
}
