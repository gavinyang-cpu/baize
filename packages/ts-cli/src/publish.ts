import { constants, existsSync } from "node:fs";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { exec as execCallback } from "node:child_process";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { loadBaizeConfig, resolveConfigPath, resolveProfile } from "./config.js";
import { scanNotes, validateNotes } from "./rust.js";
import type {
  ArticleAsset,
  GeneratedArtifacts,
  NoteDocument,
  PublishExecution,
  PublishMode,
  PublishNoteResult,
  ValidationIssue,
} from "./types.js";

const execAsync = promisify(execCallback);

type PublishOptions = {
  cwd?: string;
  mode?: PublishMode;
  profile?: string;
  artifactLoader?: (note: NoteDocument) => Promise<GeneratedArtifacts | undefined>;
};

type RewriteContext = {
  assetsDir?: string;
  assetUrlBase: string;
  noteUrlBase: string;
  noteLookup: Map<string, string>;
  note: NoteDocument;
};

export async function publishNotes(
  path: string,
  options: PublishOptions = {},
): Promise<PublishExecution> {
  const { config, rootDir } = await loadBaizeConfig({
    cwd: options.cwd,
    pathHint: path,
  });
  const { name: profileName, profile } = resolveProfile(config, options.profile);
  const mode = options.mode ?? "publish";
  const validation = await validateNotes(path);
  if (validation.exitCode === 2) {
    return buildFailedResult(profileName, mode, profile.content_dir, validation.report.issues);
  }

  const scan = await scanNotes(path);
  const contentDir = resolveConfigPath(rootDir, profile.content_dir);
  const assetsDir = profile.assets_dir
    ? resolveConfigPath(rootDir, profile.assets_dir)
    : undefined;

  await mkdir(contentDir, { recursive: true });
  if (assetsDir) {
    await mkdir(assetsDir, { recursive: true });
  }

  const noteLookup = buildNoteLookup(scan.notes);
  const outputs: PublishNoteResult[] = [];
  const warnings: string[] = [];

  for (const note of scan.notes) {
    const artifacts = await options.artifactLoader?.(note);
    const transformed = await rewriteBody(note.body, {
      assetsDir,
      assetUrlBase: normalizeUrlBase(profile.asset_url_base ?? "/images/posts"),
      noteUrlBase: normalizeUrlBase(profile.note_url_base ?? "/blog"),
      noteLookup,
      note,
    });
    const outputPath = join(contentDir, `${note.slug}.md`);
    await writeFile(
      outputPath,
      renderAstroDocument(note, transformed.body, artifacts, profileName),
      "utf8",
    );

    outputs.push({
      note_path: note.relative_path,
      slug: note.slug,
      output_path: outputPath,
      assets: transformed.assets,
      warnings: [...note.warnings, ...transformed.warnings],
      artifacts,
    });
    warnings.push(...note.warnings.map((warning) => `${note.relative_path}: ${warning}`));
    warnings.push(...transformed.warnings.map((warning) => `${note.relative_path}: ${warning}`));
  }

  await ensureAssetCopies(outputs);

  const hookOutput =
    mode === "publish" && profile.build_command
      ? await runBuildHook(profile.build_command, rootDir)
      : undefined;

  return {
    adapter: "astro",
    profile: profileName,
    mode,
    status: warnings.length > 0 ? "warning" : "success",
    output_dir: contentDir,
    outputs,
    warnings,
    errors: [],
    hook_output: hookOutput,
  };
}

function buildFailedResult(
  profile: string,
  mode: PublishMode,
  outputDir: string,
  issues: ValidationIssue[],
): PublishExecution {
  return {
    adapter: "astro",
    profile,
    mode,
    status: "failed",
    output_dir: outputDir,
    outputs: [],
    warnings: issues
      .filter((issue) => issue.level === "warning")
      .map((issue) => issue.message),
    errors: issues.filter((issue) => issue.level === "error").map((issue) => issue.message),
  };
}

function buildNoteLookup(notes: NoteDocument[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const note of notes) {
    const relativeWithoutExt = stripExtension(note.relative_path);
    const baseName = basename(relativeWithoutExt);
    const keys = [note.title, note.slug, relativeWithoutExt, baseName];
    for (const key of keys) {
      lookup.set(normalizeLookupKey(key), note.slug);
    }
  }

  return lookup;
}

