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
- create and load `baize.config.json` publish profiles
- rewrite Obsidian wikilinks and local image embeds for Astro output
- inline basic Obsidian note, heading, and block transclusions and normalize callouts for Astro output
- copy local assets into configured Astro public directories
- generate AI summary, thread, and SEO artifacts with OpenAI or Ollama
- publish through a profile-aware TypeScript CLI or MCP server
- load a desktop-only Obsidian plugin scaffold with publish, validate, and AI commands
- run an end-to-end CLI smoke test that covers `init -> validate -> ai -> publish`

What is not implemented yet:

- remote publishing adapters
- richer Obsidian plugin UX and release packaging
- deeper Obsidian syntax support such as transclusion aliases, partial block semantics, and advanced embed variants

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
  - Node CLI for `init`, `scan`, `validate`, `ai`, `build`, and `publish`
  - profile-aware Astro publishing workflow
  - AI artifact generation and storage
  - MCP stdio server exposing Baize tools to MCP clients
  - future integration point for plugin and adapter code

### Obsidian Plugin

- `@baize/obsidian-plugin`
  - desktop-only plugin scaffold
  - commands for publish current note or folder
  - command to verify workspace, config, profile, and Rust runtime setup
  - commands for validate, summary, thread, SEO, and full artifact generation
  - settings for Baize workspace path and default publish profile

### Obsidian Plugin Setup

The plugin is currently a local scaffold, not a packaged marketplace release.

Build it from the repo root:

```bash
npm run build:plugin
```

That generates `packages/obsidian-plugin/main.js`.

To load it in a local Obsidian vault:

1. Create `.obsidian/plugins/baize-publisher/` inside the vault.
2. Copy `packages/obsidian-plugin/manifest.json` into that folder.
3. Copy `packages/obsidian-plugin/styles.css` into that folder.
4. Copy the generated `packages/obsidian-plugin/main.js` into that folder.
5. Enable `Baize Publisher` in Obsidian community plugins.

Plugin settings:

- `Baize workspace path`
  - set this to the absolute path of the Baize workspace or install root
  - leave it blank only if the current vault root is also the Baize workspace
- `Default publish profile`
  - profile name from `baize.config.json`, usually `main`

Current plugin commands:

- `Check Baize setup`
- `Publish current note`
- `Publish current folder`
- `Validate current note`
- `Generate summary`
- `Generate thread`
- `Generate SEO metadata`
- `Generate all AI artifacts`

## Repository Layout

```text
baize/
  crates/
    baize-core/        # Rust core library
    baize-cli/         # Rust CLI
  packages/
    obsidian-plugin/   # Obsidian plugin scaffold
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

### 3. Create a starter config

```bash
npm run init
```

That writes `baize.config.json` in the repo root. Adjust the Astro paths before running `publish`.

### 4. Verify the project

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
npm run init
npm run scan
npm run validate
npm run ai
npm run build:astro
npm run publish
```

You can also invoke the package-level CLI directly:

```bash
npm run cli -w @baize/ts-cli -- init .
npm run cli -w @baize/ts-cli -- scan .
npm run cli -w @baize/ts-cli -- validate . --json
npm run cli -w @baize/ts-cli -- ai . --artifact all
npm run cli -w @baize/ts-cli -- build . --out-dir dist/astro-ts
npm run cli -w @baize/ts-cli -- build . --profile main
npm run cli -w @baize/ts-cli -- publish . --profile main
```

The TypeScript layer does not re-implement parsing or validation. It shells out to the Rust CLI, prefers the compiled Rust binary when present, and falls back to `cargo run -p baize-cli -- ...` otherwise.

### Profile Config

Baize reads `baize.config.json` from the current project root or an ancestor of the note path.

Example:

```json
{
  "version": 1,
  "default_profile": "main",
  "profiles": {
    "main": {
      "adapter": "astro",
      "content_dir": "./site/src/content/blog",
      "assets_dir": "./site/public/images/posts",
      "asset_url_base": "/images/posts",
      "note_url_base": "/blog",
      "build_command": "npm run build -w site"
    }
  },
  "ai": {
    "default_provider": "openai",
    "artifact_dir": ".baize/artifacts",
    "openai": {
      "model": "gpt-5-mini",
      "api_key_env": "OPENAI_API_KEY"
    },
    "ollama": {
      "model": "llama3.2",
      "base_url": "http://127.0.0.1:11434"
    }
  }
}
```

Notes:

