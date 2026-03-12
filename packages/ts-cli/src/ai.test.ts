import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createArtifactLoader, generateAiArtifacts } from "./ai.js";
import { scanNotes } from "./rust.js";
import type { BaizeConfig } from "./types.js";

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-ai-"));
}

async function writeConfig(workspace: string, overrides: Partial<BaizeConfig> = {}): Promise<void> {
  const config: BaizeConfig = {
    version: 1,
    default_profile: "main",
    profiles: {
      main: {
        adapter: "astro",
        content_dir: "./site/src/content/blog",
      },
    },
    ai: {
      default_provider: "openai",
      artifact_dir: ".baize/artifacts",
      openai: {
        model: "gpt-5-mini",
        api_key_env: "OPENAI_API_KEY",
      },
      ollama: {
        model: "llama3.2",
        base_url: "http://127.0.0.1:11434",
      },
    },
    ...overrides,
  };

  await writeFile(join(workspace, "baize.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("AI artifacts", () => {
  it("generates and stores summary, thread, and SEO artifacts via OpenAI", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    process.env.OPENAI_API_KEY = "test-key";
    await writeFile(
      join(vault, "note.md"),
      "---\ntitle: AI Note\nai:\n  summary: true\n  thread: true\n  seo: true\n---\nHello from Baize AI\n",
      "utf8",
    );

    const result = await generateAiArtifacts(vault, {
      cwd: workspace,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { text?: { format?: { name?: string } } };
        const name = body.text?.format?.name;
        if (name === "thread_artifact") {
          return new Response(JSON.stringify({ output_text: JSON.stringify(["First", "Second"]) }));
        }
        if (name === "seo_artifact") {
          return new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                title: "AI Note SEO",
                description: "Fast description",
                keywords: ["ai", "baize"],
              }),
            }),
          );
        }

        return new Response(JSON.stringify({ output_text: "Short generated summary." }));
      },
    });

    expect(result.provider).toBe("openai");
    expect(result.outputs).toHaveLength(1);
    expect(await readFile(join(workspace, ".baize", "artifacts", "ai-note", "summary.md"), "utf8")).toContain(
      "Short generated summary.",
    );
    expect(await readFile(join(workspace, ".baize", "artifacts", "ai-note", "thread.md"), "utf8")).toContain(
      "1. First",
    );
    expect(await readFile(join(workspace, ".baize", "artifacts", "ai-note", "seo.json"), "utf8")).toContain(
      "\"AI Note SEO\"",
    );
  });

  it("loads stored artifacts back through the artifact loader", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    process.env.OPENAI_API_KEY = "test-key";
    await writeFile(join(vault, "note.md"), "---\ntitle: Loader Note\n---\nBody\n", "utf8");

    await generateAiArtifacts(vault, {
      cwd: workspace,
      artifact: "summary",
      fetchImpl: async () => new Response(JSON.stringify({ output_text: "Artifact summary." })),
    });

    const scan = await scanNotes(vault);
    const loader = await createArtifactLoader({
      cwd: workspace,
      pathHint: vault,
    });

    const artifacts = await loader(scan.notes[0]!);

    expect(artifacts?.summary).toBe("Artifact summary.");
  });

  it("supports Ollama as an AI provider", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace, {
      ai: {
        default_provider: "ollama",
        artifact_dir: ".baize/artifacts",
        ollama: {
          model: "llama3.2",
          base_url: "http://127.0.0.1:11434",
        },
      },
    });
    await writeFile(join(vault, "note.md"), "---\ntitle: Ollama Note\n---\nBody\n", "utf8");

    const result = await generateAiArtifacts(vault, {
      cwd: workspace,
      artifact: "seo",
      provider: "ollama",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              title: "Ollama SEO",
              description: "Generated locally",
              keywords: ["ollama"],
            }),
          }),
        ),
    });

    expect(result.provider).toBe("ollama");
    expect(await readFile(join(workspace, ".baize", "artifacts", "ollama-note", "seo.json"), "utf8")).toContain(
      "\"Ollama SEO\"",
    );
  });
});
