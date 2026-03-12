use std::fs;

use baize_core::{build_path, parse_markdown_note, scan_path, validate_report};
use tempfile::tempdir;

#[test]
fn parses_frontmatter_and_defaults() {
    let temp = tempdir().unwrap();
    let note_path = temp.path().join("note.md");
    fs::write(
        &note_path,
        r#"---
title: Hybrid Core
slug: hybrid-core
tags:
  - rust
  - obsidian
---
Body copy
"#,
    )
    .unwrap();

    let note = parse_markdown_note(&note_path, temp.path()).unwrap();

    assert_eq!(note.title, "Hybrid Core");
    assert_eq!(note.slug, "hybrid-core");
    assert_eq!(note.tags, vec!["rust", "obsidian"]);
    assert_eq!(note.body, "Body copy");
}

#[test]
fn duplicate_slugs_are_reported() {
    let temp = tempdir().unwrap();
    fs::write(
        temp.path().join("one.md"),
        "---\ntitle: One\nslug: same\n---\nOne\n",
    )
    .unwrap();
    fs::write(
        temp.path().join("two.md"),
        "---\ntitle: Two\nslug: same\n---\nTwo\n",
    )
    .unwrap();

    let report = scan_path(temp.path()).unwrap();
    let validation = validate_report(&report);

    assert!(validation.has_errors());
    assert!(
        validation
            .issues
            .iter()
            .any(|issue| issue.message.contains("duplicate slug `same`"))
    );
}

#[test]
fn build_writes_normalized_markdown_files() {
    let temp = tempdir().unwrap();
    let out_dir = temp.path().join("dist");
    fs::write(
        temp.path().join("publish-me.md"),
        "---\ntitle: Publish Me\n---\nHello from Rust\n",
    )
    .unwrap();

    let report = build_path(temp.path(), &out_dir).unwrap();
    let output_path = out_dir.join("publish-me.md");
    let output = fs::read_to_string(&output_path).unwrap();

    assert_eq!(report.outputs.len(), 1);
    assert!(output.contains("title: Publish Me"));
    assert!(output.contains("slug: publish-me"));
    assert!(output.contains("Hello from Rust"));
}

#[test]
fn scan_ignores_generated_directories() {
    let temp = tempdir().unwrap();
    let node_modules_dir = temp.path().join("node_modules");
    let dist_dir = temp.path().join("dist");
    fs::create_dir_all(&node_modules_dir).unwrap();
    fs::create_dir_all(&dist_dir).unwrap();
    fs::write(temp.path().join("real.md"), "---\ntitle: Real\n---\nReal\n").unwrap();
    fs::write(
        node_modules_dir.join("ignored.md"),
        "---\ntitle: Ignored\n---\nIgnored\n",
    )
    .unwrap();
    fs::write(
        dist_dir.join("ignored-too.md"),
        "---\ntitle: Ignored Too\n---\nIgnored\n",
    )
    .unwrap();

    let report = scan_path(temp.path()).unwrap();

    assert_eq!(report.notes.len(), 1);
    assert_eq!(report.notes[0].slug, "real");
}
