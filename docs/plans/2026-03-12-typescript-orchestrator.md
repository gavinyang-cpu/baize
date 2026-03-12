# TypeScript Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Node/TypeScript orchestrator that shells out to the Rust CLI and exposes the same scan, validate, and build workflow to future plugin and adapter layers.

**Architecture:** Keep Rust as the source of truth for parsing, scanning, validation, and build output. Add a thin TypeScript package that provides a typed bridge over the Rust CLI's JSON mode and a Node-facing CLI for local development and future Obsidian integration.

**Tech Stack:** Rust, Cargo, Node.js, npm workspaces, TypeScript, Vitest

---

### Task 1: Add Node workspace scaffolding

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/package.json`
- Create: `/Users/gavinyoung/Projects/baize/tsconfig.json`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/package.json`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/tsconfig.json`

**Step 1:** Add the root Node workspace and shared scripts.

**Step 2:** Add the TypeScript package manifest and build/test scripts.

**Step 3:** Install dependencies and verify workspace resolution.

### Task 2: Build the Rust bridge package

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/types.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/rust.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/index.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/rust.test.ts`

**Step 1:** Write tests for JSON command invocation and response parsing.

**Step 2:** Implement a small process wrapper that runs `cargo run -p baize-cli -- ... --json`.

**Step 3:** Export typed `scan`, `validate`, and `build` helpers.

### Task 3: Add a TypeScript CLI

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/cli.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/cli.test.ts`

**Step 1:** Add a Node CLI with `scan`, `validate`, and `build` commands.

**Step 2:** Print human-readable output by default and raw JSON with `--json`.

**Step 3:** Preserve Rust exit semantics for validation failures.

### Task 4: Verify and document

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/README.md`

**Step 1:** Document the hybrid workflow and both Rust and Node entrypoints.

**Step 2:** Run `cargo test`, `npm test`, and a sample TS CLI invocation.

**Step 3:** Confirm the TypeScript layer delegates to Rust instead of duplicating logic.
