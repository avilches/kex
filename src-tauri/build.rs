fn main() {
    // `pnpm tauri dev` compiles with the debug profile, `pnpm tauri build` with release.
    // Give the dev build its own identifier so it writes settings/logs to a separate
    // directory instead of the one the installed .app uses day to day.
    // The dev server port is picked per checkout by scripts/tauri.mjs; the dev build
    // has to load that same URL, so it travels in the same injected config.
    println!("cargo:rerun-if-env-changed=KEX_DEV_PORT");
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        let port = std::env::var("KEX_DEV_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(1420);
        println!(
            r#"cargo:rustc-env=TAURI_CONFIG={{"identifier":"app.betauer.kex.dev","productName":"Kex Dev","build":{{"devUrl":"http://localhost:{port}"}}}}"#
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