- `build --profile <name>` writes Astro-ready files and copied assets without running the build hook
- `publish --profile <name>` writes files, copies assets, and then runs `build_command` when configured
- AI artifacts are stored under `.baize/artifacts/<slug>/`
- OpenAI requires the env var named by `api_key_env`

## MCP Support

Baize now exposes a stdio MCP server through the TypeScript orchestration layer.

Available MCP tools:

- `baize_init`
- `baize_scan`
- `baize_validate`
- `baize_build`
- `baize_ai`
- `baize_publish`

Each tool delegates to the same Rust-backed bridge and TypeScript publish workflow used by the Node CLI, so MCP clients get the same parsing, validation, AI, and Astro publish behavior as local shell usage.

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

- `baize_init`
  - input: optional `path`, optional `force`
  - output: created config path
- `baize_scan`
  - input: `path`
  - output: root path, note count, and compact note metadata
- `baize_validate`
  - input: `path`
  - output: exit code, issue count, and validation issues
- `baize_build`
  - input: `path`, optional `out_dir`
  - output: output directory, output count, and built file paths
- `baize_ai`
  - input: `path`, optional `artifact`, optional `provider`
  - output: provider, artifact root, and generated artifact paths
- `baize_publish`
  - input: `path`, optional `profile`
  - output: publish status, output directory, warnings, and built file paths

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
- `![[note]]`, `![[note#Heading]]`, and `![[note#^block-id]]` transclusions are inlined when the target note can be resolved locally
- `> [!note]` style callouts are normalized into standard Markdown blockquotes

## Build Output

Baize now has two build paths:

- low-level Rust `build` for normalized Markdown output
- profile-aware TypeScript `build --profile <name>` for Astro-ready output with rewritten links, copied assets, and optional AI artifact frontmatter

For profile-aware Astro output, Baize writes:

- `title`
- `slug`
- `source_path`
- `tags` when present
- `publish_profile`
- `summary`, `thread`, `description`, and `keywords` when AI artifacts exist

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
- TypeScript validation also warns on unresolved note links, unresolved note/transclusion anchors, and missing local assets

Build behavior:

- build stops on validation errors
- build also fails if a note body is empty at render time

## Programmatic TypeScript API

The TypeScript package exports typed wrappers for the Rust engine and publish workflow:

```ts
import {
  buildNotes,
  buildWithProfile,
  createArtifactLoader,
  generateAiArtifacts,
  publishWithProfile,
  scanNotes,
  validateNotes,
} from "@baize/ts-cli";

const scan = await scanNotes(".");
const validation = await validateNotes(".");
const build = await buildNotes(".", "dist/astro-ts");
const ai = await generateAiArtifacts(".");
const publish = await publishWithProfile(".", {
  artifactLoader: await createArtifactLoader({ pathHint: "." }),
});
```

Useful exported types include:

- `ScanReport`
- `ValidationReport`
- `ValidationExecution`
- `BuildReport`
- `NoteDocument`
- `BaizeConfig`
- `AiGenerationExecution`
- `PublishExecution`

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
npm run build:plugin

# End-to-end
npm run init
npm run scan
npm run validate
npm run ai
npm run build:astro
npm run publish
```

Test coverage now includes a CLI end-to-end smoke test in `packages/ts-cli/src/e2e.test.ts`. It verifies a real temporary workspace flow: config init, validation, AI artifact generation, Astro publish output, and asset copying.

## Known Limitations

This is still a foundation release. Right now Baize does not yet:

- support direct publish adapters beyond Astro
- polish the Obsidian plugin beyond a desktop-first scaffold
- handle richer Obsidian syntax such as transclusion aliases, partial block semantics, and advanced embed variants
- expose a native library boundary between Rust and TypeScript
- manage Astro collections or site config beyond path-based publishing

## Project Documents

These files capture the product direction and implementation plans:

- `obsidian_ai_publisher_prd.md`
- `obsidian_ai_publisher_prd_v2.md`
- `obsidian_ai_publisher_prd_Rust.md`
- `docs/plans/2026-03-12-bootstrap-foundation.md`
- `docs/plans/2026-03-12-typescript-orchestrator.md`
- `docs/plans/2026-03-12-core-mvp-publishing.md`

## Roadmap

Near-term priorities:

1. Polish the Obsidian plugin workflow with richer status UI and safer setup checks.
2. Add deeper Obsidian syntax support and stronger validation around transclusion aliases, anchors, links, and assets.
3. Decide whether to keep shell-out orchestration or move to a tighter Rust/TS integration boundary.

## License

The workspace is currently configured with MIT license metadata.
