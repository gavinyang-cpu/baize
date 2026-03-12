import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

export function registerBaizeMcpTools(server: McpServer): void {
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
