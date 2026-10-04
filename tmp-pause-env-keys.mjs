import fs from "node:fs";

const files = process.argv.slice(2);
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`missing ${file}`);
    continue;
  }
  const keys = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));
  console.log(`${file}`);
  console.log(keys.join(","));
}
