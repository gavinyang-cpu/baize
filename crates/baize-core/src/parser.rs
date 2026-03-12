use std::fs;
use std::path::Path;

use anyhow::{Context, Result, anyhow};

use crate::models::{NoteDocument, NoteFrontmatter};

pub fn parse_markdown_note(path: &Path, root: &Path) -> Result<NoteDocument> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed to read note {}", path.display()))?;
    let relative_path = path.strip_prefix(root).unwrap_or(path).to_path_buf();

    parse_markdown_string(path, &relative_path, &raw)
}

pub fn parse_markdown_string(
    source_path: &Path,
    relative_path: &Path,
    raw: &str,
) -> Result<NoteDocument> {
    let (frontmatter, body) = split_frontmatter(raw)?;
    let fallback_title = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled");
    let title = frontmatter
        .title
        .clone()
        .unwrap_or_else(|| fallback_title.to_string());
    let slug = frontmatter.slug.clone().unwrap_or_else(|| slugify(&title));
    let body = body.trim().to_string();

    let mut warnings = Vec::new();
    if body.is_empty() {
        warnings.push("note body is empty".to_string());
    }
    if !frontmatter.publish.targets.is_empty()
        && !frontmatter
            .publish
            .targets
            .iter()
            .any(|target| target == "astro")
    {
        warnings.push("publish targets do not include `astro`".to_string());
    }

    Ok(NoteDocument {
        source_path: source_path.to_path_buf(),
        relative_path: relative_path.to_path_buf(),
        title,
        slug,
        tags: frontmatter.tags.clone(),
        body,
        frontmatter,
        warnings,
    })
}

pub fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn split_frontmatter(raw: &str) -> Result<(NoteFrontmatter, String)> {
    let normalized = raw.replace("\r\n", "\n");

    if let Some(remaining) = normalized.strip_prefix("---\n") {
        if let Some((frontmatter_block, body)) = remaining.split_once("\n---\n") {
            let frontmatter = serde_yaml::from_str::<NoteFrontmatter>(frontmatter_block)
                .context("failed to parse YAML frontmatter")?;
            return Ok((frontmatter, body.to_string()));
        }

        if let Some(frontmatter_block) = remaining.strip_suffix("\n---") {
            let frontmatter = serde_yaml::from_str::<NoteFrontmatter>(frontmatter_block)
                .context("failed to parse YAML frontmatter")?;
            return Ok((frontmatter, String::new()));
        }

        return Err(anyhow!(
            "frontmatter starts with `---` but is missing a closing delimiter"
        ));
    }

    Ok((NoteFrontmatter::default(), normalized))
}
