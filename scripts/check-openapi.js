import SwaggerParser from "@apidevtools/swagger-parser";
import { writeFileSync } from "node:fs";
import { openapi } from "../src/docs/openapi.js";
await SwaggerParser.validate(structuredClone(openapi));
writeFileSync("src/docs/openapi.json", JSON.stringify(openapi, null, 2) + "\n");
console.log(
  "OpenAPI valid:",
  Object.values(openapi.paths).reduce((n, p) => n + Object.keys(p).length, 0),
  "operations.",
);
