# Product Requirements Document (PRD v2)

## Product Name
Obsidian AI Publisher

## Status
Draft v2

## Date
2026-03-12

## Summary
Obsidian AI Publisher lets creators write in Obsidian, optionally generate AI-assisted publishing artifacts, and publish to owned channels through a local-first workflow.

The MVP focuses on one reliable path:

Obsidian note -> optional AI transforms -> Astro-compatible output -> local publish result

This keeps the first release narrow, useful, and extensible without committing the team to every publishing surface on day one.

---

# 1. Problem Statement

Creators increasingly use Obsidian as their writing environment, but publishing remains fragmented:

- Markdown often needs manual cleanup before publishing
- AI-assisted repurposing happens in separate tools
- Each platform requires a different workflow
- Media and links break when moved out of the vault
- Existing solutions often require vendor lock-in or hosted storage

The product should make Obsidian the source of truth while reducing the effort required to publish polished content.

---

# 2. Product Goal

## Primary Goal
Allow a user to select an Obsidian note or folder and publish it through a repeatable, local-first pipeline with optional AI assistance.

## Secondary Goals
- Keep Markdown as the source of truth
- Support bring-your-own AI provider
- Keep the core engine reusable outside Obsidian
- Make future publishing adapters easy to add
- Preserve self-hosting as a first-class option

## Non-Goals for MVP
- Direct publishing to Medium, Substack, WordPress, LinkedIn, or X
- Team collaboration features
- SaaS account system or hosted vault syncing
- Scheduling, analytics, or social automation
- Support for every Obsidian plugin or Markdown extension
- Fully autonomous rewriting without user review

---

# 3. Target Users

## 1. Indie creators
Writers, bloggers, and researchers who already draft in Obsidian and want a simpler path to publish.

## 2. Developer-publishers
Technical writers and OSS maintainers who publish Markdown to static sites and care about portability.

## 3. AI workflow builders
Users experimenting with prompt-driven content generation who want AI outputs tied to their source notes.

---

# 4. Product Principles

1. Local-first by default
2. Markdown is the source of truth
3. AI is optional, not required
4. Publish to owned channels first
5. Clear contracts over hidden magic
6. Extensibility without premature complexity

---

# 5. MVP Definition

## In Scope
- Obsidian plugin
- Shared core engine
- CLI
- Astro publishing adapter
- OpenAI and Ollama provider support
- AI summary generation
- AI thread generation
- SEO metadata generation
- Local image asset handling
- One-click publish from the Obsidian UI

## Out of Scope
- Additional direct publishing adapters
- Cloud-hosted control plane
- User accounts and billing
- Plugin marketplace for third parties
- Analytics dashboards
- Translation workflows
- GEO/AI indexing extras such as `llms.txt` and `ai-index.json`

## MVP Definition of Done
The MVP is complete when a user can:

1. Configure the plugin and CLI for an Astro site.
2. Select a note in Obsidian.
3. Optionally generate AI summary, thread, and SEO metadata.
4. Publish that content to a configured Astro target with local assets rewritten correctly.
5. Receive a deterministic success or failure result with warnings and output path.

---

# 6. Primary User Journey

1. User installs the Obsidian plugin and CLI.
2. User configures a publish profile that points to an Astro content directory.
3. User selects a note or folder.
4. User optionally runs AI transformations.
5. System validates frontmatter, links, assets, and adapter requirements.
6. System renders a normalized `Article` object.
7. Astro adapter writes the output file and assets.
8. User receives a publish result with file path, warnings, and optional preview/build hook result.

---

# 7. Functional Requirements

## 7.1 Obsidian Plugin

The plugin must:

- Add commands for `Publish current note`, `Publish selected folder`, `Generate summary`, `Generate thread`, and `Validate publish`.
- Provide a settings UI for publish profiles, AI provider selection, and default behavior.
- Show progress and warnings for long-running operations.
- Allow the user to review generated artifacts before publishing.
- Reuse the shared core engine instead of duplicating publishing logic in the plugin layer.

The plugin should not:

- Store raw secrets in note frontmatter
- Depend on a hosted backend in the MVP
- Mutate source notes during publish unless the user explicitly chooses write-back

## 7.2 CLI

The CLI must expose:

```bash
publisher init
publisher validate <path>
publisher ai <path> --artifact summary|thread|seo
publisher build <path>
publisher publish <path> --profile <name>
```

The CLI should:

- Share config and transformation behavior with the plugin
- Support note or folder paths
- Return non-zero exit codes on validation or publish failure
- Print machine-readable JSON with `--json`

## 7.3 Content Source Model

Markdown files in the Obsidian vault remain the source of truth.

The system must support in MVP:

