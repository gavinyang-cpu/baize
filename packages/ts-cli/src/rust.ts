import { access } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { BuildReport, ScanReport, ValidationExecution } from "./types.js";

const execFileAsync = promisify(execFile);
let runtimeRoot = detectRuntimeRoot();
const rustBinaryName = process.platform === "win32" ? "baize-cli.exe" : "baize-cli";

type StructuredResult<T> = {
  exitCode: number;
  data: T;
};

export function setBaizeRuntimeRoot(root: string): void {
  runtimeRoot = resolve(root);
}

export function getBaizeRuntimeRoot(): string {
  return runtimeRoot;
}

export async function scanNotes(path: string): Promise<ScanReport> {
  const result = await runStructuredCommand<ScanReport>(["scan", path, "--json"]);
  return result.data;
}

export async function validateNotes(path: string): Promise<ValidationExecution> {
  const result = await runStructuredCommand<ValidationExecution["report"]>(
    ["validate", path, "--json"],
    [0, 2],
  );

  return {
    exitCode: result.exitCode,
    report: result.data,
  };
}

export async function buildNotes(path: string, outDir: string): Promise<BuildReport> {
  const result = await runStructuredCommand<BuildReport>([
    "build",
    path,
    "--out-dir",
    outDir,
    "--json",
  ]);
  return result.data;
}

async function runStructuredCommand<T>(
  args: string[],
  acceptableExitCodes: number[] = [0],
): Promise<StructuredResult<T>> {
  const invocation = await createInvocation(args);

  try {
    const { stdout } = await execFileAsync(invocation.command, invocation.args, {
      cwd: runtimeRoot,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      exitCode: 0,
      data: parseJson<T>(stdout),
    };
  } catch (error) {
    const execution = normalizeExecError(error);

    if (
      acceptableExitCodes.includes(execution.exitCode) &&
      execution.stdout.trim().length > 0
    ) {
      return {
        exitCode: execution.exitCode,
        data: parseJson<T>(execution.stdout),
      };
    }

    const stderr = execution.stderr.trim();
    throw new Error(
      stderr.length > 0
        ? `Rust command failed (${execution.exitCode}): ${stderr}`
        : `Rust command failed with exit code ${execution.exitCode}`,
    );
  }
}

async function createInvocation(args: string[]): Promise<{
  command: string;
  args: string[];
}> {
  const explicitBinary = process.env.BAIZE_RUST_CLI;
  if (explicitBinary) {
    return { command: explicitBinary, args };
  }

  const targetBinary = join(runtimeRoot, "target", "debug", rustBinaryName);
  if (await exists(targetBinary)) {
    return { command: targetBinary, args };
  }

  const cargo = resolveCargoExecutable();
  return {
    command: cargo,
    args: ["run", "-q", "-p", "baize-cli", "--", ...args],
  };
}

function resolveCargoExecutable(): string {
  if (process.env.CARGO && process.env.CARGO.length > 0) {
    return process.env.CARGO;
  }

  const home = process.env.HOME;
  if (home) {
    return join(home, ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
  }

  return "cargo";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function normalizeExecError(error: unknown): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const execution = error as {
    code?: number | string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };

  const code =
    typeof execution.code === "number"
      ? execution.code
      : Number.parseInt(String(execution.code ?? 1), 10) || 1;

  return {
    exitCode: code,
    stdout: toString(execution.stdout),
    stderr: toString(execution.stderr),
  };
}

function toString(value: string | Buffer | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (value) {
    return value.toString("utf8");
  }

  return "";
}

function detectRuntimeRoot(): string {
  const explicitRoot = process.env.BAIZE_WORKSPACE;
  if (explicitRoot && explicitRoot.length > 0) {
    return resolve(explicitRoot);
  }

  let current = resolve(process.cwd());
  while (true) {
    if (existsSync(join(current, "Cargo.toml")) && existsSync(join(current, "package.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(process.cwd());
    }

    current = parent;
  }
}
