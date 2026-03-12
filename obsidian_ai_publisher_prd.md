# Product Requirements Document (PRD)

## Product Name
Obsidian AI Publisher (working name)

## Vision
Enable creators to **write once in their Obsidian vault and publish everywhere** using AI-assisted transformations and platform adapters.

The system acts as a universal publishing layer for Markdown content.

---

# 1. Goals

## Primary Goal
Allow users to:

Write in Obsidian → Enhance with AI → Publish to multiple platforms

## Secondary Goals

- Maintain local-first workflow
- Avoid vendor lock-in
- Support multiple AI providers
- Support self-hosting and cloud hosting
- Enable extensibility through plugins

---

# 2. Target Users

## 1. Indie creators
Bloggers, writers, researchers using Obsidian.

## 2. Developers
Technical writers and OSS maintainers.

## 3. AI builders
People experimenting with AI content workflows.

---

# 3. Core Principles

1. Local-first
2. Markdown as source of truth
3. Bring-your-own AI
4. Self-host friendly
5. Free tier friendly
6. Platform-agnostic publishing (Write once, publish everywhere)

---

# 4. Core Features

## 4.1 Obsidian Plugin
- Publish selected note/folder
- Generate AI summary, thread, SEO metadata
- Multi-platform export
- Plugin commands via palette/context menu

## 4.2 Multi-Platform Publishing
Adapters:
- Astro static site, WordPress, Medium, Substack, Twitter/X, LinkedIn

Pipeline:
Markdown → AI Transformer → Adapter → Publish

## 4.3 AI Content Transformation
- Summarize, rewrite, generate threads, SEO metadata, translate
- Configurable AI providers: OpenAI, Anthropic, DeepSeek, Ollama, OpenRouter

Example config:
```ts
aI: { provider: 'openrouter', model: 'deepseek-chat' }
```

---

# 5. Publishing Adapters

```ts
interface Publisher {
  publish(article: Article): Promise<void>
}
```

Adapters: astro, wordpress, medium, substack, social

---

# 6. Markdown Enhancements

AI blocks:
```
::ai summarize::
::ai thread::
::ai image::
```
Frontmatter:
```
---
title: AI Music Automation
publish:
 - blog
 - twitter
 - newsletter
---
```

---

# 7. System Architecture

Components: Obsidian plugin, CLI, Core engine, Adapters, AI providers
Architecture diagram:
Obsidian Vault → Plugin → AI Processor → Publishing Engine → Adapters → Platforms

---

# 8. Deployment Modes
1. Static blog (Astro)
2. Self-hosted (Docker)
3. Hosted SaaS

---

# 9. CLI Tool
Commands:
publisher init
publisher build
publisher publish
publisher ai

---

# 10. Image Handling
Local filesystem, S3-compatible storage, Cloudflare R2, Supabase storage

---

# 11. GEO Optimization
llms.txt, ai-index.json, structured metadata, semantic tags

---

# 12. Plugin System
Types: AI tools, publishing adapters, SEO, analytics
Hooks: onBuild, onPublish, onAIRequest

---

# 13. MVP Scope
- Obsidian plugin
- Astro adapter
- AI summary & thread generation
- OpenAI / Ollama support
- One-click publish workflow
- Multi-platform adapter interface

---

# 14. Roadmap
Phase 1: MVP (Plugin + Astro + AI transformations + CLI)
Phase 2: Additional adapters (WordPress, Medium, Substack, social)
Phase 3: Automation & SaaS (auto social publishing, analytics, scheduling)

---

# 15. Success Metrics
Plugin installs, articles published, platforms connected, engagement

---

# 16. Risks
API instability, platform restrictions, AI cost, plugin abandonment

---

# 17. Future Opportunities
AI knowledge graph blogs, podcasts, video generation, multi-language publishing, local model hosting

---

# 18. MVP Timeline
Week 1: Core engine
Week 2: Obsidian plugin
Week 3: AI features
Week 4: Publishing adapters

---

# 19. Strategic Insights
1️⃣ One-click publish = viral feature
2️⃣ First platform: Astro
3️⃣ Simplest MVP: Obsidian plugin + AI summary/thread + OpenAI/Ollama support

---

# 20. Competitive Positioning
| Tool | Role |
|-----|-----|
| Obsidian | Writing |
| Astro | Site engine |
| Obsidian AI Publisher | Publishing engine |

---

# 21. GitHub Repo Structure
```
obsidian-ai-publisher/
 ├ src/
 │   ├ cli/
 │   ├ core/
 │   ├ plugins/
 │   │    ├ ai/
 │   │    ├ publishing/
 │   │    ├ seo/
 │   │    └ analytics/
 │   └ adapters/
 │        ├ astro/
 │        ├ wordpress/
 │        └ social/
 ├ obsidian-plugin/
 │   ├ main.ts
 │   ├ commands.ts
 │   ├ ui.ts
 │   └ settings.ts
 ├ tests/
 ├ package.json
 └ README.md
```

# 22. Obsidian Plugin Architecture (TypeScript)
- `main.ts` → plugin entry
- `commands.ts` → command palette handlers
- `ui.ts` → publish menu and notifications
- `settings.ts` → user configuration for AI providers & platforms
- `adapters/` → connect vault content to platforms
- `ai/` → AI provider interface and implementations

