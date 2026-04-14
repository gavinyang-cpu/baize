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
  noteLookup: Map<string, NoteDocument>;
  hostNote: NoteDocument;
  currentNote: NoteDocument;
  copiedAssets: Map<string, ArticleAsset>;
  visitedNotes: Set<string>;
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
      hostNote: note,
      currentNote: note,
      copiedAssets: new Map<string, ArticleAsset>(),
      visitedNotes: new Set([note.source_path]),
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

function buildNoteLookup(notes: NoteDocument[]): Map<string, NoteDocument> {
  const lookup = new Map<string, NoteDocument>();
  for (const note of notes) {
    const relativeWithoutExt = stripExtension(note.relative_path);
    const baseName = basename(relativeWithoutExt);
    const keys = [note.title, note.slug, relativeWithoutExt, baseName];
    for (const key of keys) {
      lookup.set(normalizeLookupKey(key), note);
    }
  }

  return lookup;
}

async function buildSiblingNoteLookup(
  note: NoteDocument,
  currentLookup: Map<string, NoteDocument>,
): Promise<Map<string, NoteDocument>> {
  const lookup = new Map<string, NoteDocument>();
  const noteDir = dirname(note.source_path);
  const matches = [...note.body.matchAll(/!?\[\[([^[\]]+)\]\]/g)];

  for (const match of matches) {
    const rawTarget = match[1];
    if (!rawTarget) {
      continue;
    }

    const { target } = parseEmbedTarget(rawTarget);
    const { noteTarget } = splitAnchor(target);
    if (!isLikelyNoteTarget(noteTarget)) {
      continue;
    }
    const normalizedTarget = normalizeLookupKey(stripExtension(noteTarget));
    const basenameTarget = normalizeLookupKey(basename(stripExtension(noteTarget)));

    if (currentLookup.has(normalizedTarget) || currentLookup.has(basenameTarget)) {
      continue;
    }
    if (lookup.has(normalizedTarget) || lookup.has(basenameTarget)) {
      continue;
    }

    const linkedNote = await resolveSiblingLinkedNote(noteDir, noteTarget);
    if (!linkedNote) {
      continue;
    }

    lookup.set(normalizedTarget, linkedNote);
    lookup.set(basenameTarget, linkedNote);
  }

  return lookup;
}

async function rewriteBody(body: string, context: RewriteContext): Promise<{
  body: string;
  assets: ArticleAsset[];
  warnings: string[];
}> {
  const rewritten = await rewriteNoteBody({
    ...context,
    currentNote: {
      ...context.currentNote,
      body,
    },
  });

  return {
    body: rewritten.body,
    assets: [...context.copiedAssets.values()],
    warnings: rewritten.warnings,
  };
}

