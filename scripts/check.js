import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
for (const root of ["src", "prisma", "scripts", "tests"]) {
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".js") || path.endsWith(".mjs")) {
        const result = spawnSync(process.execPath, ["--check", path], {
          stdio: "inherit",
        });
        if (result.status) process.exit(result.status);
      }
    }
  }
  walk(root);
}
JSON.parse(readFileSync("package.json", "utf8"));
console.log("JavaScript syntax checks passed.");
