import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadBaizeConfig, resolveConfigPath } from "./config.js";
import { scanNotes } from "./rust.js";
import type {
  AiArtifactKind,
  AiGenerationExecution,
  ArtifactSeoMetadata,
  BaizeConfig,
  GeneratedArtifacts,
  NoteDocument,
  ProviderKind,
  StoredArtifacts,
} from "./types.js";

type GenerateAiOptions = {
  artifact?: AiArtifactKind | "all";
  cwd?: string;
  provider?: ProviderKind;
  fetchImpl?: typeof fetch;
};

type Provider = {
  kind: ProviderKind;
  model: string;
  generateText: (prompt: string) => Promise<string>;
  generateJson: <T>(prompt: string, schemaName: string, schema: object) => Promise<T>;
};

export async function generateAiArtifacts(
  path: string,
  options: GenerateAiOptions = {},
): Promise<AiGenerationExecution> {
  const { config, rootDir } = await loadBaizeConfig({
    cwd: options.cwd,
    pathHint: path,
  });
  const provider = createProvider(config, options.provider, options.fetchImpl);
  const artifactRoot = resolveArtifactRoot(config, rootDir);
  const scan = await scanNotes(path);
  const outputs: StoredArtifacts[] = [];
  const warnings: string[] = [];

  await mkdir(artifactRoot, { recursive: true });

  for (const note of scan.notes) {
    const artifacts = await generateArtifactsForNote(note, provider, options.artifact ?? "all");
    if (!artifacts) {
      warnings.push(`No AI artifacts requested for ${note.relative_path}`);
      continue;
    }

    const stored = await writeArtifacts(artifactRoot, note, artifacts);
    outputs.push(stored);
  }

  return {
    provider: provider.kind,
    model: provider.model,
    artifact_dir: artifactRoot,
    outputs,
    warnings,
  };
}

export async function createArtifactLoader(options: {
  cwd?: string;
  pathHint: string;
}): Promise<(note: NoteDocument) => Promise<GeneratedArtifacts | undefined>> {
  const { config, rootDir } = await loadBaizeConfig({
    cwd: options.cwd,
    pathHint: options.pathHint,
  });
  const artifactRoot = resolveArtifactRoot(config, rootDir);

  return async (note) => readStoredArtifacts(artifactRoot, note.slug);
}

function resolveArtifactRoot(config: BaizeConfig, rootDir: string): string {
  return resolveConfigPath(rootDir, config.ai?.artifact_dir ?? ".baize/artifacts");
}

async function generateArtifactsForNote(
  note: NoteDocument,
  provider: Provider,
  artifact: AiArtifactKind | "all",
): Promise<GeneratedArtifacts | undefined> {
  const requested = resolveRequestedArtifacts(note, artifact);
  if (requested.length === 0) {
    return undefined;
  }

  const output: GeneratedArtifacts = {};

  for (const kind of requested) {
    switch (kind) {
      case "summary":
        output.summary = await provider.generateText(buildSummaryPrompt(note));
        break;
      case "thread":
        output.thread = await provider.generateJson<string[]>(
          buildThreadPrompt(note),
          "thread_artifact",
          {
            type: "array",
            items: { type: "string" },
          },
        );
        break;
      case "seo":
        output.seo = await provider.generateJson<ArtifactSeoMetadata>(
          buildSeoPrompt(note),
          "seo_artifact",
          {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              keywords: {
                type: "array",
                items: { type: "string" },
              },
            },
            additionalProperties: false,
          },
        );
        break;
    }
  }

  return output;
}

function resolveRequestedArtifacts(
  note: NoteDocument,
  artifact: AiArtifactKind | "all",
): AiArtifactKind[] {
  if (artifact !== "all") {
    return [artifact];
  }

  const requested: AiArtifactKind[] = [];
  if (note.frontmatter.ai.summary) {
    requested.push("summary");
  }
  if (note.frontmatter.ai.thread) {
    requested.push("thread");
  }
  if (note.frontmatter.ai.seo) {
    requested.push("seo");
  }

  return requested.length > 0 ? requested : ["summary", "thread", "seo"];
}

async function writeArtifacts(
  artifactRoot: string,
  note: NoteDocument,
  artifacts: GeneratedArtifacts,
): Promise<StoredArtifacts> {
  const artifactDir = join(artifactRoot, note.slug);
  await mkdir(artifactDir, { recursive: true });

  const stored: StoredArtifacts = {
    slug: note.slug,
    note_path: note.relative_path,
    artifact_dir: artifactDir,
    ...artifacts,
  };

  if (artifacts.summary) {
    stored.summary_path = join(artifactDir, "summary.md");
    await writeFile(stored.summary_path, `${artifacts.summary.trim()}\n`, "utf8");
  }

  if (artifacts.thread?.length) {
    stored.thread_path = join(artifactDir, "thread.md");
    await writeFile(
      stored.thread_path,
      `${artifacts.thread.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n`,
      "utf8",
    );
  }

  if (artifacts.seo) {
    stored.seo_path = join(artifactDir, "seo.json");
    await writeFile(stored.seo_path, `${JSON.stringify(artifacts.seo, null, 2)}\n`, "utf8");
  }

  return stored;
}

