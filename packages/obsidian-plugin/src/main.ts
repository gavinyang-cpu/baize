import { join } from "node:path";

import {
  App,
  FileSystemAdapter,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";

import { createArtifactLoader, generateAiArtifacts } from "../../ts-cli/src/ai.js";
import { publishWithProfile } from "../../ts-cli/src/publish.js";
import { setBaizeRuntimeRoot, validateNotes } from "../../ts-cli/src/rust.js";

interface BaizePluginSettings {
  workspacePath: string;
  defaultProfile: string;
}

const DEFAULT_SETTINGS: BaizePluginSettings = {
  workspacePath: "",
  defaultProfile: "main",
};

export default class BaizePlugin extends Plugin {
  settings: BaizePluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "publish-current-note",
      name: "Publish current note",
      callback: () => this.withActiveFile("Publish note", (file) => this.publishPath(this.absolutePath(file.path))),
    });

    this.addCommand({
      id: "publish-current-folder",
      name: "Publish current folder",
      callback: () =>
        this.withActiveFile("Publish folder", (file) => {
          const folderPath = file.parent?.path ?? "";
          return this.publishPath(this.absolutePath(folderPath));
        }),
    });

    this.addCommand({
      id: "validate-current-note",
      name: "Validate current note",
      callback: () => this.withActiveFile("Validate note", (file) => this.validatePath(this.absolutePath(file.path))),
    });

    this.addCommand({
      id: "generate-summary",
      name: "Generate summary",
      callback: () =>
        this.withActiveFile("Generate summary", (file) =>
          this.generateArtifacts(this.absolutePath(file.path), "summary"),
        ),
    });

    this.addCommand({
      id: "generate-thread",
      name: "Generate thread",
      callback: () =>
        this.withActiveFile("Generate thread", (file) =>
          this.generateArtifacts(this.absolutePath(file.path), "thread"),
        ),
    });

    this.addCommand({
      id: "generate-seo",
      name: "Generate SEO metadata",
      callback: () =>
        this.withActiveFile("Generate SEO", (file) => this.generateArtifacts(this.absolutePath(file.path), "seo")),
    });

    this.addCommand({
      id: "generate-all-artifacts",
      name: "Generate all AI artifacts",
      callback: () =>
        this.withActiveFile("Generate artifacts", (file) =>
          this.generateArtifacts(this.absolutePath(file.path), "all"),
        ),
    });

    this.addSettingTab(new BaizeSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async publishPath(targetPath: string): Promise<void> {
    const workspaceRoot = this.prepareRuntime();
    const artifactLoader = await createArtifactLoader({
      cwd: workspaceRoot,
      pathHint: targetPath,
    });
    const result = await publishWithProfile(targetPath, {
      cwd: workspaceRoot,
      profile: this.settings.defaultProfile.trim() || undefined,
      artifactLoader,
    });

    if (result.status === "failed") {
      throw new Error(result.errors.join("; ") || "Publish failed.");
    }

    const message =
      result.status === "warning"
        ? `Published ${result.outputs.length} note(s) with ${result.warnings.length} warning(s).`
        : `Published ${result.outputs.length} note(s) to profile ${result.profile}.`;
    new Notice(message, 8000);
  }

  private async validatePath(targetPath: string): Promise<void> {
    const workspaceRoot = this.prepareRuntime();
    const result = await validateNotes(targetPath);
    if (result.exitCode === 2) {
      const firstIssue = result.report.issues[0]?.message ?? "Validation failed.";
      new Notice(`Validation failed: ${firstIssue}`, 8000);
      return;
    }

    new Notice("Validation passed.", 5000);
    setBaizeRuntimeRoot(workspaceRoot);
  }

  private async generateArtifacts(
    targetPath: string,
    artifact: "summary" | "thread" | "seo" | "all",
  ): Promise<void> {
    const workspaceRoot = this.prepareRuntime();
    const result = await generateAiArtifacts(targetPath, {
      cwd: workspaceRoot,
      artifact,
    });
    new Notice(
      `Generated ${artifact === "all" ? "AI artifacts" : artifact} for ${result.outputs.length} note(s).`,
      8000,
    );
  }

  private async withActiveFile(
    label: string,
    action: (file: TFile) => Promise<void>,
  ): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a Markdown note first.", 5000);
      return;
    }

    try {
      await action(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`${label} failed: ${message}`, 10000);
    }
  }

  private prepareRuntime(): string {
    const workspaceRoot = this.workspaceRoot();
    setBaizeRuntimeRoot(workspaceRoot);
    return workspaceRoot;
  }

  private workspaceRoot(): string {
    const configured = this.settings.workspacePath.trim();
    if (configured.length > 0) {
      return configured;
    }

    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }

    throw new Error("Baize requires the desktop filesystem adapter.");
  }

  private absolutePath(relativePath: string): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("Baize requires the desktop filesystem adapter.");
    }

    return relativePath.length > 0 ? join(adapter.getBasePath(), relativePath) : adapter.getBasePath();
  }
}

class BaizeSettingTab extends PluginSettingTab {
  plugin: BaizePlugin;

  constructor(app: App, plugin: BaizePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Baize Publisher" });
    containerEl.createEl("p", {
      text: "Baize currently runs as a desktop-only plugin and expects access to a local Baize workspace.",
    });

    new Setting(containerEl)
      .setName("Baize workspace path")
      .setDesc("Absolute path to the Baize workspace or install root. Leave blank to use the current vault root.")
      .addText((text) =>
        text
          .setPlaceholder("/absolute/path/to/baize")
          .setValue(this.plugin.settings.workspacePath)
          .onChange(async (value) => {
            this.plugin.settings.workspacePath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default publish profile")
      .setDesc("Profile name from baize.config.json used by publish commands.")
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(this.plugin.settings.defaultProfile)
          .onChange(async (value) => {
            this.plugin.settings.defaultProfile = value.trim() || "main";
            await this.plugin.saveSettings();
          }),
      );
  }
}
