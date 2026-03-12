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
