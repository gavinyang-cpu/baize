import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { handleBuildTool, handleScanTool, handleValidateTool } from "./mcp-tools.js";

async function createVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-mcp-"));
}

describe("MCP tool handlers", () => {
  it("returns compact scan metadata", async () => {
    const vault = await createVault();
    await writeFile(
      join(vault, "note.md"),
      "---\ntitle: MCP Note\nslug: mcp-note\n---\nHello MCP\n",
      "utf8",
    );

    const result = await handleScanTool({ path: vault });

    expect(result.structuredContent.note_count).toBe(1);
    expect(result.structuredContent.notes[0]?.slug).toBe("mcp-note");
    expect(result.content[0]?.text).toContain("Scanned 1 note(s)");
  });

  it("surfaces validation issues without treating them as transport failures", async () => {
    const vault = await createVault();
    await writeFile(join(vault, "one.md"), "---\nslug: dup\n---\nOne\n", "utf8");
    await writeFile(join(vault, "two.md"), "---\nslug: dup\n---\nTwo\n", "utf8");

    const result = await handleValidateTool({ path: vault });

    expect(result.structuredContent.exit_code).toBe(2);
    expect(result.structuredContent.issue_count).toBe(1);
    expect(result.content[0]?.text).toContain("Validation found 1 issue(s)");
  });

  it("returns build outputs for valid notes", async () => {
    const vault = await createVault();
    const outDir = join(vault, "dist");
    await writeFile(
      join(vault, "publish.md"),
      "---\ntitle: Build Me\n---\nBody for MCP build\n",
      "utf8",
    );

    const result = await handleBuildTool({ path: vault, out_dir: outDir });

    expect(result.structuredContent.output_count).toBe(1);
    expect(result.structuredContent.outputs[0]?.output_path).toContain("build-me.md");
    expect(result.content[0]?.text).toContain("Built 1 note(s)");
  });
});
