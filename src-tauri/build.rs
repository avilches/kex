fn main() {
    // `pnpm tauri dev` compiles with the debug profile, `pnpm tauri build` with release.
    // Give the dev build its own identifier so it writes settings/logs to a separate
    // directory instead of the one the installed .app uses day to day.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        println!(
            "cargo:rustc-env=TAURI_CONFIG={}",
            r#"{"identifier":"app.betauer.kex.dev","productName":"Kex Dev"}"#
        );
    }

    let git_hash = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|hash| hash.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=KEX_GIT_HASH={git_hash}");

    // "HEAD" (detached, e.g. mid-rebase) isn't a branch name worth showing.
    let git_branch = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|branch| branch.trim().to_string())
        .filter(|branch| branch != "HEAD")
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=KEX_GIT_BRANCH={git_branch}");

    // The reflog is touched by every commit/checkout/merge, unlike .git/HEAD which
    // only changes on branch switches. Rebuilds pick up the new hash/branch off that.
    println!("cargo:rerun-if-changed=../.git/logs/HEAD");

    tauri_build::build()
}
