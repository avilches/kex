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

    tauri_build::build()
}
