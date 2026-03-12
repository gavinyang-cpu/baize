#!/usr/bin/env node

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { buildNotes, scanNotes, validateNotes } from "./index.js";
import type { BuildReport, ScanReport, ValidationExecution } from "./types.js";

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
      case "scan":
        return await handleScan(rest, logger);
      case "validate":
        return await handleValidate(rest, logger);
      case "build":
        return await handleBuild(rest, logger);
      default:
        logger.stderr(
          "Usage: baize-ts <scan|validate|build> <path> [--json] [--out-dir <dir>]",
        );
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.stderr(`error: ${message}`);
    return 1;
  }
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
    },
  });

  const path = positionals[0];
  if (!path) {
    logger.stderr("build requires a path");
    return 1;
  }

  const outDir = values["out-dir"] ?? "dist/astro-ts";
  const report = await buildNotes(path, outDir);
  if (values.json) {
    logger.stdout(JSON.stringify(report, null, 2));
  } else {
    printBuild(report, logger);
  }

  return 0;
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

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === entryFile) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
