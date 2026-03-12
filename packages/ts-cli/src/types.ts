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
  extra?: Record<string, unknown>;
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
