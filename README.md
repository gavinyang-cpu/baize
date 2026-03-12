# Baize

Baize is an Obsidian-first publishing tool for local Markdown workflows.

The project is intentionally hybrid:

- Rust owns the content engine: scanning, parsing, validation, slug generation, and local build output.
- TypeScript owns orchestration: typed wrappers, Node-facing CLI flows, and the future bridge into the Obsidian plugin and publishing adapters.

## Status

Baize is in bootstrap stage.

What already works:

- scan a Markdown note or directory
- parse YAML frontmatter
- normalize notes into a structured model
- validate duplicate slugs and note-level warnings
- build Astro-ready Markdown files into a local output directory
- call the Rust engine directly or through a TypeScript wrapper

What is not implemented yet:

- asset copying and image rewriting
- Astro publish profiles and site-specific config
- remote publishing adapters
- Obsidian plugin package
- AI transformations at runtime

## Why This Architecture

Baize is being built around a simple split:

- Rust for correctness, speed, and a reusable local core
- TypeScript for better integration with Obsidian, Node tooling, and future platform adapters

That keeps the parsing and validation logic in one place while still making the project easy to integrate into plugin and web-facing layers later.

## Current Components

### Rust

- `baize-core`
  - scans Markdown files
  - parses YAML frontmatter
  - generates fallback titles and slugs
  - validates duplicate slugs
  - emits normalized build output
- `baize-cli`
  - `scan`
  - `validate`
  - `build`

### TypeScript

- `@baize/ts-cli`
  - typed wrapper around the Rust CLI JSON interface
  - Node CLI with the same `scan`, `validate`, and `build` flows
  - MCP stdio server exposing Baize tools to MCP clients
  - future integration point for plugin and adapter code

## Repository Layout

```text
baize/
  crates/
    baize-core/        # Rust core library
    baize-cli/         # Rust CLI
  packages/
    ts-cli/            # TypeScript wrapper + Node CLI
  docs/plans/          # implementation plans
  obsidian_ai_publisher_prd.md
  obsidian_ai_publisher_prd_v2.md
  obsidian_ai_publisher_prd_Rust.md
```

## Requirements

- Rust stable toolchain
- Cargo
- Node.js 24+
- npm 11+

If Rust is not installed:

```bash
curl https://sh.rustup.rs -sSf | sh
```

## Quick Start

### 1. Clone

```bash
git clone https://github.com/gavinyang-cpu/baize.git
cd baize
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Verify the project

```bash
cargo test
cargo clippy --all-targets --all-features -- -D warnings

npm run typecheck
npm test
npm run build
```

## Using The Rust CLI

Help output:

```bash
cargo run -p baize-cli -- --help
```

Commands:

```bash
cargo run -p baize-cli -- scan .
cargo run -p baize-cli -- validate .
cargo run -p baize-cli -- validate . --json
cargo run -p baize-cli -- build . --out-dir dist/astro
```

Command behavior:

- `scan <path>` prints discovered notes and generated slugs
- `validate <path>` prints warnings and errors
- `validate <path>` exits with `2` when validation errors exist
- `build <path> --out-dir <dir>` writes normalized Markdown output for each valid note

Notes on scanning:

- directory scans recurse through Markdown files only
- `.git`, `node_modules`, `target`, and `dist` are skipped
- supported extensions are `.md` and `.markdown`

## Using The TypeScript CLI

Baize also exposes the same flows through TypeScript:

```bash
npm run scan
npm run validate
npm run build:astro
```

You can also invoke the package-level CLI directly:

```bash
npm run cli -w @baize/ts-cli -- scan .
npm run cli -w @baize/ts-cli -- validate . --json
npm run cli -w @baize/ts-cli -- build . --out-dir dist/astro-ts
```

The TypeScript layer does not re-implement parsing or validation. It shells out to the Rust CLI, prefers the compiled Rust binary when present, and falls back to `cargo run -p baize-cli -- ...` otherwise.

## MCP Support

Baize now exposes a stdio MCP server through the TypeScript orchestration layer.

Available MCP tools:

- `baize_scan`
- `baize_validate`
- `baize_build`

Each tool delegates to the same Rust-backed bridge used by the Node CLI, so MCP clients get the same parsing, validation, and build behavior as local shell usage.

### Run the MCP server locally

From the repo root:

```bash
npm run mcp
```

That starts a stdio MCP server intended to be launched by an MCP client, not used interactively in a normal terminal.

### Example MCP client configuration

```json
{
  "mcpServers": {
    "baize": {
      "command": "npm",
      "args": ["run", "mcp", "-w", "@baize/ts-cli"],
      "cwd": "/absolute/path/to/baize"
    }
  }
}
```

If you prefer using the built artifact directly, build first and point the client at `packages/ts-cli/dist/mcp.js`.

### MCP tool behavior

- `baize_scan`
  - input: `path`
  - output: root path, note count, and compact note metadata
- `baize_validate`
  - input: `path`
  - output: exit code, issue count, and validation issues
- `baize_build`
  - input: `path`, optional `out_dir`
  - output: output directory, output count, and built file paths

The MCP responses are intentionally compact and do not dump full note bodies into the model context by default.

## Markdown and Frontmatter

Baize currently supports plain Markdown files with optional YAML frontmatter.

Example:

```yaml
---
title: AI Music Automation
slug: ai-music-automation
publish:
  profile: main-blog
  targets:
    - astro
