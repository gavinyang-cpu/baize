import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleAiTool,
  handleBuildTool,
  handleInitTool,
  handlePublishTool,
  handleScanTool,
  handleValidateTool,
} from "./mcp-tools.js";

async function createVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-mcp-"));
}

async function writeConfig(workspace: string): Promise<void> {
  await writeFile(
    join(workspace, "baize.config.json"),
    `${JSON.stringify(
      {
        version: 1,
        default_profile: "main",
        profiles: {
          main: {
            adapter: "astro",
            content_dir: "./site/src/content/blog",
            assets_dir: "./site/public/images/posts",
            asset_url_base: "/images/posts",
            note_url_base: "/writing",
          },
        },
        ai: {
          default_provider: "openai",
          artifact_dir: ".baize/artifacts",
          openai: {
            model: "gpt-5-mini",
            api_key_env: "OPENAI_API_KEY",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe("MCP tool handlers", () => {
  it("creates a starter config", async () => {
    const workspace = await createVault();

    const result = await handleInitTool({ path: workspace });

    expect(result.structuredContent.created).toBe(true);
    expect(await readFile(join(workspace, "baize.config.json"), "utf8")).toContain(
      "\"default_profile\": \"main\"",
    );
  });

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

  it("includes publish reference warnings in validation output", async () => {
    const vault = await createVault();
    await writeFile(join(vault, "note.md"), "---\ntitle: MCP Validate\n---\n[[missing-note]]\n", "utf8");

    const result = await handleValidateTool({ path: vault });

    expect(result.structuredContent.exit_code).toBe(0);
    expect(result.structuredContent.issue_count).toBe(1);
    expect(result.structuredContent.issues[0]?.message).toContain("could not resolve note link `missing-note`");
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

  it("returns AI artifact outputs", async () => {
    const workspace = await createVault();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: { format?: { name?: string } } };
      const name = body.text?.format?.name;
      if (name === "seo_artifact") {
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              title: "SEO title",
              description: "SEO description",
              keywords: ["seo"],
            }),
          }),
        );
      }
      if (name === "thread_artifact") {
        return new Response(JSON.stringify({ output_text: JSON.stringify(["One", "Two"]) }));
      }
      return new Response(JSON.stringify({ output_text: "Summary output" }));
    });
    await writeFile(
      join(vault, "note.md"),
      "---\ntitle: MCP AI\nai:\n  summary: true\n  thread: true\n  seo: true\n---\nBody\n",
      "utf8",
    );

    const result = await handleAiTool({ path: vault });

    expect(result.structuredContent.provider).toBe("openai");
    expect(result.structuredContent.output_count).toBe(1);
    expect(result.content[0]?.text).toContain("Generated AI artifacts");
  });

  it("returns publish outputs for configured Astro profiles", async () => {
    const workspace = await createVault();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(
      join(vault, "publish.md"),
      "---\ntitle: Publish Via MCP\n---\nBody with ![[asset.png]]\n",
      "utf8",
    );
    await writeFile(join(vault, "asset.png"), "asset", "utf8");

    const result = await handlePublishTool({ path: vault });

    expect(result.structuredContent.status).toBe("success");
    expect(result.structuredContent.output_count).toBe(1);
    expect(result.structuredContent.outputs[0]?.asset_count).toBe(1);
    expect(result.content[0]?.text).toContain("Published 1 note(s)");
  });
});
