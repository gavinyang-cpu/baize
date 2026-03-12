import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  BAIZE_CONFIG_FILE,
  createDefaultConfig,
  loadBaizeConfig,
  resolveProfile,
  writeDefaultConfig,
} from "./config.js";

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "baize-config-"));
}

describe("config", () => {
  it("writes the default config file", async () => {
    const workspace = await createWorkspace();

    const result = await writeDefaultConfig(workspace);

    expect(result.created).toBe(true);
    expect(result.config_path).toBe(join(workspace, BAIZE_CONFIG_FILE));
  });

  it("discovers config from a nested note path", async () => {
    const workspace = await createWorkspace();
    const vault = join(workspace, "vault", "notes");
    await mkdir(vault, { recursive: true });
    await writeDefaultConfig(workspace);
    await writeFile(join(vault, "note.md"), "# Nested\n", "utf8");

    const loaded = await loadBaizeConfig({
      cwd: workspace,
      pathHint: join(vault, "note.md"),
    });

    expect(loaded.configPath).toBe(join(workspace, BAIZE_CONFIG_FILE));
    expect(resolveProfile(loaded.config).name).toBe("main");
  });

  it("prefers the config nearest the note path", async () => {
    const workspace = await createWorkspace();
    const nestedProject = join(workspace, "nested");
    const vault = join(nestedProject, "vault");
    await mkdir(vault, { recursive: true });
    await writeDefaultConfig(workspace);
    await writeDefaultConfig(nestedProject);
    await writeFile(join(vault, "note.md"), "# Nested\n", "utf8");

    const loaded = await loadBaizeConfig({
      cwd: workspace,
      pathHint: join(vault, "note.md"),
    });

    expect(loaded.configPath).toBe(join(nestedProject, BAIZE_CONFIG_FILE));
  });

  it("rejects duplicate init without force", async () => {
    const workspace = await createWorkspace();
    await writeFile(
      join(workspace, BAIZE_CONFIG_FILE),
      `${JSON.stringify(createDefaultConfig(), null, 2)}\n`,
      "utf8",
    );

    await expect(writeDefaultConfig(workspace)).rejects.toThrow("Config already exists");
  });
});
