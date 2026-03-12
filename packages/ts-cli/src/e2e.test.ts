import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";

type Captured = {
  stdout: string[];
  stderr: string[];
};

function createLogger(captured: Captured) {
  return {
    stdout: (message: string) => captured.stdout.push(message),
    stderr: (message: string) => captured.stderr.push(message),
  };
}

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-e2e-"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe("CLI end-to-end workflow", () => {
  it("initializes config, generates AI artifacts, and publishes Astro output", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeFile(join(vault, "image.png"), "fake-image", "utf8");
    await writeFile(
      join(vault, "linked-note.md"),
      "---\ntitle: Linked Note\n---\nLinked body\n",
      "utf8",
    );
    await writeFile(
      join(vault, "note.md"),
      [
        "---",
        "title: End To End",
        "ai:",
        "  summary: true",
        "  thread: true",
        "  seo: true",
        "---",
        "Body ![[image.png]] and [[linked-note|Linked]].",
        "",
      ].join("\n"),
      "utf8",
    );

    const logger: Captured = { stdout: [], stderr: [] };

    let exitCode = await runCli(["init", workspace], createLogger(logger));
    expect(exitCode).toBe(0);

    const configPath = join(workspace, "baize.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      profiles: { main: { build_command?: string } };
    };
    delete config.profiles.main.build_command;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: { format?: { name?: string } } };
      const name = body.text?.format?.name;
      if (name === "thread_artifact") {
        return new Response(JSON.stringify({ output_text: JSON.stringify(["Post one", "Post two"]) }));
      }
      if (name === "seo_artifact") {
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              title: "End To End SEO",
              description: "End to end description",
              keywords: ["e2e", "baize"],
            }),
          }),
        );
      }

      return new Response(JSON.stringify({ output_text: "Short end-to-end summary." }));
    });

    exitCode = await runCli(["validate", vault], createLogger(logger));
    expect(exitCode).toBe(0);

    exitCode = await runCli(["ai", vault, "--artifact", "all"], createLogger(logger));
    expect(exitCode).toBe(0);

    exitCode = await runCli(["publish", vault, "--profile", "main"], createLogger(logger));
    expect(exitCode).toBe(0);

    const published = await readFile(
      join(workspace, "site", "src", "content", "blog", "end-to-end.md"),
      "utf8",
    );
    expect(published).toContain("summary: Short end-to-end summary.");
    expect(published).toContain("description: End to end description");
    expect(published).toContain("[Linked](/blog/linked-note)");
    expect(published).toContain("![image.png](/images/posts/end-to-end/image.png)");

    expect(
      await readFile(join(workspace, ".baize", "artifacts", "end-to-end", "summary.md"), "utf8"),
    ).toContain("Short end-to-end summary.");
    expect(
      await readFile(
        join(workspace, "site", "public", "images", "posts", "end-to-end", "image.png"),
        "utf8",
      ),
    ).toBe("fake-image");

    expect(logger.stderr).toEqual([]);
    expect(logger.stdout.join("\n")).toContain("Published 2 note(s)");
  });
});