async function rewriteNoteBody(context: RewriteContext): Promise<{
  body: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const noteDir = dirname(context.currentNote.source_path);
  const siblingLookup = await buildSiblingNoteLookup(context.currentNote, context.noteLookup);

  let nextBody = await replaceAsync(context.currentNote.body, /!\[\[([^[\]]+)\]\]/g, async (full, rawTarget: string) => {
    const { target, label } = parseEmbedTarget(rawTarget);
    const { noteTarget, anchor } = splitAnchor(target);
    const transcludedNote = resolveLinkedNote(noteTarget, context.noteLookup, siblingLookup);
    if (transcludedNote) {
      if (context.visitedNotes.has(transcludedNote.source_path)) {
        warnings.push(formatRewriteWarning(context, `skipping cyclic transclusion \`${target}\``));
        return "";
      }

      const transclusionBody = anchor
        ? extractTransclusionBody(transcludedNote.body, anchor)
        : transcludedNote.body;
      if (transclusionBody === undefined) {
        warnings.push(formatRewriteWarning(context, `could not resolve transclusion anchor \`${target}\``));
        return full;
      }

      const transcluded = await rewriteNoteBody({
        ...context,
        currentNote: {
          ...transcludedNote,
          body: transclusionBody,
        },
        visitedNotes: new Set([...context.visitedNotes, transcludedNote.source_path]),
      });
      warnings.push(...transcluded.warnings);
      return `\n${transcluded.body.trim()}\n`;
    }

    const rewritten = copyAssetIfNeeded(target, label ?? basename(target), noteDir, context, warnings);
    return rewritten ?? full;
  });

  nextBody = nextBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, rawTarget: string) => {
    const target = rawTarget.trim();
    if (!isLocalAssetTarget(target)) {
      return full;
    }

    const rewritten = copyAssetIfNeeded(target, alt || basename(target), noteDir, context, warnings);
    return rewritten ?? full;
  });

  nextBody = nextBody.replace(/\[\[([^[\]]+)\]\]/g, (full, rawTarget: string) => {
    const { target, label } = parseEmbedTarget(rawTarget);
    const { noteTarget, anchor } = splitAnchor(target);
    const linkedNote = resolveLinkedNote(
      noteTarget,
      context.noteLookup,
      siblingLookup,
    );
    if (!linkedNote) {
      warnings.push(formatRewriteWarning(context, `could not resolve note link \`${target}\``));
      return full;
    }

    const linkText = label ?? basename(noteTarget);
    const anchorSuffix = anchor ? `#${slugFragment(anchor)}` : "";
    return `[${linkText}](${joinUrl(context.noteUrlBase, linkedNote.slug)}${anchorSuffix})`;
  });

  nextBody = rewriteCallouts(nextBody);

  return {
    body: nextBody,
    warnings,
  };
}