async function rewriteBody(body: string, context: RewriteContext): Promise<{
  body: string;
  assets: ArticleAsset[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const copiedAssets = new Map<string, ArticleAsset>();
  const noteDir = dirname(context.note.source_path);

  let nextBody = body.replace(/!\[\[([^[\]]+)\]\]/g, (full, rawTarget: string) => {
    const { target, label } = parseEmbedTarget(rawTarget);
    const rewritten = copyAssetIfNeeded(target, label ?? basename(target), noteDir, context, copiedAssets, warnings);
    return rewritten ?? full;
  });

  nextBody = nextBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, rawTarget: string) => {
    const target = rawTarget.trim();
    if (!isLocalAssetTarget(target)) {
      return full;
    }

    const rewritten = copyAssetIfNeeded(target, alt || basename(target), noteDir, context, copiedAssets, warnings);
    return rewritten ?? full;
  });

  nextBody = nextBody.replace(/\[\[([^[\]]+)\]\]/g, (full, rawTarget: string) => {
    const { target, label } = parseEmbedTarget(rawTarget);
    const { noteTarget, anchor } = splitAnchor(target);
    const resolvedSlug = resolveLinkedSlug(noteTarget, context.noteLookup);
    if (!resolvedSlug) {
      warnings.push(`could not resolve note link \`${target}\``);
      return full;
    }

    const linkText = label ?? basename(noteTarget);
    const anchorSuffix = anchor ? `#${slugFragment(anchor)}` : "";
    return `[${linkText}](${joinUrl(context.noteUrlBase, resolvedSlug)}${anchorSuffix})`;
  });

  return {
    body: nextBody,
    assets: [...copiedAssets.values()],
    warnings,
  };
}

function copyAssetIfNeeded(
  target: string,
  label: string,
  noteDir: string,
  context: RewriteContext,
  copiedAssets: Map<string, ArticleAsset>,
  warnings: string[],
): string | null {
  if (!context.assetsDir) {
    warnings.push(`assets_dir is not configured; leaving asset reference \`${target}\` unchanged`);
    return null;
  }

  const resolvedSource = resolve(noteDir, target);
  if (!existsSync(resolvedSource)) {
    warnings.push(`could not find asset \`${target}\``);
    return null;
  }

  const filename = basename(resolvedSource);
  const outputPath = join(context.assetsDir, context.note.slug, filename);
  const publicUrl = joinUrl(context.assetUrlBase, context.note.slug, filename);

  if (!copiedAssets.has(resolvedSource)) {
    copiedAssets.set(resolvedSource, {
      source_path: resolvedSource,
      output_path: outputPath,
      public_url: publicUrl,
    });
  }

  return `![${label}](${publicUrl})`;
}

function renderAstroDocument(
  note: NoteDocument,
  body: string,
  artifacts: GeneratedArtifacts | undefined,
  profileName: string,
): string {
  const frontmatter: Record<string, unknown> = {
    title: note.title,
    slug: note.slug,
    source_path: note.relative_path,
    tags: note.tags,
    publish_profile: profileName,
    ...extractFrontmatterExtras(note.frontmatter),
  };

  if (artifacts?.summary) {
    frontmatter.summary = artifacts.summary;
  }

  if (artifacts?.thread?.length) {
    frontmatter.thread = artifacts.thread;
  }

  if (artifacts?.seo?.title) {
    frontmatter.seo_title = artifacts.seo.title;
  }

  if (artifacts?.seo?.description) {
    frontmatter.description = artifacts.seo.description;
  }

  if (artifacts?.seo?.keywords?.length) {
    frontmatter.keywords = artifacts.seo.keywords;
  }

  return `---\n${stringifyYaml(frontmatter)}---\n\n${body.trim()}\n`;
}

function stringifyYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) {
      continue;
    }

    lines.push(...serializeYamlEntry(key, entry, 0));
  }

  return `${lines.join("\n")}\n`;
}

function serializeYamlEntry(key: string, value: unknown, indent: number): string[] {
  const prefix = `${"  ".repeat(indent)}${key}:`;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix} []`];
    }

    const lines = [prefix];
    for (const item of value) {
      if (isPlainObject(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) {
          lines.push(`${"  ".repeat(indent + 1)}- {}`);
          continue;
        }

        const [firstKey, firstValue] = entries[0]!;
        const firstLine = serializeYamlEntry(firstKey, firstValue, 0)[0] ?? `${firstKey}: {}`;
        lines.push(`${"  ".repeat(indent + 1)}- ${firstLine}`);
        for (const [nestedKey, nestedValue] of entries.slice(1)) {
          lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 2));
        }
      } else if (Array.isArray(item)) {
        lines.push(`${"  ".repeat(indent + 1)}-`);
        for (const nested of item) {
          lines.push(...serializeYamlSequenceItem(nested, indent + 2));
        }
      } else {
        lines.push(`${"  ".repeat(indent + 1)}- ${stringifyScalar(item)}`);
      }
    }

    return lines;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${prefix} {}`];
    }

    const lines = [prefix];
    for (const [nestedKey, nestedValue] of entries) {
      lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 1));
    }
    return lines;
  }

  return [`${prefix} ${stringifyScalar(value)}`];
}

