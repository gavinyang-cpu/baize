# Core MVP Publishing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining core MVP features in the current CLI and MCP surface: config init, Astro publish profiles, asset handling, AI artifact generation, and publish execution.

**Architecture:** Keep Rust as the source of truth for note discovery and validation, and add the richer publishing workflow in TypeScript. The TypeScript layer will load config, call the Rust scanner, rewrite links and assets, optionally generate AI artifacts through provider adapters, and publish to Astro targets with deterministic results.

**Tech Stack:** TypeScript, Node.js, Vitest, existing Rust-backed `@baize/ts-cli`, OpenAI Responses API, Ollama HTTP API

---

### Task 1: Add config loading and `init`

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/config.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/types.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/cli.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/config.test.ts`

**Step 1:** Write a failing test that `init` creates a default `baize.config.json`.

**Step 2:** Implement config types and config file discovery/loading.

**Step 3:** Implement `writeDefaultConfig()` with a safe `force` option.

**Step 4:** Wire `init` into the CLI and return a clear output path.

**Step 5:** Run the config tests and CLI tests.

### Task 2: Add Astro profile build and publish pipeline

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/publish.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/index.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/types.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/cli.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/publish.test.ts`

**Step 1:** Write failing tests for profile resolution, output file creation, and publish results.

**Step 2:** Implement profile resolution from `baize.config.json`.

**Step 3:** Render normalized Astro frontmatter in TypeScript using the Rust scan results.

**Step 4:** Return a structured publish result with status, output paths, warnings, and optional hook result.

**Step 5:** Run the publish tests and existing CLI tests.

### Task 3: Add local asset copying and link rewriting

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/publish.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/types.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/publish.test.ts`

**Step 1:** Write failing tests for Obsidian image embeds, Markdown image links, and wikilink rewriting.

**Step 2:** Implement local asset discovery and copy assets into profile asset directories.

**Step 3:** Rewrite note bodies so Astro output uses standard Markdown image and note links.

**Step 4:** Surface missing assets or unresolved note links as warnings instead of silent failure.

**Step 5:** Re-run publish tests.

### Task 4: Add AI providers and artifact generation

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/ai.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/ai.test.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/types.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/cli.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/index.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/publish.ts`

**Step 1:** Write failing tests for summary, thread, and SEO artifact generation using mocked fetch responses.

**Step 2:** Implement provider selection and request logic for OpenAI and Ollama.

**Step 3:** Store artifacts under `.baize/artifacts/<slug>/`.

**Step 4:** Load existing artifacts during publish and include SEO metadata in output frontmatter.

**Step 5:** Re-run AI and publish tests.

### Task 5: Extend MCP and documentation

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp-tools.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp-tools.test.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp.ts`
- Modify: `/Users/gavinyoung/Projects/baize/README.md`

**Step 1:** Add MCP tools for AI artifact generation and Astro publish.

**Step 2:** Add tests covering the new MCP handlers.

**Step 3:** Update the README with config, AI, publish, and MCP usage.

**Step 4:** Run the full TypeScript suite and smoke-test the built MCP server.

### Task 6: Verify the full repo

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/.github/workflows/ci.yml`

**Step 1:** Run `cargo test`.

**Step 2:** Run `cargo clippy --all-targets --all-features -- -D warnings`.

**Step 3:** Run `npm run typecheck`, `npm test`, and `npm run build`.

**Step 4:** Update CI only if the new TypeScript tests or commands need explicit coverage.
