# MCP Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Model Context Protocol support to Baize so MCP clients can call Baize's scan, validate, and build capabilities through a stdio server.

**Architecture:** Keep MCP at the TypeScript orchestration layer so the server can reuse the existing Rust-backed bridge instead of duplicating core logic. Expose a small set of MCP tools that map directly to Baize's current capabilities and return both human-readable text and structured data.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, Zod, existing Rust-backed `@baize/ts-cli` bridge

---

### Task 1: Add MCP dependencies and package wiring

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/package.json`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/package.json`

**Step 1:** Add the official MCP TypeScript SDK and any schema dependencies.

**Step 2:** Add build and runtime scripts for the MCP server entrypoint.

**Step 3:** Make sure the package exports or binaries include the MCP server.

### Task 2: Implement the MCP server

**Files:**
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp.ts`
- Create: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp-tools.ts`
- Modify: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/index.ts`
- Test: `/Users/gavinyoung/Projects/baize/packages/ts-cli/src/mcp-tools.test.ts`

**Step 1:** Write tests for the tool handlers that wrap `scan`, `validate`, and `build`.

**Step 2:** Implement MCP tool handlers with typed input schemas and structured outputs.

**Step 3:** Add a stdio MCP server that registers the tools and delegates to the existing bridge.

**Step 4:** Export the MCP helpers needed for tests and future integration.

### Task 3: Document MCP usage

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/README.md`

**Step 1:** Document what the MCP server exposes and how to run it locally.

**Step 2:** Add a config example for connecting the server from an MCP client.

### Task 4: Verify and ship

**Files:**
- Modify: `/Users/gavinyoung/Projects/baize/.github/workflows/ci.yml`

**Step 1:** Run TypeScript and Rust verification after the MCP changes.

**Step 2:** Add MCP package build coverage to CI if needed.

**Step 3:** Commit and push the MCP support.
