import { builtinModules } from "node:module";
import process from "node:process";

import esbuild from "esbuild";

const production = process.argv.includes("production");
const banner =
  "/* Bundled by Baize. External node builtins and the Obsidian API are resolved at runtime. */";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  platform: "node",
  target: "es2022",
  banner: {
    js: banner,
  },
  sourcemap: production ? false : "inline",
  logLevel: "info",
  external: [
    "obsidian",
    "electron",
    ...builtinModules,
    ...builtinModules.map((module) => `node:${module}`),
  ],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
