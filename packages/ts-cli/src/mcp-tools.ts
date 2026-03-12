import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createArtifactLoader, generateAiArtifacts } from "./ai.js";
import { writeDefaultConfig } from "./config.js";
import { publishWithProfile } from "./publish.js";
import { buildNotes, scanNotes, validateNotes } from "./rust.js";

const noteSummarySchema = z.object({
  relative_path: z.string(),
  title: z.string(),
  slug: z.string(),
  tags: z.array(z.string()),
  warning_count: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

const validationIssueSchema = z.object({
  level: z.enum(["warning", "error"]),
  message: z.string(),
  note: z.string().nullable().optional(),
});

const buildOutputSchema = z.object({
  note_path: z.string(),
  output_path: z.string(),
});

const artifactOutputSchema = z.object({
  note_path: z.string(),
  slug: z.string(),
  artifact_dir: z.string(),
  summary_path: z.string().optional(),
  thread_path: z.string().optional(),
  seo_path: z.string().optional(),
});

const publishOutputSchema = z.object({
  note_path: z.string(),
  slug: z.string(),
  output_path: z.string(),
  asset_count: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

export const scanToolInputSchema = {
  path: z.string().describe("Absolute or relative path to a Markdown file or directory."),
};

export const validateToolInputSchema = {
  path: z.string().describe("Absolute or relative path to a Markdown file or directory."),
};

export const buildToolInputSchema = {
  path: z.string().describe("Absolute or relative path to a Markdown file or directory."),
  out_dir: z
    .string()
    .optional()
    .describe("Output directory for normalized Astro-ready Markdown files."),
};

export const initToolInputSchema = {
  path: z
    .string()
    .optional()
    .describe("Directory where baize.config.json should be created. Defaults to the current working directory."),
  force: z.boolean().optional().describe("Overwrite an existing baize.config.json if true."),
};

export const aiToolInputSchema = {
  path: z.string().describe("Absolute or relative path to a Markdown file or directory."),
  artifact: z
    .enum(["summary", "thread", "seo", "all"])
    .optional()
    .describe("Which artifact to generate. Defaults to all requested artifacts."),
  provider: z
    .enum(["openai", "ollama"])
    .optional()
    .describe("Optional AI provider override."),
};

export const publishToolInputSchema = {
  path: z.string().describe("Absolute or relative path to a Markdown file or directory."),
  profile: z
    .string()
    .optional()
    .describe("Publish profile name from baize.config.json. Defaults to default_profile."),
};

export const scanToolOutputSchema = {
  path: z.string(),
  root: z.string(),
  note_count: z.number().int().nonnegative(),
  notes: z.array(noteSummarySchema),
};

export const validateToolOutputSchema = {
  path: z.string(),
  exit_code: z.number().int().nonnegative(),
  issue_count: z.number().int().nonnegative(),
  issues: z.array(validationIssueSchema),
};

export const buildToolOutputSchema = {
  path: z.string(),
  output_dir: z.string(),
  output_count: z.number().int().nonnegative(),
  outputs: z.array(buildOutputSchema),
  validation_issues: z.array(validationIssueSchema),
};

export const initToolOutputSchema = {
  config_path: z.string(),
  created: z.boolean(),
};

export const aiToolOutputSchema = {
  path: z.string(),
  provider: z.enum(["openai", "ollama"]),
  model: z.string(),
  artifact_dir: z.string(),
  output_count: z.number().int().nonnegative(),
  outputs: z.array(artifactOutputSchema),
  warnings: z.array(z.string()),
};

export const publishToolOutputSchema = {
  path: z.string(),
  profile: z.string(),
  mode: z.enum(["publish"]),
  status: z.enum(["success", "warning", "failed"]),
  output_dir: z.string(),
  output_count: z.number().int().nonnegative(),
  outputs: z.array(publishOutputSchema),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  hook_output: z.string().optional(),
};

type ScanToolArgs = {
  path: string;
};

type ValidateToolArgs = {
  path: string;
};

type BuildToolArgs = {
  path: string;
  out_dir?: string;
};

type InitToolArgs = {
  path?: string;
  force?: boolean;
};

type AiToolArgs = {
  path: string;
  artifact?: "summary" | "thread" | "seo" | "all";
  provider?: "openai" | "ollama";
};

type PublishToolArgs = {
  path: string;
  profile?: string;
};

export async function handleInitTool({ path, force }: InitToolArgs) {
  const result = await writeDefaultConfig(path ?? process.cwd(), { force });
  const structuredContent = {
    config_path: result.config_path,
    created: result.created,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: `${structuredContent.created ? "Created" : "Updated"} config at ${structuredContent.config_path}.`,
      },
    ],
    structuredContent,
  };
}

export async function handleScanTool({ path }: ScanToolArgs) {
  const report = await scanNotes(path);
  const structuredContent = {
    path,
    root: report.root,
    note_count: report.notes.length,
    notes: report.notes.map((note) => ({
      relative_path: note.relative_path,
      title: note.title,
      slug: note.slug,
      tags: note.tags,
      warning_count: note.warnings.length,
      warnings: note.warnings,
    })),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: formatScanSummary(structuredContent),
      },
    ],
    structuredContent,
  };
}