async function readStoredArtifacts(
  artifactRoot: string,
  slug: string,
): Promise<GeneratedArtifacts | undefined> {
  const artifactDir = join(artifactRoot, slug);
  const output: GeneratedArtifacts = {};

  try {
    output.summary = (await readFile(join(artifactDir, "summary.md"), "utf8")).trim();
  } catch {
    // Ignore missing artifact files.
  }

  try {
    output.thread = (await readFile(join(artifactDir, "thread.md"), "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\d+\.\s*/, ""));
  } catch {
    // Ignore missing artifact files.
  }

  try {
    output.seo = JSON.parse(await readFile(join(artifactDir, "seo.json"), "utf8")) as ArtifactSeoMetadata;
  } catch {
    // Ignore missing artifact files.
  }

  return output.summary || output.thread || output.seo ? output : undefined;
}

function createProvider(
  config: BaizeConfig,
  selectedProvider: ProviderKind | undefined,
  fetchImpl: typeof fetch | undefined,
): Provider {
  const providerKind = selectedProvider ?? config.ai?.default_provider ?? "openai";
  const request = fetchImpl ?? fetch;

  if (providerKind === "openai") {
    const providerConfig = config.ai?.openai;
    if (!providerConfig) {
      throw new Error("OpenAI is not configured in baize.config.json.");
    }

    const apiKey = process.env[providerConfig.api_key_env ?? "OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(`Missing ${providerConfig.api_key_env ?? "OPENAI_API_KEY"} for OpenAI.`);
    }

    const baseUrl = (providerConfig.base_url ?? "https://api.openai.com/v1").replace(/\/+$/, "");

    return {
      kind: "openai",
      model: providerConfig.model,
      generateText: async (prompt) => {
        const response = await request(`${baseUrl}/responses`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: providerConfig.model,
            input: prompt,
          }),
        });

        return extractOpenAiText(await parseProviderResponse(response));
      },
      generateJson: async <T>(prompt: string, schemaName: string, schema: object) => {
        const response = await request(`${baseUrl}/responses`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: providerConfig.model,
            input: prompt,
            text: {
              format: {
                type: "json_schema",
                name: schemaName,
                schema,
                strict: true,
              },
            },
          }),
        });

        const payload = await parseProviderResponse(response);
        return JSON.parse(extractOpenAiText(payload)) as T;
      },
    };
  }

  const providerConfig = config.ai?.ollama;
  if (!providerConfig) {
    throw new Error("Ollama is not configured in baize.config.json.");
  }

  const baseUrl = (providerConfig.base_url ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  return {
    kind: "ollama",
    model: providerConfig.model,
    generateText: async (prompt) => {
      const response = await request(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: providerConfig.model,
          prompt,
          stream: false,
        }),
      });

      const payload = await parseProviderResponse(response);
      return String(payload.response ?? "").trim();
    },
    generateJson: async <T>(prompt: string) => {
      const response = await request(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: providerConfig.model,
          prompt,
          stream: false,
          format: "json",
        }),
      });

      const payload = await parseProviderResponse(response);
      return JSON.parse(String(payload.response ?? "{}")) as T;
    },
  };
}

async function parseProviderResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  const outputText = payload.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText.trim();
  }

  const output = payload.output;
  if (Array.isArray(output)) {
    const text = output
      .flatMap((item) =>
        Array.isArray((item as { content?: unknown }).content)
          ? ((item as { content: Array<{ text?: string }> }).content ?? [])
          : [],
      )
      .map((content) => content.text)
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  throw new Error("OpenAI response did not include output text.");
}

function buildSummaryPrompt(note: NoteDocument): string {
  return [
    "You write concise publish-ready article summaries.",
    "Return a short summary in 2-3 sentences.",
    `Title: ${note.title}`,
    `Tags: ${note.tags.join(", ")}`,
    "Markdown:",
    note.body,
  ].join("\n\n");
}

function buildThreadPrompt(note: NoteDocument): string {
  return [
    "Create a social thread as a JSON array of 5 short posts.",
    "Each post should build naturally from the previous one.",
    `Title: ${note.title}`,
    "Markdown:",
    note.body,
  ].join("\n\n");
}

function buildSeoPrompt(note: NoteDocument): string {
  return [
    "Return JSON with keys title, description, and keywords.",
    "Keep the SEO title under 60 characters and the description under 160 characters.",
    `Title: ${note.title}`,
    "Markdown:",
    note.body,
  ].join("\n\n");
}