ai:
  summary: true
  thread: true
  seo: true
tags:
  - ai
  - automation
---

Write the note body here.
```

Current frontmatter fields recognized by the parser:

- `title`
- `slug`
- `publish.profile`
- `publish.targets`
- `ai.summary`
- `ai.thread`
- `ai.seo`
- `tags`

Current parser behavior:

- if `title` is missing, Baize uses the filename
- if `slug` is missing, Baize generates one from the title
- if the body is empty, the note gets a warning
- if `publish.targets` is set and does not contain `astro`, the note gets a warning
- unknown frontmatter keys are preserved in the parsed model

## Build Output

The current build step produces normalized Markdown files with generated frontmatter.

For each source note, Baize writes:

- `title`
- `slug`
- `source_path`
- `tags` when present

Example output shape:

```yaml
---
title: AI Music Automation
slug: ai-music-automation
source_path: notes/ai-music-automation.md
tags:
  - ai
  - automation
---

Write the note body here.
```

## Validation Rules

Current validation is intentionally small but strict:

- duplicate slugs are errors
- parser-emitted note warnings are surfaced in validation output

Build behavior:

- build stops on validation errors
- build also fails if a note body is empty at render time

## Programmatic TypeScript API

The TypeScript package exports typed wrappers for the Rust engine:

```ts
import { scanNotes, validateNotes, buildNotes } from "@baize/ts-cli";

const scan = await scanNotes(".");
const validation = await validateNotes(".");
const build = await buildNotes(".", "dist/astro-ts");
```

Useful exported types include:

- `ScanReport`
- `ValidationReport`
- `ValidationExecution`
- `BuildReport`
- `NoteDocument`

## Development Workflow

Common local commands:

```bash
# Rust
cargo fmt
cargo test
cargo clippy --all-targets --all-features -- -D warnings

# TypeScript
npm run typecheck
npm test
npm run build

# End-to-end
npm run scan
npm run validate
npm run build:astro
```

## Known Limitations

This is still a foundation release. Right now Baize does not yet:

- parse Obsidian-specific embeds or wikilinks into publish-ready output
- copy assets during build
- manage Astro collections or site config
- expose a native library boundary between Rust and TypeScript
- include a plugin UI or publish adapters beyond local Markdown output

## Project Documents

These files capture the product direction and implementation plans:

- `obsidian_ai_publisher_prd.md`
- `obsidian_ai_publisher_prd_v2.md`
- `obsidian_ai_publisher_prd_Rust.md`
- `docs/plans/2026-03-12-bootstrap-foundation.md`
- `docs/plans/2026-03-12-typescript-orchestrator.md`

## Roadmap

Near-term priorities:

1. Add Astro-specific publish configuration and asset handling.
2. Scaffold the Obsidian plugin package on top of the TypeScript bridge.
3. Decide whether to keep shell-out orchestration or move to a tighter Rust/TS integration boundary.

## License

The workspace is currently configured with MIT license metadata.