- YAML frontmatter
- Standard Markdown
- Obsidian wikilinks to other notes
- Local image embeds such as `![[image.png]]`
- Folder-level publishing by processing each note independently

The system will not support in MVP:

- Transclusions such as `![[Note#Section]]`
- Dataview-generated content
- Canvas or Excalidraw documents
- Arbitrary plugin-rendered syntax
- Folder inheritance beyond global defaults

Unsupported syntax should create warnings during validation. It should not silently disappear.

## 7.4 Frontmatter Schema

Recommended frontmatter for MVP:

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
seo:
  description: How to automate AI music workflows with local-first tools.
tags:
  - ai
  - automation
---
```

Rules:

- `title` defaults to the note filename when omitted.
- `slug` is generated from `title` when omitted.
- `publish.profile` selects a configured publish profile.
- `publish.targets` is retained for future multi-adapter support, but Astro is the only valid direct target in MVP.
- Frontmatter is per-note; there is no folder-level override file in MVP.

## 7.5 Configuration Precedence

When multiple sources define the same setting, precedence is:

1. CLI flag or explicit plugin action option
2. Note frontmatter
3. Publish profile configuration
4. Global plugin or CLI defaults

This precedence order must be documented and consistent across the product.

## 7.6 AI Transformations

MVP transformations:

- Summary
- Thread
- SEO metadata

Behavior:

- AI is opt-in per command or via frontmatter/profile defaults.
- AI output is cached by note content hash plus transform type.
- AI output is stored as generated artifacts, not written back into the source note by default.
- A separate explicit command may insert generated output into the note.
- Publish should continue if AI fails, unless the selected profile marks a transform as required.

Provider scope for MVP:

- OpenAI
- Ollama

All other providers are post-MVP.

## 7.7 Publishing Adapters

The core engine must define a stable adapter contract so future platforms can be added without changing the plugin UX.

Only the Astro adapter publishes directly in MVP.

Astro adapter responsibilities:

- Convert normalized article output into a configured Astro content format
- Copy referenced assets into a deterministic target directory
- Rewrite internal asset paths
- Return a result containing status, warnings, and output path

Direct remote API publishing is not part of the Astro MVP path.

## 7.8 Images and Assets

MVP asset support includes:

- Local images referenced from the note
- Copying assets into a publish directory scoped to the article slug
- Rewriting Markdown references to the published asset path

Remote object storage support for S3, R2, or Supabase is post-MVP.

## 7.9 Validation

Before build or publish, the system must validate:

- Required frontmatter fields
- Duplicate slugs within the current publish set
- Missing local assets
- Unsupported Obsidian syntax
- Broken note links within the publish set
- Missing adapter configuration

Validation should produce warnings and errors separately.

---

# 8. Core Contracts

## 8.1 Normalized Article Model

```ts
interface Article {
  id: string
  title: string
  slug: string
  body: string
  excerpt?: string
  tags: string[]
  metadata: Record<string, unknown>
  assets: Asset[]
  ai: {
    summary?: string
    thread?: string[]
    seo?: {
      title?: string
      description?: string
      keywords?: string[]
    }
  }
  source: {
    vaultPath: string
    notePath: string
    lastModified: string
  }
}

interface Asset {
  sourcePath: string
  outputPath: string
  mimeType?: string
}
```

## 8.2 Adapter Contract

```ts
interface PublishOptions {
  profile: string
  mode?: 'draft' | 'publish'
}

interface PublishResult {
  adapter: string
  profile: string
  mode: 'draft' | 'publish'
  status: 'success' | 'warning' | 'failed'
  outputPath?: string
  previewUrl?: string
  externalId?: string
  warnings: string[]
  errors: string[]
}

interface Publisher {
  publish(article: Article, options: PublishOptions): Promise<PublishResult>
}
```

Requirements:

- `publish()` must be idempotent for the same `slug` and profile.
- A successful publish must return where the output went.
- Partial failures must be surfaced as warnings or errors, not swallowed.

---

# 9. Architecture

## 9.1 High-Level Architecture

```text
Obsidian Plugin / CLI
        |
        v
   Core Engine
   - Parser
   - Validator
   - AI Transformer
   - Asset Pipeline
   - Adapter Registry
        |
        v
   Astro Adapter
        |
        v