export async function handleValidateTool({ path }: ValidateToolArgs) {
  const result = await validateNotes(path);
  const structuredContent = {
    path,
    exit_code: result.exitCode,
    issue_count: result.report.issues.length,
    issues: result.report.issues.map((issue) => ({
      level: issue.level,
      message: issue.message,
      note: issue.note ?? null,
    })),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: formatValidationSummary(structuredContent),
      },
    ],
    structuredContent,
  };
}

export async function handleBuildTool({ path, out_dir }: BuildToolArgs) {
  const outputDirectory = out_dir ?? "dist/astro-ts";
  const result = await buildNotes(path, outputDirectory);
  const structuredContent = {
    path,
    output_dir: result.output_dir,
    output_count: result.outputs.length,
    outputs: result.outputs.map((output) => ({
      note_path: output.note_path,
      output_path: output.output_path,
    })),
    validation_issues: result.validation.issues.map((issue) => ({
      level: issue.level,
      message: issue.message,
      note: issue.note ?? null,
    })),
  };

  return {
    content: [
      {
        type: "text" as const,
        text: formatBuildSummary(structuredContent),
      },
    ],
    structuredContent,
  };
}

export async function handleAiTool({ path, artifact, provider }: AiToolArgs) {
  const result = await generateAiArtifacts(path, {
    cwd: process.cwd(),
    artifact,
    provider,
  });
  const structuredContent = {
    path,
    provider: result.provider,
    model: result.model,
    artifact_dir: result.artifact_dir,
    output_count: result.outputs.length,
    outputs: result.outputs.map((output) => ({
      note_path: output.note_path,
      slug: output.slug,
      artifact_dir: output.artifact_dir,
      summary_path: output.summary_path,
      thread_path: output.thread_path,
      seo_path: output.seo_path,
    })),
    warnings: result.warnings,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: formatAiSummary(structuredContent),
      },
    ],
    structuredContent,
  };
}

export async function handlePublishTool({ path, profile }: PublishToolArgs) {
  const artifactLoader = await createArtifactLoader({
    cwd: process.cwd(),
    pathHint: path,
  });
  const result = await publishWithProfile(path, {
    cwd: process.cwd(),
    profile,
    artifactLoader,
  });
  const structuredContent = {
    path,
    profile: result.profile,
    mode: result.mode,
    status: result.status,
    output_dir: result.output_dir,
    output_count: result.outputs.length,
    outputs: result.outputs.map((output) => ({
      note_path: output.note_path,
      slug: output.slug,
      output_path: output.output_path,
      asset_count: output.assets.length,
      warnings: output.warnings,
    })),
    warnings: result.warnings,
    errors: result.errors,
    hook_output: result.hook_output,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: formatPublishSummary(structuredContent),
      },
    ],
    structuredContent,
  };
}

