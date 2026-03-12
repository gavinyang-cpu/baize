#!/usr/bin/env node

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { writeDefaultConfig } from "./config.js";
import {
  buildNotes,
  buildWithProfile,
  createArtifactLoader,
  generateAiArtifacts,
  publishWithProfile,
  scanNotes,
  validateNotes,
} from "./index.js";
import type {
  AiGenerationExecution,
  BuildReport,
  InitExecution,
  PublishExecution,
  ScanReport,
  ValidationExecution,
} from "./types.js";

type Logger = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const defaultLogger: Logger = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

export async function runCli(
  argv: string[] = process.argv.slice(2),
  logger: Logger = defaultLogger,
): Promise<number> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "init":
        return await handleInit(rest, logger);
      case "scan":
        return await handleScan(rest, logger);
      case "validate":
        return await handleValidate(rest, logger);
      case "build":
        return await handleBuild(rest, logger);
      case "ai":
        return await handleAi(rest, logger);
      case "publish":
        return await handlePublish(rest, logger);
      default:
        logger.stderr(
          "Usage: baize-ts <init|scan|validate|build|ai|publish> <path> [--json] [--out-dir <dir>]",
        );
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.stderr(`error: ${message}`);
    return 1;
  }
}

async function handleInit(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      force: { type: "boolean" },
    },
  });

  const directory = positionals[0] ?? process.cwd();
  const result = await writeDefaultConfig(directory, { force: values.force });
  printInit(result, logger);
  return 0;
}

async function handleScan(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("scan requires a path");
    return 1;
  }

  const report = await scanNotes(path);
  if (values.json) {
    logger.stdout(JSON.stringify(report, null, 2));
  } else {
    printScan(report, logger);
  }

  return 0;
}

async function handleValidate(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("validate requires a path");
    return 1;
  }

  const result = await validateNotes(path);
  if (values.json) {
    logger.stdout(JSON.stringify(result.report, null, 2));
  } else {
    printValidation(result, logger);
  }

  return result.exitCode;
}

async function handleBuild(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      "out-dir": { type: "string" },
      profile: { type: "string" },
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("build requires a path");
    return 1;
  }

  if (values.profile) {
    const report = await buildWithProfile(path, {
      cwd: process.cwd(),
      profile: values.profile,
      artifactLoader: await createArtifactLoader({
        cwd: process.cwd(),
        pathHint: path,
      }),
    });

    if (values.json) {
      logger.stdout(JSON.stringify(report, null, 2));
    } else {
      printPublish(report, logger);
    }

    return report.status === "failed" ? 2 : 0;
  }

  const report = await buildNotes(path, values["out-dir"] ?? "dist/astro-ts");
  if (values.json) {
    logger.stdout(JSON.stringify(report, null, 2));
  } else {
    printBuild(report, logger);
  }

  return 0;
}

async function handleAi(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      artifact: { type: "string" },
      provider: { type: "string" },
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("ai requires a path");
    return 1;
  }

  const artifact = values.artifact as "summary" | "thread" | "seo" | "all" | undefined;
  const provider = values.provider as "openai" | "ollama" | undefined;
  const result = await generateAiArtifacts(path, {
    cwd: process.cwd(),
    artifact,
    provider,
  });

  if (values.json) {
    logger.stdout(JSON.stringify(result, null, 2));
  } else {
    printAi(result, logger);
  }

  return 0;
}

async function handlePublish(args: string[], logger: Logger): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      profile: { type: "string" },
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("publish requires a path");
    return 1;
  }

  const result = await publishWithProfile(path, {
    cwd: process.cwd(),
    profile: values.profile,
    artifactLoader: await createArtifactLoader({
      cwd: process.cwd(),
      pathHint: path,
    }),
  });

  if (values.json) {
    logger.stdout(JSON.stringify(result, null, 2));
  } else {
    printPublish(result, logger);
  }

  return result.status === "failed" ? 2 : 0;
}

function printScan(report: ScanReport, logger: Logger): void {
  logger.stdout(`Scanned ${report.notes.length} note(s) from ${report.root}`);
  for (const note of report.notes) {
    logger.stdout(`- ${note.relative_path} -> ${note.slug}`);
  }
}

function printValidation(result: ValidationExecution, logger: Logger): void {
  if (result.report.issues.length === 0) {
    logger.stdout("Validation passed");
    return;
  }

  logger.stdout(`Validation found ${result.report.issues.length} issue(s):`);
  for (const issue of result.report.issues) {
    if (issue.note) {
      logger.stdout(`- [${issue.level}] ${issue.message} (${issue.note})`);
    } else {
      logger.stdout(`- [${issue.level}] ${issue.message}`);
    }
  }
}

function printBuild(report: BuildReport, logger: Logger): void {
  logger.stdout(`Built ${report.outputs.length} note(s) into ${report.output_dir}`);
  for (const output of report.outputs) {
    logger.stdout(`- ${output.note_path} -> ${output.output_path}`);
  }
}

function printAi(result: AiGenerationExecution, logger: Logger): void {
  logger.stdout(
    `Generated AI artifacts for ${result.outputs.length} note(s) with ${result.provider}:${result.model}`,
  );
  for (const output of result.outputs) {
    logger.stdout(`- ${output.note_path} -> ${output.artifact_dir}`);
  }
  for (const warning of result.warnings) {
    logger.stdout(`warning: ${warning}`);
  }
}

function printInit(result: InitExecution, logger: Logger): void {
  const prefix = result.created ? "Created" : "Updated";
  logger.stdout(`${prefix} config at ${result.config_path}`);
}

function printPublish(result: PublishExecution, logger: Logger): void {
  logger.stdout(
    `${result.mode === "draft" ? "Built" : "Published"} ${result.outputs.length} note(s) to ${result.output_dir}`,
  );
  logger.stdout(`Status: ${result.status}`);
  for (const output of result.outputs) {
    logger.stdout(`- ${output.note_path} -> ${output.output_path}`);
    if (output.assets.length > 0) {
      logger.stdout(`  assets: ${output.assets.length}`);
    }
  }
  for (const warning of result.warnings) {
    logger.stdout(`warning: ${warning}`);
  }
  for (const error of result.errors) {
    logger.stdout(`error: ${error}`);
  }
  if (result.hook_output) {
    logger.stdout(`hook: ${result.hook_output}`);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === entryFile) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
