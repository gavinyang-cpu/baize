import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildWithProfile, publishWithProfile } from "./publish.js";
import type { BaizeConfig } from "./types.js";

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-publish-"));
}

async function writeConfig(workspace: string, overrides: Partial<BaizeConfig> = {}): Promise<void> {
  const config: BaizeConfig = {
    version: 1,
    default_profile: "main",
    profiles: {
      main: {
        adapter: "astro",
        content_dir: "./site/src/content/blog",
        assets_dir: "./site/public/images/posts",
        asset_url_base: "/images/posts",
        note_url_base: "/writing",
      },
    },
    ...overrides,
  };

  await writeFile(join(workspace, "baize.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

describe("publish pipeline", () => {
  it("rewrites wikilinks and copies local assets for Astro builds", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(
      join(vault, "note.md"),
      "---\ntitle: Main Note\n---\nBody ![[image.png]] and [[linked-note|Linked]]\n",
      "utf8",
    );
    await writeFile(join(vault, "linked-note.md"), "---\ntitle: Linked Note\n---\nOther body\n", "utf8");
    await writeFile(join(vault, "image.png"), "fake image", "utf8");

    const result = await buildWithProfile(vault, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.outputs).toHaveLength(2);

    const noteOutput = await readFile(
      join(workspace, "site", "src", "content", "blog", "main-note.md"),
      "utf8",
    );
    expect(noteOutput).toContain("![image.png](/images/posts/main-note/image.png)");
    expect(noteOutput).toContain("[Linked](/writing/linked-note)");

    const copiedAsset = await readFile(
      join(workspace, "site", "public", "images", "posts", "main-note", "image.png"),
      "utf8",
    );
    expect(copiedAsset).toBe("fake image");
  });

  it("resolves sibling wikilinks during single-note publish", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    const notePath = join(vault, "note.md");
    await writeFile(
      notePath,
      "---\ntitle: Main Note\n---\nBody with [[linked-note|Linked]]\n",
      "utf8",
    );
    await writeFile(join(vault, "linked-note.md"), "---\ntitle: Linked Note\n---\nOther body\n", "utf8");

    const result = await publishWithProfile(notePath, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.outputs).toHaveLength(1);
    expect(result.warnings).toEqual([]);

    const noteOutput = await readFile(
      join(workspace, "site", "src", "content", "blog", "main-note.md"),
      "utf8",
    );
    expect(noteOutput).toContain("[Linked](/writing/linked-note)");
  });

  it("inlines sibling note transclusions during single-note publish", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    const notePath = join(vault, "note.md");
    await writeFile(
      notePath,
      "---\ntitle: Main Note\n---\nIntro before\n\n![[snippet]]\n",
      "utf8",
    );
    await writeFile(
      join(vault, "snippet.md"),
      "---\ntitle: Snippet\n---\n## Snippet Heading\nBody with [[linked-note|Reference]] and ![[image.png]]\n",
      "utf8",
    );
    await writeFile(join(vault, "linked-note.md"), "---\ntitle: Linked Note\n---\nOther body\n", "utf8");
    await writeFile(join(vault, "image.png"), "fake image", "utf8");

    const result = await publishWithProfile(notePath, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.outputs).toHaveLength(1);
    expect(result.warnings).toEqual([]);

    const noteOutput = await readFile(
      join(workspace, "site", "src", "content", "blog", "main-note.md"),
      "utf8",
    );
    expect(noteOutput).toContain("Intro before");
    expect(noteOutput).toContain("## Snippet Heading");
    expect(noteOutput).toContain("[Reference](/writing/linked-note)");
    expect(noteOutput).toContain("![image.png](/images/posts/main-note/image.png)");
    expect(noteOutput).not.toContain("![[snippet]]");

    const copiedAsset = await readFile(
      join(workspace, "site", "public", "images", "posts", "main-note", "image.png"),
      "utf8",
    );
    expect(copiedAsset).toBe("fake image");
  });

  it("normalizes Obsidian callouts into standard Markdown blockquotes", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(
      join(vault, "callout.md"),
      "---\ntitle: Callout Note\n---\n> [!tip] Publishing Tip\n> Keep the vault local.\n",
      "utf8",
    );

    const result = await buildWithProfile(vault, { cwd: workspace });

    expect(result.status).toBe("success");

    const output = await readFile(
      join(workspace, "site", "src", "content", "blog", "callout-note.md"),
      "utf8",
    );
    expect(output).toContain("> **Tip:** Publishing Tip");
    expect(output).toContain("> Keep the vault local.");
    expect(output).not.toContain("[!tip]");
  });

  it("transcludes only the requested heading section", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    const notePath = join(vault, "host.md");
    await writeFile(
      notePath,
      "---\ntitle: Host\n---\nBefore section\n\n![[source#Details]]\n\nAfter section\n",
      "utf8",
    );
    await writeFile(
      join(vault, "source.md"),
      [
        "---",
        "title: Source",
        "---",
        "# Intro",
        "Intro body",
        "",
        "## Details",
        "Body with [[linked-note|Reference]].",
        "",
        "### Nested",
        "Nested body",
        "",
        "## Later",
        "Do not include this.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(vault, "linked-note.md"), "---\ntitle: Linked Note\n---\nOther body\n", "utf8");

    const result = await publishWithProfile(notePath, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.warnings).toEqual([]);

    const output = await readFile(
      join(workspace, "site", "src", "content", "blog", "host.md"),
      "utf8",
    );
    expect(output).toContain("Before section");
    expect(output).toContain("## Details");
    expect(output).toContain("### Nested");
    expect(output).toContain("[Reference](/writing/linked-note)");
    expect(output).not.toContain("## Later");
    expect(output).not.toContain("Do not include this.");
    expect(output).not.toContain("![[source#Details]]");
  });

  it("preserves aliases on heading transclusions as Markdown labels", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    const notePath = join(vault, "host.md");
    await writeFile(
      notePath,
      "---\ntitle: Host\n---\n![[source#Details|Featured Details]]\n",
      "utf8",
    );
    await writeFile(
      join(vault, "source.md"),
      [
        "---",
        "title: Source",
        "---",
        "## Details",
        "Aliased body.",
        "",
        "## Later",
        "Do not include this.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await publishWithProfile(notePath, { cwd: workspace });

    expect(result.status).toBe("success");

    const output = await readFile(
      join(workspace, "site", "src", "content", "blog", "host.md"),
      "utf8",
    );
    expect(output).toContain("**Featured Details**");
    expect(output).toContain("## Details");
    expect(output).toContain("Aliased body.");
    expect(output).not.toContain("Do not include this.");
    expect(output).not.toContain("![[source#Details|Featured Details]]");
  });

  it("transcludes only the requested block reference", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    const notePath = join(vault, "host.md");
    await writeFile(
      notePath,
      "---\ntitle: Host\n---\n![[source#^quote-block]]\n",
      "utf8",
    );
    await writeFile(
      join(vault, "source.md"),
      [
        "---",
        "title: Source",
        "---",
        "Before block",
        "",
        "> Quoted line one",
        "> Quoted line two",
        "^quote-block",
        "",
        "After block",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await publishWithProfile(notePath, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.warnings).toEqual([]);

    const output = await readFile(
      join(workspace, "site", "src", "content", "blog", "host.md"),
      "utf8",
    );
    expect(output).toContain("> Quoted line one");
    expect(output).toContain("> Quoted line two");
    expect(output).not.toContain("^quote-block");
    expect(output).not.toContain("Before block");
    expect(output).not.toContain("After block");
  });

  it("runs the configured build hook during publish", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace, {
      profiles: {
        main: {
          adapter: "astro",
          content_dir: "./site/src/content/blog",
          assets_dir: "./site/public/images/posts",
          asset_url_base: "/images/posts",
          note_url_base: "/writing",
          build_command: "node -e \"process.stdout.write('astro hook ok')\"",
        },
      },
    });
    await writeFile(join(vault, "publish.md"), "---\ntitle: Publish Me\n---\nBody\n", "utf8");

    const result = await publishWithProfile(vault, { cwd: workspace });

    expect(result.status).toBe("success");
    expect(result.hook_output).toContain("astro hook ok");
  });

  it("includes generated artifacts in Astro frontmatter when available", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(join(vault, "artifact-note.md"), "---\ntitle: Artifact Note\n---\nBody\n", "utf8");

    const result = await buildWithProfile(vault, {
      cwd: workspace,
      artifactLoader: async () => ({
        summary: "Artifact summary",
        seo: {
          description: "Artifact description",
          keywords: ["artifact"],
        },
      }),
    });

    expect(result.status).toBe("success");
    const output = await readFile(
      join(workspace, "site", "src", "content", "blog", "artifact-note.md"),
      "utf8",
    );
    expect(output).toContain("summary: Artifact summary");
    expect(output).toContain("description: Artifact description");
    expect(output).toContain("keywords:");
  });

  it("preserves nested extra frontmatter values", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(
      join(vault, "meta.md"),
      "---\ntitle: Meta Note\nauthor:\n  name: Gavin\nrelated:\n  - rust\n  - ts\n---\nBody\n",
      "utf8",
    );

    await buildWithProfile(vault, { cwd: workspace });

    const output = await readFile(join(workspace, "site", "src", "content", "blog", "meta-note.md"), "utf8");
    expect(output).toContain("author:");
    expect(output).toContain("name: Gavin");
    expect(output).toContain("related:");
    expect(output).toContain("- rust");
  });

  it("returns failed status when validation errors block publishing", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeConfig(workspace);
    await writeFile(join(vault, "one.md"), "---\nslug: same\n---\nOne\n", "utf8");
    await writeFile(join(vault, "two.md"), "---\nslug: same\n---\nTwo\n", "utf8");

    const result = await publishWithProfile(vault, { cwd: workspace });

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("duplicate slug `same`");
  });
});
