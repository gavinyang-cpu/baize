import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runCli } from "./cli.js";

type Captured = {
  stdout: string[];
  stderr: string[];
};

function createLogger(captured: Captured) {
  return {
    stdout: (message: string) => captured.stdout.push(message),
    stderr: (message: string) => captured.stderr.push(message),
  };
}

async function createVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-ts-cli-"));
}

describe("TypeScript CLI", () => {
  it("prints scan output", async () => {
    const vault = await createVault();
    await writeFile(join(vault, "note.md"), "---\ntitle: Scan Me\n---\nBody\n", "utf8");

    const captured: Captured = { stdout: [], stderr: [] };
    const exitCode = await runCli(["scan", vault], createLogger(captured));

    expect(exitCode).toBe(0);
    expect(captured.stderr).toEqual([]);
    expect(captured.stdout.join("\n")).toContain("Scanned 1 note(s)");
  });

  it("returns validation failure exit codes", async () => {
    const vault = await createVault();
    await writeFile(join(vault, "one.md"), "---\nslug: dup\n---\nOne\n", "utf8");
    await writeFile(join(vault, "two.md"), "---\nslug: dup\n---\nTwo\n", "utf8");

    const captured: Captured = { stdout: [], stderr: [] };
    const exitCode = await runCli(["validate", vault], createLogger(captured));

    expect(exitCode).toBe(2);
    expect(captured.stdout.join("\n")).toContain("Validation found 1 issue(s)");
  });
});
