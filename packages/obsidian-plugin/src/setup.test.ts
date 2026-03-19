import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createDefaultConfig } from "../../ts-cli/src/config.js";
import {
  checkBaizeSetup,
  formatPublishNotice,
  formatValidationNotice,
} from "./setup.js";

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "baize-plugin-"));
  await writeFile(join(workspace, "Cargo.toml"), "[workspace]\nmembers = []\n", "utf8");
  await writeFile(join(workspace, "package.json"), '{ "name": "baize" }\n', "utf8");
  await writeFile(
    join(workspace, "baize.config.json"),
    `${JSON.stringify(createDefaultConfig(), null, 2)}\n`,
    "utf8",
  );
  return workspace;
}

describe("plugin setup helpers", () => {
  it("detects a valid workspace and profile", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault");
    await mkdir(vault, { recursive: true });
    await writeFile(join(vault, "note.md"), "---\ntitle: Note\n---\nBody\n", "utf8");

    const result = await checkBaizeSetup({
      workspaceRoot: workspace,
      pathHint: join(vault, "note.md"),
      profile: "main",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.configPath).toBe(join(workspace, "baize.config.json"));
    expect(result.profileName).toBe("main");
    expect(result.runtime.available).toBe(true);
  });

  it("fails when the workspace is missing config", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "baize-plugin-missing-config-"));
    await writeFile(join(workspace, "Cargo.toml"), "[workspace]\nmembers = []\n", "utf8");

    const result = await checkBaizeSetup({
      workspaceRoot: workspace,
      profile: "main",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors.some((error) => error.includes("Could not find baize.config.json"))).toBe(true);
  });

  it("formats validation warnings distinctly from success", () => {
    expect(
      formatValidationNotice({
        exitCode: 0,
        report: {
          issues: [{ level: "warning", message: "Note body is empty.", note: "note.md" }],
        },
      }),
    ).toContain("Validation completed with 1 warning(s)");
  });

  it("formats publish warnings with the first warning", () => {
    expect(
      formatPublishNotice({
        adapter: "astro",
        profile: "main",
        mode: "publish",
        status: "warning",
        output_dir: "/tmp/out",
        outputs: [],
        warnings: ["missing asset"],
        errors: [],
      }),
    ).toContain("First warning: missing asset");
  });
});
