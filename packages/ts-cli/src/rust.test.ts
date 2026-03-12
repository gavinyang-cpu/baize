import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildNotes,
  getBaizeRuntimeRoot,
  scanNotes,
  setBaizeRuntimeRoot,
  validateNotes,
} from "./index.js";

async function createVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-ts-rust-"));
}

describe("Rust bridge", () => {
  it("allows the runtime root to be overridden", async () => {
    const original = getBaizeRuntimeRoot();
    const vault = await createVault();

    setBaizeRuntimeRoot(vault);
    expect(getBaizeRuntimeRoot()).toBe(vault);

    setBaizeRuntimeRoot(original);
    expect(getBaizeRuntimeRoot()).toBe(original);
  });

  it("scans notes through the Rust CLI", async () => {
    const vault = await createVault();
    await writeFile(
      join(vault, "note.md"),
      "---\ntitle: TS Bridge\nslug: ts-bridge\n---\nHello from TypeScript\n",
      "utf8",
    );

    const report = await scanNotes(vault);

    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]?.slug).toBe("ts-bridge");
    expect(report.notes[0]?.title).toBe("TS Bridge");
  });

  it("preserves validation exit semantics", async () => {
    const vault = await createVault();
    await writeFile(join(vault, "one.md"), "---\nslug: same\n---\nOne\n", "utf8");
    await writeFile(join(vault, "two.md"), "---\nslug: same\n---\nTwo\n", "utf8");

    const result = await validateNotes(vault);

    expect(result.exitCode).toBe(2);
    expect(result.report.issues.some((issue) => issue.level === "error")).toBe(true);
  });

  it("builds Astro-ready output through Rust", async () => {
    const vault = await createVault();
    const outDir = join(vault, "dist");
    await writeFile(
      join(vault, "publish.md"),
      "---\ntitle: Publish Me\n---\nBody from bridge\n",
      "utf8",
    );

    const result = await buildNotes(vault, outDir);

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.output_path).toContain("publish-me.md");
  });
});
