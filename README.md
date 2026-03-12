# Baize

Baize is an Obsidian-first publishing tool. The long-term architecture is hybrid:

- Rust for core content scanning, parsing, validation, and other performance-sensitive local processing
- TypeScript for Obsidian UI, orchestration, and publishing adapters

## What exists today

This repo now includes the first hybrid foundation:

- `baize-core`: scans Markdown notes, parses YAML frontmatter, normalizes note metadata, validates duplicate slugs, and builds Astro-ready Markdown output
- `baize-cli`: exposes `scan`, `validate`, and `build` commands on top of the Rust core
- `@baize/ts-cli`: a TypeScript bridge and Node CLI that delegates to the Rust CLI instead of re-implementing parsing logic

## Quick Start

```bash
cargo test
cargo run -p baize-cli -- scan .
cargo run -p baize-cli -- validate .
cargo run -p baize-cli -- build . --out-dir dist/astro

npm install
npm test
npm run scan
npm run validate
npm run build:astro
```

The TypeScript CLI is a thin wrapper over the Rust CLI. It uses the Rust binary when available and falls back to `cargo run -p baize-cli -- ...`.

## Example

Baize expects Markdown notes with optional frontmatter:

```yaml
---
title: AI Music Automation
slug: ai-music-automation
publish:
  profile: main-blog
  targets:
    - astro
tags:
  - ai
  - automation
---
```

## Current Architecture

- Rust owns note scanning, frontmatter parsing, validation, and local build output
- TypeScript owns orchestration, typed integration, and future plugin-facing APIs
- Future Obsidian and adapter layers should call the TypeScript bridge, which in turn calls the Rust core

## Next Steps

- add Astro publish configuration and asset copying
- scaffold the Obsidian plugin package on top of the TypeScript bridge
- replace shell-out integration with a stronger embedding path if the Rust/TS boundary stabilizes
