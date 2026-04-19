import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateWithPublishRules } from "./publish.js";

async function createVault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-validate-"));
}

describe("publish-aware validation", () => {
  it("warns on unresolved note links, note anchors, and assets", async () => {
    const vault = await createVault();
    await writeFile(
      join(vault, "note.md"),
      [
        "---",
        "title: Validate Me",
        "---",
        "[[missing-note]]",
        "",
        "[[linked-note#Missing Heading]]",
        "",
        "![[missing-image.png]]",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(vault, "linked-note.md"), "---\ntitle: Linked Note\n---\n## Present Heading\nBody\n", "utf8");

    const result = await validateWithPublishRules(vault);

    expect(result.exitCode).toBe(0);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "warning", message: "could not resolve note link `missing-note`" }),
        expect.objectContaining({
          level: "warning",
          message: "could not resolve note anchor `linked-note#Missing Heading`",
        }),
        expect.objectContaining({ level: "warning", message: "could not find asset `missing-image.png`" }),
      ]),
    );
  });

  it("recursively validates transcluded sibling notes for single-note paths", async () => {
    const vault = await createVault();
    const hostPath = join(vault, "host.md");
    await mkdir(vault, { recursive: true });
    await writeFile(hostPath, "---\ntitle: Host\n---\n![[snippet]]\n", "utf8");
    await writeFile(
      join(vault, "snippet.md"),
      "---\ntitle: Snippet\n---\n[[missing-child]]\n",
      "utf8",
    );

    const result = await validateWithPublishRules(hostPath);

    expect(result.exitCode).toBe(0);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: "transclusion snippet.md: could not resolve note link `missing-child`",
          note: "host.md",
        }),
      ]),
    );
  });
});
