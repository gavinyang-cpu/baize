use std::path::PathBuf;
use std::process;

use anyhow::Result;
use baize_core::{build_path, scan_path, validate_report};
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "baize")]
#[command(about = "Rust-first local publishing foundation for Baize")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Scan notes and print normalized metadata.
    Scan {
        path: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Validate notes for duplicate slugs and publish warnings.
    Validate {
        path: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Build normalized Astro-ready Markdown files into an output directory.
    Build {
        path: PathBuf,
        #[arg(long, default_value = "dist/astro")]
        out_dir: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

fn main() {
    let exit_code = match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("error: {error:#}");
            1
        }
    };

    process::exit(exit_code);
}

fn run() -> Result<i32> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Scan { path, json } => {
            let report = scan_path(&path)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&report)?);
            } else {
                println!(
                    "Scanned {} note(s) from {}",
                    report.notes.len(),
                    report.root.display()
                );
                for note in &report.notes {
                    println!("- {} -> {}", note.relative_path.display(), note.slug);
                }
            }

            Ok(0)
        }
        Commands::Validate { path, json } => {
            let report = scan_path(&path)?;
            let validation = validate_report(&report);

            if json {
                println!("{}", serde_json::to_string_pretty(&validation)?);
            } else if validation.issues.is_empty() {
                println!("Validation passed for {} note(s)", report.notes.len());
            } else {
                println!("Validation found {} issue(s):", validation.issues.len());
                for issue in &validation.issues {
                    let level = match issue.level {
                        baize_core::ValidationLevel::Warning => "warning",
                        baize_core::ValidationLevel::Error => "error",
                    };
                    if let Some(note) = &issue.note {
                        println!("- [{level}] {} ({})", issue.message, note.display());
                    } else {
                        println!("- [{level}] {}", issue.message);
                    }
                }
            }

            Ok(if validation.has_errors() { 2 } else { 0 })
        }
        Commands::Build {
            path,
            out_dir,
            json,
        } => {
            let report = build_path(&path, &out_dir)?;

            if json {
                println!("{}", serde_json::to_string_pretty(&report)?);
            } else {
                println!(
                    "Built {} note(s) into {}",
                    report.outputs.len(),
                    report.output_dir.display()
                );
                for output in &report.outputs {
                    println!(
                        "- {} -> {}",
                        output.note_path.display(),
                        output.output_path.display()
                    );
                }
            }

            Ok(0)
        }
    }
}
