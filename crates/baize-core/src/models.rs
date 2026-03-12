use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct PublishFrontmatter {
    pub profile: Option<String>,
    #[serde(default)]
    pub targets: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AiFrontmatter {
    pub summary: Option<bool>,
    pub thread: Option<bool>,
    pub seo: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct NoteFrontmatter {
    pub title: Option<String>,
    pub slug: Option<String>,
    #[serde(default)]
    pub publish: PublishFrontmatter,
    #[serde(default)]
    pub ai: AiFrontmatter,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_yaml::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteDocument {
    pub source_path: PathBuf,
    pub relative_path: PathBuf,
    pub title: String,
    pub slug: String,
    pub tags: Vec<String>,
    pub body: String,
    pub frontmatter: NoteFrontmatter,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanReport {
    pub root: PathBuf,
    pub notes: Vec<NoteDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ValidationLevel {
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidationIssue {
    pub level: ValidationLevel,
    pub message: String,
    pub note: Option<PathBuf>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ValidationReport {
    pub issues: Vec<ValidationIssue>,
}

impl ValidationReport {
    pub fn has_errors(&self) -> bool {
        self.issues
            .iter()
            .any(|issue| matches!(issue.level, ValidationLevel::Error))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildOutput {
    pub note_path: PathBuf,
    pub output_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildReport {
    pub output_dir: PathBuf,
    pub outputs: Vec<BuildOutput>,
    pub validation: ValidationReport,
}
