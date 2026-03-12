import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { AstroProfileConfig, BaizeConfig, InitExecution } from "./types.js";

export const BAIZE_CONFIG_FILE = "baize.config.json";

export function createDefaultConfig(): BaizeConfig {
  return {
    version: 1,
    default_profile: "main",
    profiles: {
      main: {
        adapter: "astro",
        content_dir: "./site/src/content/blog",
        assets_dir: "./site/public/images/posts",
        asset_url_base: "/images/posts",
        note_url_base: "/blog",
        build_command: "npm run build -w site",
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
  };
}

export async function writeDefaultConfig(
  directory: string,
  options: { force?: boolean } = {},
): Promise<InitExecution> {
  const configPath = resolve(directory, BAIZE_CONFIG_FILE);
  const exists = await fileExists(configPath);
  if (exists && !options.force) {
    throw new Error(
      `Config already exists at ${configPath}. Re-run with --force to overwrite it.`,
    );
  }

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(`${configPath}`, `${JSON.stringify(createDefaultConfig(), null, 2)}\n`, "utf8");

  return {
    config_path: configPath,
    created: !exists,
  };
}

export async function loadBaizeConfig(options: {
  cwd?: string;
  pathHint?: string;
} = {}): Promise<{
  config: BaizeConfig;
  configPath: string;
  rootDir: string;
}> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const pathHint = options.pathHint ? resolve(options.pathHint) : undefined;
  const configPath = await findConfigPath(cwd, pathHint);

  if (!configPath) {
    throw new Error(
      `Could not find ${BAIZE_CONFIG_FILE}. Run \`baize-ts init\` from your project root first.`,
    );
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as BaizeConfig;
  assertValidConfig(parsed, configPath);

  return {
    config: parsed,
    configPath,
    rootDir: dirname(configPath),
  };
}

export function resolveProfile(
  config: BaizeConfig,
  profileName?: string,
): { name: string; profile: AstroProfileConfig } {
  const selected = profileName ?? config.default_profile;
  if (!selected) {
    throw new Error("No publish profile provided and no default_profile is configured.");
  }

  const profile = config.profiles[selected];
  if (!profile) {
    throw new Error(`Unknown publish profile \`${selected}\`.`);
  }

  return {
    name: selected,
    profile,
  };
}

export function resolveConfigPath(rootDir: string, targetPath: string): string {
  return isAbsolute(targetPath) ? targetPath : resolve(rootDir, targetPath);
}

async function findConfigPath(cwd: string, pathHint?: string): Promise<string | null> {
  const candidates = new Set<string>();
  for (const start of [pathHint ? dirname(pathHint) : undefined, cwd]) {
    if (!start) {
      continue;
    }

    let current = resolve(start);
    while (true) {
      candidates.add(join(current, BAIZE_CONFIG_FILE));
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function assertValidConfig(config: BaizeConfig, configPath: string): void {
  if (config.version !== 1) {
    throw new Error(`Unsupported config version in ${configPath}. Expected version 1.`);
  }

  if (!config.profiles || Object.keys(config.profiles).length === 0) {
    throw new Error(`Config ${configPath} must define at least one publish profile.`);
  }

  for (const [name, profile] of Object.entries(config.profiles)) {
    if (profile.adapter !== "astro") {
      throw new Error(`Profile \`${name}\` uses unsupported adapter \`${profile.adapter}\`.`);
    }

    if (!profile.content_dir) {
      throw new Error(`Profile \`${name}\` is missing content_dir.`);
    }
  }
}