export function registerBaizeMcpTools(server: McpServer): void {
  server.registerTool(
    "baize_init",
    {
      title: "Baize Init",
      description: "Create a starter baize.config.json file for profile-based publishing.",
      inputSchema: initToolInputSchema,
      outputSchema: initToolOutputSchema,
    },
    handleInitTool,
  );

  server.registerTool(
    "baize_scan",
    {
      title: "Baize Scan",
      description: "Scan a Markdown file or directory and return normalized note metadata.",
      inputSchema: scanToolInputSchema,
      outputSchema: scanToolOutputSchema,
    },
    handleScanTool,
  );

  server.registerTool(
    "baize_validate",
    {
      title: "Baize Validate",
      description:
        "Validate Markdown notes for duplicate slugs and publish-related warnings.",
      inputSchema: validateToolInputSchema,
      outputSchema: validateToolOutputSchema,
    },
    handleValidateTool,
  );

  server.registerTool(
    "baize_build",
    {
      title: "Baize Build",
      description:
        "Build normalized Astro-ready Markdown files from a Markdown file or directory.",
      inputSchema: buildToolInputSchema,
      outputSchema: buildToolOutputSchema,
    },
    handleBuildTool,
  );

  server.registerTool(
    "baize_ai",
    {
      title: "Baize AI",
      description: "Generate AI summary, thread, and SEO artifacts for notes.",
      inputSchema: aiToolInputSchema,
      outputSchema: aiToolOutputSchema,
    },
    handleAiTool,
  );

  server.registerTool(
    "baize_publish",
    {
      title: "Baize Publish",
      description: "Publish notes to a configured Astro profile with asset rewriting.",
      inputSchema: publishToolInputSchema,
      outputSchema: publishToolOutputSchema,
    },
    handlePublishTool,
  );
}

function formatScanSummary(result: {
  path: string;
  root: string;
  note_count: number;
  notes: Array<{
    relative_path: string;
    title: string;
    slug: string;
    warning_count: number;
    warnings: string[];
  }>;
}): string {
  const lines = [`Scanned ${result.note_count} note(s) from ${result.root}.`];
  for (const note of result.notes) {
    lines.push(`- ${note.relative_path} -> ${note.slug} (${note.warning_count} warning(s))`);
    for (const warning of note.warnings) {
      lines.push(`  warning: ${warning}`);
    }
  }

  return lines.join("\n");
}

function formatValidationSummary(result: {
  path: string;
  exit_code: number;
  issue_count: number;
  issues: Array<{
    level: "warning" | "error";
    message: string;
    note?: string | null;
  }>;
}): string {
  if (result.issue_count === 0) {
    return `Validation passed for ${result.path}.`;
  }

  const lines = [
    `Validation found ${result.issue_count} issue(s) for ${result.path}.`,
    `Exit code: ${result.exit_code}`,
  ];

  for (const issue of result.issues) {
    lines.push(
      issue.note
        ? `- [${issue.level}] ${issue.message} (${issue.note})`
        : `- [${issue.level}] ${issue.message}`,
    );
  }

  return lines.join("\n");
}

function formatBuildSummary(result: {
  path: string;
  output_dir: string;
  output_count: number;
  outputs: Array<{ note_path: string; output_path: string }>;
}): string {
  const lines = [
    `Built ${result.output_count} note(s) from ${result.path} into ${result.output_dir}.`,
  ];

  for (const output of result.outputs) {
    lines.push(`- ${output.note_path} -> ${output.output_path}`);
  }

  return lines.join("\n");
}

function formatAiSummary(result: {
  path: string;
  provider: "openai" | "ollama";
  model: string;
  output_count: number;
  outputs: Array<{ note_path: string; artifact_dir: string }>;
  warnings: string[];
}): string {
  const lines = [
    `Generated AI artifacts for ${result.output_count} note(s) from ${result.path} with ${result.provider}:${result.model}.`,
  ];

  for (const output of result.outputs) {
    lines.push(`- ${output.note_path} -> ${output.artifact_dir}`);
  }

  for (const warning of result.warnings) {
    lines.push(`warning: ${warning}`);
  }

  return lines.join("\n");
}

function formatPublishSummary(result: {
  path: string;
  profile: string;
  status: "success" | "warning" | "failed";
  output_count: number;
  output_dir: string;
  outputs: Array<{ note_path: string; output_path: string }>;
  warnings: string[];
  errors: string[];
}): string {
  const lines = [
    `Published ${result.output_count} note(s) from ${result.path} to profile ${result.profile} (${result.status}).`,
    `Output directory: ${result.output_dir}`,
  ];

  for (const output of result.outputs) {
    lines.push(`- ${output.note_path} -> ${output.output_path}`);
  }

  for (const warning of result.warnings) {
    lines.push(`warning: ${warning}`);
  }

  for (const error of result.errors) {
    lines.push(`error: ${error}`);
  }

  return lines.join("\n");
}
