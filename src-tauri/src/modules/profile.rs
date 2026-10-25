pub const PROFILE_ENV: &str = "KEX_PROFILE";

pub fn profile_identifier(base: &str, profile: Option<&str>) -> Result<String, String> {
    let Some(profile) = profile.map(str::trim).filter(|p| !p.is_empty()) else {
        return Ok(base.to_string());
    };
    if !profile
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(format!(
            "{PROFILE_ENV}={profile:?} is invalid: only letters, digits and '-' are allowed"
        ));
    }
    Ok(format!("{base}.{}", profile.to_ascii_lowercase()))
}

pub fn apply(config: &mut tauri::Config) -> Result<(), String> {
    let profile = std::env::var(PROFILE_ENV).ok();
    config.identifier = profile_identifier(&config.identifier, profile.as_deref())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unset_or_blank_keeps_the_base_identifier() {
        assert_eq!(
            profile_identifier("app.betauer.kex", None).unwrap(),
            "app.betauer.kex"
        );
        assert_eq!(
            profile_identifier("app.betauer.kex", Some("  ")).unwrap(),
            "app.betauer.kex"
        );
    }

    #[test]
    fn profile_is_appended_lowercased() {
        assert_eq!(
            profile_identifier("app.betauer.kex.dev", Some("Onboarding-1")).unwrap(),
            "app.betauer.kex.dev.onboarding-1"
        );
    }

    #[test]
    fn rejects_path_like_profiles() {
        for bad in ["../x", "a/b", "a.b", "a b"] {
            assert!(
                profile_identifier("app.betauer.kex", Some(bad)).is_err(),
                "{bad}"
            );
        }
    }
}