function serializeYamlSequenceItem(value: unknown, indent: number): string[] {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${"  ".repeat(indent)}- {}`];
    }

    const [firstKey, firstValue] = entries[0]!;
    const firstLine = serializeYamlEntry(firstKey, firstValue, 0)[0] ?? `${firstKey}: {}`;
    const lines = [`${"  ".repeat(indent)}- ${firstLine}`];
    for (const [nestedKey, nestedValue] of entries.slice(1)) {
      lines.push(...serializeYamlEntry(nestedKey, nestedValue, indent + 1));
    }
    return lines;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${"  ".repeat(indent)}- []`];
    }

    const lines = [`${"  ".repeat(indent)}-`];
    for (const nested of value) {
      lines.push(...serializeYamlSequenceItem(nested, indent + 1));
    }
    return lines;
  }

  return [`${"  ".repeat(indent)}- ${stringifyScalar(value)}`];
}

function stringifyScalar(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  const stringValue = String(value);
  if (stringValue === "" || /[:#[\]{}]|^\s|\s$|\n/.test(stringValue)) {
    return JSON.stringify(stringValue);
  }

  return stringValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFrontmatterExtras(frontmatter: NoteDocument["frontmatter"]): Record<string, unknown> {
  const reserved = new Set(["title", "slug", "publish", "ai", "tags"]);
  return Object.fromEntries(
    Object.entries(frontmatter).filter(([key, value]) => !reserved.has(key) && value !== undefined),
  );
}

async function runBuildHook(command: string, cwd: string): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    env: process.env,
  });

  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return output;
}

function parseEmbedTarget(rawTarget: string): { target: string; label?: string } {
  const [target, label] = rawTarget.split("|", 2);
  return {
    target: target.trim(),
    label: label?.trim(),
  };
}

function splitAnchor(target: string): { noteTarget: string; anchor?: string } {
  const [noteTarget, anchor] = target.split("#", 2);
  return {
    noteTarget: noteTarget.trim(),
    anchor: anchor?.trim(),
  };
}

function resolveLinkedSlug(target: string, lookup: Map<string, string>): string | undefined {
  const normalized = normalizeLookupKey(stripExtension(target));
  return lookup.get(normalized) ?? lookup.get(normalizeLookupKey(basename(stripExtension(target))));
}

function stripExtension(path: string): string {
  const extension = extname(path);
  return extension.length > 0 ? path.slice(0, -extension.length) : path;
}

function normalizeLookupKey(value: string): string {
  return value.replace(/\\/g, "/").trim().toLowerCase();
}

function normalizeUrlBase(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function joinUrl(...parts: string[]): string {
  return parts
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/\/+$/, "");
      }

      return part.replace(/^\/+/, "").replace(/\/+$/, "");
    })
    .filter((part) => part.length > 0)
    .join("/");
}

function slugFragment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isLocalAssetTarget(target: string): boolean {
  return !/^(?:https?:\/\/|mailto:|#|\/)/i.test(target);
}

async function ensureAssetCopies(outputs: PublishNoteResult[]): Promise<void> {
  const seen = new Set<string>();
  for (const output of outputs) {
    for (const asset of output.assets) {
      if (seen.has(asset.output_path)) {
        continue;
      }

      if (!(await fileExists(asset.source_path))) {
        continue;
      }

      await mkdir(dirname(asset.output_path), { recursive: true });
      await copyFile(asset.source_path, asset.output_path);
      seen.add(asset.output_path);
    }
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function buildWithProfile(
  path: string,
  options: Omit<PublishOptions, "mode"> = {},
): Promise<PublishExecution> {
  return publishNotes(path, {
    ...options,
    mode: "draft",
  });
}

export async function publishWithProfile(
  path: string,
  options: Omit<PublishOptions, "mode"> = {},
): Promise<PublishExecution> {
  return publishNotes(path, {
    ...options,
    mode: "publish",
  });
}
