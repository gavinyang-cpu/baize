import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { loadBaizeConfig, resolveProfile } from "../../ts-cli/src/config.js";
import { inspectBaizeRuntime } from "../../ts-cli/src/rust.js";
import type {
  AiGenerationExecution,
  PublishExecution,
  ValidationExecution,
} from "../../ts-cli/src/types.js";

type SetupInput = {
  workspaceRoot: string;
  pathHint?: string;
  profile?: string;
};

type SetupBase = {
  workspaceRoot: string;
  warnings: string[];
};

export type BaizeSetupReady = SetupBase & {
  ok: true;
  configPath: string;
  profileName: string;
  adapter: "astro";
  runtime: Awaited<ReturnType<typeof inspectBaizeRuntime>>;
};

export type BaizeSetupFailure = SetupBase & {
  ok: false;
  errors: string[];
  runtime: Awaited<ReturnType<typeof inspectBaizeRuntime>>;
};

export type BaizeSetupStatus = BaizeSetupReady | BaizeSetupFailure;

export async function checkBaizeSetup(input: SetupInput): Promise<BaizeSetupStatus> {
  const workspaceRoot = resolve(input.workspaceRoot);
  const warnings: string[] = [];

  if (!(await pathExists(workspaceRoot))) {
    return {
      ok: false,
      workspaceRoot,
      warnings,
      errors: [`Workspace path does not exist: ${workspaceRoot}`],
      runtime: {
        kind: "cargo",
        command: "cargo",
        source: "cargo",
        available: false,
      },
    };
  }

  const runtime = await inspectBaizeRuntime(workspaceRoot);
  const errors: string[] = [];

  if (!(await pathExists(resolve(workspaceRoot, "Cargo.toml")))) {
    errors.push(`Workspace root must contain Cargo.toml: ${workspaceRoot}`);
  }

  if (!(await pathExists(resolve(workspaceRoot, "package.json")))) {
    warnings.push(`Workspace root does not contain package.json: ${workspaceRoot}`);
  }

  if (!runtime.available) {
    errors.push(`Rust runtime is unavailable: ${runtime.command}`);
  }

  try {
    const { config, configPath } = await loadBaizeConfig({
      cwd: workspaceRoot,
      pathHint: input.pathHint,
    });
    const { name, profile } = resolveProfile(config, input.profile);

    if (errors.length > 0) {
      return {
        ok: false,
        workspaceRoot,
        warnings,
        errors,
        runtime,
      };
    }

    return {
      ok: true,
      workspaceRoot,
      warnings,
      configPath,
      profileName: name,
      adapter: profile.adapter,
      runtime,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      workspaceRoot,
      warnings,
      errors,
      runtime,
    };
  }
}

export function formatSetupNotice(status: BaizeSetupStatus): string {
  if (!status.ok) {
    const firstError = status.errors[0] ?? "Unknown setup error.";
    return `Baize setup failed: ${firstError}`;
  }

  const warningSuffix =
    status.warnings.length > 0 ? ` Warnings: ${status.warnings.length}.` : "";
  return `Baize ready. Profile ${status.profileName} -> ${status.adapter}. Runtime ${status.runtime.kind}:${status.runtime.command}.${warningSuffix}`;
}

export function formatPublishNotice(result: PublishExecution): string {
  if (result.status === "failed") {
    return `Publish failed: ${result.errors[0] ?? "Unknown publish error."}`;
  }

  if (result.status === "warning") {
    const firstWarning = result.warnings[0];
    return firstWarning
      ? `Published ${result.outputs.length} note(s) with ${result.warnings.length} warning(s). First warning: ${firstWarning}`
      : `Published ${result.outputs.length} note(s) with warnings.`;
  }

  return `Published ${result.outputs.length} note(s) to profile ${result.profile}.`;
}

export function formatValidationNotice(result: ValidationExecution): string {
  if (result.exitCode === 2) {
    return `Validation failed: ${result.report.issues[0]?.message ?? "Unknown validation error."}`;
  }

  if (result.report.issues.length === 0) {
    return "Validation passed.";
  }

  const firstWarning = result.report.issues[0]?.message;
  return firstWarning
    ? `Validation completed with ${result.report.issues.length} warning(s). First warning: ${firstWarning}`
    : `Validation completed with ${result.report.issues.length} warning(s).`;
}

export function formatAiNotice(
  result: AiGenerationExecution,
  artifact: "summary" | "thread" | "seo" | "all",
): string {
  const label = artifact === "all" ? "AI artifacts" : artifact;
  const warningSuffix =
    result.warnings.length > 0 ? ` Warnings: ${result.warnings.length}.` : "";
  return `Generated ${label} for ${result.outputs.length} note(s) via ${result.provider}:${result.model}.${warningSuffix}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
