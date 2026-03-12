# Baize: Rust + TypeScript Hybrid Architecture

Baize can leverage Rust for performance-critical processing while using TypeScript for plugin, CLI, and platform adapter orchestration.

---

## 1. Overall Architecture

```mermaid
flowchart TD
    A[Obsidian Vault] --> B[Baize Plugin (TS/JS)]
    B --> C[CLI Orchestrator (TS/JS)]
    C --> D[Rust Core / WASM Modules]
    D --> E[AI Processor / Transformer]
    E --> F[Publishing Engine / Adapters]
    F --> G{Platforms}
    G --> H[Astro Blog]
    G --> I[WordPress]
    G --> J[Substack]
    G --> K[Twitter/X]
```

**Key Points:**

- **TS/JS:** Obsidian plugin UI, CLI orchestration, platform adapters, settings/config parsing
- **Rust:** Vault scanning, AI block detection, Markdown transformation, vector embeddings, local search
- **WASM:** Optional in-plugin AI preprocessing

---

## 2. CLI Workflow

```mermaid
flowchart TD
    A[User executes CLI command] --> B[TS CLI orchestrator]
    B --> C{Task Type}
    C -->|AI Transform| D[Rust processing engine]
    C -->|Publish| E[Adapters (TS/JS)]
    D --> E
```

- Rust handles CPU-intensive tasks.
- TS orchestrates adapters and user-facing output.

---

## 3. Rust Module Details

### a) Vault Scanner
- Recursively scan vault
- Detect `::ai::*::` blocks
- Generate processing queue

### b) Markdown Transformer
- Processes AI directives
- Summarizes, rewrites, generates threads
- Outputs multiple formats (blog Markdown, threads, newsletter content)

### c) Vector Embedding / Local Search
- Optional RAG workflow
- Interfaces with vector DBs like Qdrant
- Efficient embedding processing
- Exposes API via CLI or WASM

---

## 4. TypeScript / JS Responsibilities

- **Obsidian Plugin:** Commands, UI, notifications, settings
- **CLI Orchestrator:** Accepts commands (`init`, `build`, `publish`, `ai`), delegates to Rust, handles file I/O
- **Platform Adapters:** Astro, WordPress, Substack, social media publishing

---

## 5. Rust + WASM Option

- Compile Rust modules to WebAssembly
- Run AI preprocessing inside Obsidian plugin
- Example:

```ts
import { processMarkdown } from './baize_wasm_bg.wasm';
const output = processMarkdown(noteContent);
```

---

## 6. File/Module Structure

```
baize/
 ├ src/
 │   ├ cli/
 │   ├ core/
 │   ├ plugins/
 │   │    ├ ai/
 │   │    ├ publishing/
 │   │    └ seo/
 │   ├ adapters/
 │   └ ai/
 ├ rust_core/
 │   ├ vault_scanner/
 │   ├ markdown_transformer/
 │   ├ embeddings/
 │   └ wasm_modules/
 ├ obsidian-plugin/
 ├ tests/
 ├ package.json
 └ Cargo.toml
```

---

## 7. Benefits of Hybrid Approach

| Feature | Rust | TypeScript/JS |
|---------|------|---------------|
| CLI performance | ✅ Fast, single binary | ✅ Orchestrates tasks |
| Vault scanning & parsing | ✅ Memory-safe, efficient | ❌ Slower |
| AI block transformations | ✅ Parallel processing | ❌ Less performant |
| Vector search / embeddings | ✅ Efficient | ❌ Less optimized |
| Obsidian integration | ❌ WASM optional | ✅ Native plugin UI & commands |
| Platform adapters | ❌ | ✅ Easy to maintain |

---

This architecture keeps performance-critical tasks in Rust while maintaining UI, orchestration, and platform flexibility in TypeScript. It ensures **local-first, cross-platform, and scalable** design for Baize.