function copyAssetIfNeeded(
  target: string,
  label: string,
  noteDir: string,
  context: RewriteContext,
  warnings: string[],
): string | null {
  if (!context.assetsDir) {
    warnings.push(
      formatRewriteWarning(context, `assets_dir is not configured; leaving asset reference \`${target}\` unchanged`),
    );
    return null;
  }

  const resolvedSource = resolve(noteDir, target);
  if (!existsSync(resolvedSource)) {
    warnings.push(formatRewriteWarning(context, `could not find asset \`${target}\``));
    return null;
  }

  const filename = basename(resolvedSource);
  const outputPath = join(context.assetsDir, context.hostNote.slug, filename);
  const publicUrl = joinUrl(context.assetUrlBase, context.hostNote.slug, filename);

  if (!context.copiedAssets.has(resolvedSource)) {
    context.copiedAssets.set(resolvedSource, {
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

function resolveLinkedNote(
  target: string,
  lookup: Map<string, NoteDocument>,
  siblingLookup?: Map<string, NoteDocument>,
): NoteDocument | undefined {
  const normalized = normalizeLookupKey(stripExtension(target));
  return (
    lookup.get(normalized) ??
    lookup.get(normalizeLookupKey(basename(stripExtension(target)))) ??
    siblingLookup?.get(normalized) ??
    siblingLookup?.get(normalizeLookupKey(basename(stripExtension(target))))
  );
}

function stripExtension(path: string): string {
  const extension = extname(path);
  return extension.length > 0 ? path.slice(0, -extension.length) : path;
}

async function resolveSiblingLinkedNote(
  noteDir: string,
  noteTarget: string,
): Promise<NoteDocument | undefined> {
  for (const candidate of siblingNoteCandidates(noteDir, noteTarget)) {
    if (!existsSync(candidate)) {
      continue;
    }

    const report = await scanNotes(candidate);
    const linked = report.notes[0];
    if (linked) {
      return linked;
    }
  }

  return undefined;
}

function siblingNoteCandidates(noteDir: string, noteTarget: string): string[] {
  const direct = resolve(noteDir, noteTarget);
  const withExtension =
    extname(noteTarget).length > 0
      ? []
      : [resolve(noteDir, `${noteTarget}.md`), resolve(noteDir, `${noteTarget}.markdown`)];

  return [direct, ...withExtension];
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

function extractTransclusionBody(body: string, anchor: string): string | undefined {
  if (anchor.startsWith("^")) {
    return extractBlockTransclusion(body, anchor.slice(1));
  }

  return extractHeadingSection(body, anchor);
}

function extractHeadingSection(body: string, anchor: string): string | undefined {
  const lines = body.split("\n");
  const target = slugFragment(anchor);
  let startIndex = -1;
  let startDepth = 0;

  for (const [index, line] of lines.entries()) {
    const heading = parseHeading(line);
    if (!heading) {
      continue;
    }

    if (startIndex === -1) {
      if (slugFragment(heading.title) === target) {
        startIndex = index;
        startDepth = heading.depth;
      }
      continue;
    }

    if (heading.depth <= startDepth) {
      return lines.slice(startIndex, index).join("\n").trim();
    }
  }

  if (startIndex === -1) {
    return undefined;
  }

  return lines.slice(startIndex).join("\n").trim();
}

function extractBlockTransclusion(body: string, blockId: string): string | undefined {
  const lines = body.split("\n");
  let blockStart = 0;

  for (let index = 0; index <= lines.length; index += 1) {
    const current = lines[index] ?? "";
    const isBoundary = index === lines.length || current.trim().length === 0;
    if (!isBoundary) {
      continue;
    }

    const blockLines = lines.slice(blockStart, index);
    const extracted = stripBlockReference(blockLines, blockId);
    if (extracted) {
      return extracted.join("\n").trim();
    }

    blockStart = index + 1;
  }

  return undefined;
}

function stripBlockReference(lines: string[], blockId: string): string[] | undefined {
  const marker = `^${blockId}`;
  const escapedMarker = escapeRegExp(marker);
  const inlinePattern = new RegExp(`^(.*?)(?:\\s+)?${escapedMarker}\\s*$`);
  let matched = false;

  const cleaned = lines.flatMap((line) => {
    if (line.trim() === marker) {
      matched = true;
      return [];
    }

    const inlineMatch = line.match(inlinePattern);
    if (inlineMatch) {
      matched = true;
      return [inlineMatch[1] ?? ""];
    }

    return [line];
  });

  return matched ? cleaned : undefined;
}

function parseHeading(line: string): { depth: number; title: string } | undefined {
  const match = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
  if (!match) {
    return undefined;
  }

  return {
    depth: match[1].length,
    title: match[2] ?? "",
  };
}

function rewriteCallouts(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const match = line.match(/^>\s*\[!([^\]\s]+)\][+-]?\s*(.*)$/i);
      if (!match) {
        return line;
      }

      const [, kind, title] = match;
      const label = kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1).toLowerCase()}` : "Note";
      return title.trim().length > 0 ? `> **${label}:** ${title.trim()}` : `> **${label}**`;
    })
    .join("\n");
}

function isLocalAssetTarget(target: string): boolean {
  return !/^(?:https?:\/\/|mailto:|#|\/)/i.test(target);
}

function isLikelyNoteTarget(target: string): boolean {
  if (!isLocalAssetTarget(target)) {
    return false;
  }

  const extension = extname(target).toLowerCase();
  return extension.length === 0 || extension === ".md" || extension === ".markdown";
}

function formatRewriteWarning(context: RewriteContext, message: string): string {
  if (context.currentNote.source_path === context.hostNote.source_path) {
    return message;
  }

  return `transclusion ${context.currentNote.relative_path}: ${message}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (match: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) {
    return input;
  }

  const replacements = await Promise.all(
    matches.map((match) => replacer(match[0], ...(match.slice(1) as string[]))),
  );

  let result = "";
  let lastIndex = 0;
  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    result += input.slice(lastIndex, start);
    result += replacements[index] ?? match[0];
    lastIndex = start + match[0].length;
  }
  result += input.slice(lastIndex);
  return result;
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
