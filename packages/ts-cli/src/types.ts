export interface PublishFrontmatter {
  profile?: string;
  targets: string[];
}

export interface AiFrontmatter {
  summary?: boolean;
  thread?: boolean;
  seo?: boolean;
}

export interface NoteFrontmatter {
  title?: string;
  slug?: string;
  publish: PublishFrontmatter;
  ai: AiFrontmatter;
  tags: string[];
  [key: string]: unknown;
}

export interface NoteDocument {
  source_path: string;
  relative_path: string;
  title: string;
  slug: string;
  tags: string[];
  body: string;
  frontmatter: NoteFrontmatter;
  warnings: string[];
}

export interface ScanReport {
  root: string;
  notes: NoteDocument[];
}

export type ValidationLevel = "warning" | "error";

export interface ValidationIssue {
  level: ValidationLevel;
  message: string;
  note?: string | null;
}

export interface ValidationReport {
  issues: ValidationIssue[];
}

export interface BuildOutput {
  note_path: string;
  output_path: string;
}

export interface BuildReport {
  output_dir: string;
  outputs: BuildOutput[];
  validation: ValidationReport;
}

export interface ValidationExecution {
  exitCode: number;
  report: ValidationReport;
}

export type ProviderKind = "openai" | "ollama";
export type AiArtifactKind = "summary" | "thread" | "seo";
export type PublishStatus = "success" | "warning" | "failed";
export type PublishMode = "draft" | "publish";

export interface AstroProfileConfig {
  adapter: "astro";
  content_dir: string;
  assets_dir?: string;
  asset_url_base?: string;
  note_url_base?: string;
  build_command?: string;
}

export interface OpenAiProviderConfig {
  model: string;
  api_key_env?: string;
  base_url?: string;
}

export interface OllamaProviderConfig {
  model: string;
  base_url?: string;
}

export interface AiConfig {
  default_provider?: ProviderKind;
  artifact_dir?: string;
  openai?: OpenAiProviderConfig;
  ollama?: OllamaProviderConfig;
}

export interface BaizeConfig {
  version: 1;
  default_profile?: string;
  profiles: Record<string, AstroProfileConfig>;
  ai?: AiConfig;
}

export interface ArtifactSeoMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
}

export interface GeneratedArtifacts {
  summary?: string;
  thread?: string[];
  seo?: ArtifactSeoMetadata;
}

export interface StoredArtifacts extends GeneratedArtifacts {
  slug: string;
  note_path: string;
  artifact_dir: string;
  summary_path?: string;
  thread_path?: string;
  seo_path?: string;
}

export interface AiGenerationExecution {
  provider: ProviderKind;
  model: string;
  artifact_dir: string;
  outputs: StoredArtifacts[];
  warnings: string[];
}

export interface ArticleAsset {
  source_path: string;
  output_path: string;
  public_url: string;
}

export interface PublishNoteResult {
  note_path: string;
  slug: string;
  output_path: string;
  assets: ArticleAsset[];
  warnings: string[];
  artifacts?: GeneratedArtifacts;
}

export interface PublishExecution {
  adapter: "astro";
  profile: string;
  mode: PublishMode;
  status: PublishStatus;
  output_dir: string;
  outputs: PublishNoteResult[];
  warnings: string[];
  errors: string[];
  hook_output?: string;
}

export interface InitExecution {
  config_path: string;
  created: boolean;
}
