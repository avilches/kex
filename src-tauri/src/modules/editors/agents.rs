use crate::modules::agent::launch_cmd::DEFAULT_AGENTS;
use crate::modules::editors::detect::{which_binary, DetectedEditor, DetectedKind};

fn display_name(agent: &str) -> &str {
    match agent {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "opencode" => "OpenCode",
        "omp" => "OMP",
        "pi" => "Pi",
        other => other,
    }
}

pub fn detect_agents() -> Vec<DetectedEditor> {
    detect_agents_with(which_binary)
}

fn detect_agents_with(lookup: impl Fn(&str) -> Option<String>) -> Vec<DetectedEditor> {
    DEFAULT_AGENTS
        .iter()
        .filter_map(|name| {
            let binary = lookup(name)?;
            Some(DetectedEditor {
                id: name.to_string(),
                name: display_name(name).to_string(),
                binary,
                args_before_path: Vec::new(),
                kind: DetectedKind::Agent,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_only_resolved_agents() {
        let found = detect_agents_with(|n| match n {
            "claude" | "pi" => Some(format!("/bin/{n}")),
            _ => None,
        });
        let ids: Vec<_> = found.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["claude", "pi"]);
        assert_eq!(found[0].binary, "/bin/claude");
        assert!(found.iter().all(|d| d.kind == DetectedKind::Agent));
        assert!(found.iter().all(|d| d.args_before_path.is_empty()));
    }

    #[test]
    fn display_names() {
        let found = detect_agents_with(|n| Some(n.to_string()));
        let names: Vec<_> = found.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(names, ["Claude Code", "Codex", "OpenCode", "OMP", "Pi"]);
    }

    #[test]
    fn serializes_kind_lowercase() {
        let found = detect_agents_with(|n| Some(n.to_string()));
        let v = serde_json::to_value(&found[0]).unwrap();
        assert_eq!(v["kind"], "agent");
    }
}
