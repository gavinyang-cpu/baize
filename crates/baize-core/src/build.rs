use std::fs;
use std::path::Path;

use anyhow::{Result, bail};
use serde::Serialize;

use crate::models::{BuildOutput, BuildReport, NoteDocument};
use crate::scan::{scan_path, validate_report};

pub fn build_path(input: &Path, out_dir: &Path) -> Result<BuildReport> {
    let scan = scan_path(input)?;
    let validation = validate_report(&scan);

    if validation.has_errors() {
        bail!(
            "validation failed; run `baize-cli validate {}` for details",
            input.display()
        );
    }

    fs::create_dir_all(out_dir)?;

    let mut outputs = Vec::with_capacity(scan.notes.len());
    for note in &scan.notes {
        let output_path = out_dir.join(format!("{}.md", note.slug));
        fs::write(&output_path, render_note(note)?)?;
        outputs.push(BuildOutput {
            note_path: note.relative_path.clone(),
            output_path,
        });
    }

    Ok(BuildReport {
        output_dir: out_dir.to_path_buf(),
        outputs,
        validation,
    })
}

fn render_note(note: &NoteDocument) -> Result<String> {
    #[derive(Serialize)]
    struct BuildFrontmatter<'a> {
        title: &'a str,
        slug: &'a str,
        source_path: &'a str,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        tags: &'a Vec<String>,
    }

    let source_path = note.relative_path.to_string_lossy().to_string();
    let frontmatter = BuildFrontmatter {
        title: &note.title,
        slug: &note.slug,
        source_path: &source_path,
        tags: &note.tags,
    };

    let yaml = serde_yaml::to_string(&frontmatter)?;
    let body = note.body.trim();

    if body.is_empty() {
        bail!("cannot build empty note {}", note.relative_path.display());
    }

    Ok(format!("---\n{}---\n\n{}\n", yaml, body))
}