Configured Astro Content Directory
```

## 9.2 Architectural Decisions

### ADR-001: Shared Core Engine
Use a single shared TypeScript core engine for parsing, validation, AI transforms, and adapter execution.

Why:

- Keeps plugin and CLI behavior consistent
- Reduces duplicated logic
- Makes future adapters easier to add

### ADR-002: Astro-Only Direct Publishing in MVP
Ship only one direct publishing adapter in MVP: Astro.

Why:

- Reduces surface area
- Keeps delivery risk manageable
- Proves the end-to-end workflow before adding more platforms

### ADR-003: Artifact-First AI Output
Store AI outputs as generated artifacts by default rather than mutating the note automatically.

Why:

- Preserves Markdown as source of truth
- Avoids unwanted AI edits in source notes
- Supports re-generation and review before publish

### ADR-004: Local Execution First
All core publishing behavior runs locally in the plugin or CLI for MVP.

Why:

- Aligns with the local-first principle
- Avoids backend complexity
- Keeps user content under user control

---

# 10. Deployment Modes

## MVP
- Local Obsidian plugin
- Local CLI
- Local or self-managed Astro target

## Post-MVP
- Dockerized self-hosted service for automation use cases
- Hosted SaaS control plane for managed workflows

The PRD intentionally separates MVP from future deployment modes so hosting ambitions do not expand the first release.

---

# 11. Security and Privacy

Requirements:

- Source notes remain local unless the user explicitly invokes an external AI provider.
- Secrets must not be stored in frontmatter.
- Provider credentials should be referenced through environment variables in MVP.
- Logs must avoid printing source content unless debug mode is explicitly enabled.
- Published outputs may contain generated AI text, but raw prompts and provider responses should remain local.

Open implementation note:

- If secure OS keychain storage is added later, it should complement rather than replace environment-variable support.

---

# 12. Non-Functional Requirements

## Performance
- Validate a single note in under 2 seconds, excluding AI calls
- Publish a single note to Astro in under 5 seconds, excluding site build hooks and AI calls
- Show progress for folder publishes over 10 notes

## Reliability
- Publish operations must be resumable by rerunning the same command
- Failed notes in a folder publish must not block successful notes from being processed
- The system must separate validation errors from adapter failures

## Security
- No raw secrets in source notes
- No hosted dependency required for the core MVP flow
- TLS must be used for external AI provider calls

## Maintainability
- Plugin and CLI must use the same shared contracts
- Adapters must be isolated behind the `Publisher` interface
- Unsupported syntax handling must be covered by tests

## Observability
- Structured logs in CLI mode
- Human-readable warnings in plugin mode
- Publish result stored locally for the latest run

---

# 13. Success Metrics

## Product Metrics
- Time to first successful publish
- Number of weekly successful publish runs
- Number of configured Astro profiles
- Percentage of publishes using optional AI artifacts

## Quality Metrics
- Publish success rate for valid notes
- Validation false-positive rate
- Number of support issues caused by broken links or assets

Telemetry, if added, must be opt-in.

---

# 14. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Obsidian Markdown edge cases are broader than expected | Publish output breaks | Start with a strict supported-syntax matrix and warn on unsupported input |
| AI cost or rate limits degrade UX | Slow or failed transforms | Make AI optional, cache outputs, and support Ollama for local inference |
| Adapter contract is too narrow | Future platforms require rework | Define normalized `Article` and `PublishResult` now |
| Scope expands into a full SaaS too early | MVP slips | Treat hosted deployment as post-MVP only |
| Asset rewriting is inconsistent | Broken images in published output | Centralize asset handling in the core engine |

---

# 15. Roadmap

## Phase 1: MVP
- Shared core engine
- Obsidian plugin
- CLI
- Astro adapter
- OpenAI and Ollama support
- Summary, thread, and SEO artifact generation

## Phase 1.1
- Better validation and preview UX
- Optional build hooks for Astro sites
- Improved write-back workflow for approved AI artifacts

## Phase 2
- WordPress, Medium, Substack, and social adapters
- Additional AI providers
- Remote asset storage

## Phase 3
- Scheduling
- Analytics
- Docker automation workflows
- Hosted SaaS control plane

---

# 16. Initial Repository Structure

```text
obsidian-ai-publisher/
  src/
    cli/
    core/
      parser/
      validator/
      ai/
      assets/
      adapters/
    adapters/
      astro/
    types/
  obsidian-plugin/
    main.ts
    commands.ts
    ui.ts
    settings.ts
  tests/
  package.json
  README.md
```

---

# 17. Clarifications Still Needed

These are the remaining decisions worth confirming with stakeholders:

1. Should post-MVP non-Astro platforms support direct publish, draft export, or both?
2. Should unsupported Obsidian syntax fail the publish or only warn and skip?
3. Should approved AI artifacts be inserted back into the note automatically after publish, or only on explicit command?
4. Will the Astro target always be a local folder, or should MVP also support writing to a second local repo plus running a build hook?

Everything else in this v2 is written as a proposed default to reduce ambiguity and keep implementation moving.
