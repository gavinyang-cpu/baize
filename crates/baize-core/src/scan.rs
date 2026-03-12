use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Result, bail};
use walkdir::{DirEntry, WalkDir};

use crate::models::{ScanReport, ValidationIssue, ValidationLevel, ValidationReport};
use crate::parser::parse_markdown_note;

pub fn scan_path(input: &Path) -> Result<ScanReport> {
    if !input.exists() {
        bail!("path does not exist: {}", input.display());
    }

    let root = if input.is_dir() {
        input.to_path_buf()
    } else {
        input
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf()
    };

    let mut files = discover_markdown_files(input)?;
    files.sort();

    if files.is_empty() {
        bail!("no Markdown files found at {}", input.display());
    }

    let notes = files
        .into_iter()
        .map(|path| parse_markdown_note(&path, &root))
        .collect::<Result<Vec<_>>>()?;

    Ok(ScanReport { root, notes })
}

pub fn validate_report(report: &ScanReport) -> ValidationReport {
    let mut issues = Vec::new();
    let mut seen_slugs: BTreeMap<&str, &PathBuf> = BTreeMap::new();

    for note in &report.notes {
        for warning in &note.warnings {
            issues.push(ValidationIssue {
                level: ValidationLevel::Warning,
                message: warning.clone(),
                note: Some(note.relative_path.clone()),
            });
        }

        if let Some(existing) = seen_slugs.get(note.slug.as_str()) {
            issues.push(ValidationIssue {
                level: ValidationLevel::Error,
                message: format!(
                    "duplicate slug `{}` found in {} and {}",
                    note.slug,
                    existing.display(),
                    note.relative_path.display()
                ),
                note: Some(note.relative_path.clone()),
            });
        } else {
            seen_slugs.insert(note.slug.as_str(), &note.relative_path);
        }
    }

    ValidationReport { issues }
}

fn discover_markdown_files(input: &Path) -> Result<Vec<PathBuf>> {
    if input.is_file() {
        return Ok(is_markdown_file(input)
            .then(|| vec![input.to_path_buf()])
            .unwrap_or_default());
    }

    let files = WalkDir::new(input)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !should_skip_directory(entry))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_markdown_file(entry.path()))
        .map(|entry| entry.path().to_path_buf())
        .collect();

    Ok(files)
}

fn should_skip_directory(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }

    entry
        .file_name()
        .to_str()
        .map(|name| matches!(name, ".git" | "node_modules" | "target" | "dist"))
        .unwrap_or(false)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension, "md" | "markdown"))
        .unwrap_or(false)
}
