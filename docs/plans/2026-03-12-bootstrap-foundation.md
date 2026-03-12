# Baize Bootstrap Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap Baize into a buildable TypeScript workspace with a shared core engine, CLI, and Obsidian plugin scaffold, plus a working Astro publish path for local Markdown notes.

**Architecture:** Use npm workspaces to separate the core library, CLI entrypoint, and Obsidian plugin package while keeping publishing logic in a shared core package. Start with a deterministic local pipeline: parse Markdown and frontmatter, validate note/assets/config, normalize into an article model, and publish into an Astro content directory.

**Tech Stack:** TypeScript, npm workspaces, Vitest, tsup, gray-matter, fast-glob, Obsidian plugin API types

---

### Task 1: Initialize repository and workspace layout

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/.gitignore`
- Create: `/Users/gavinyoung/Projects/baize/package.json`
- Create: `/Users/gavinyoung/Projects/baize/tsconfig.base.json`
- Create: `/Users/gavinyoung/Projects/baize/vitest.config.ts`
- Create: `/Users/gavinyoung/Projects/baize/README.md`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/package.json`
- Create: `/Users/gavinyoung/Projects/baize/packages/cli/package.json`
- Create: `/Users/gavinyoung/Projects/baize/packages/obsidian-plugin/package.json`

**Step 1:** Initialize a new git repository on `main` and attach the GitHub remote.

**Step 2:** Create the root workspace config, shared TypeScript config, test config, and ignore rules.

**Step 3:** Define package manifests for `@baize/core`, `baize`, and `@baize/obsidian-plugin`.

**Step 4:** Install dependencies and verify `npm install` completes successfully.

**Step 5:** Commit the repository bootstrap once the workspace resolves.

### Task 2: Build the shared core contracts and local publish pipeline

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/index.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/types.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/config.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/slug.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/parser.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/validator.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/adapters/astro.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/core/src/publish.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/core/src/*.test.ts`

**Step 1:** Write tests for slug generation, Markdown parsing, validation, and Astro publishing behavior.

**Step 2:** Implement the `Article`, `PublishResult`, config, and validation contracts from the PRD.

**Step 3:** Implement file and folder path resolution plus Markdown frontmatter parsing.

**Step 4:** Implement the Astro adapter to emit content files and copy local assets.

**Step 5:** Run the focused test suite and make it pass.

### Task 3: Add a runnable CLI

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/cli/src/index.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/cli/src/format.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/cli/src/index.test.ts`

**Step 1:** Add CLI argument parsing for `init`, `validate`, `build`, and `publish`.

**Step 2:** Implement `publisher init` to write a starter config file.

**Step 3:** Implement `validate`, `build`, and `publish` with human-readable and JSON output modes.

**Step 4:** Add CLI-level tests around command output and exit behavior where practical.

**Step 5:** Run CLI tests and a sample end-to-end invocation against fixture content.

### Task 4: Scaffold the Obsidian plugin package

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/obsidian-plugin/src/main.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/obsidian-plugin/src/settings.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/obsidian-plugin/manifest.json`
- Create: `/Users/gavinyoung/Projects/baize/packages/obsidian-plugin/versions.json`

**Step 1:** Add a minimal plugin entrypoint, settings tab, and command registration skeleton.

**Step 2:** Wire command handlers to shared-core placeholders or notices so the plugin compiles cleanly.

**Step 3:** Add a build script that emits the plugin bundle and required manifest files.

**Step 4:** Verify the plugin package builds without blocking the CLI/core packages.

### Task 5: Document and verify the bootstrap

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/README.md`
- Modify: `/Users/gavinyoung/Projects/baize/obsidian_ai_publisher_prd_v2.md`

**Step 1:** Document the current implemented scope versus planned scope.

**Step 2:** Add local development instructions for install, build, test, and CLI usage.

**Step 3:** Run `npm test` and `npm run build` at the root.

**Step 4:** Commit the bootstrap implementation.
