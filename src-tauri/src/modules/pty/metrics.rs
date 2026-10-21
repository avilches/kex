use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use sysinfo::System;

/// Per-process snapshot used by the pure aggregation core.
#[derive(Clone, Copy)]
pub struct ProcStat {
    pub parent: u32,
    /// Per-core CPU usage as reported by sysinfo (can exceed 100 per process).
    pub cpu: f32,
    /// Resident memory in bytes.
    pub mem: u64,
}

/// Persistent sysinfo handle. Kept in Tauri managed state so CPU% is computed
/// as a delta between samples instead of resetting to 0 each call.
pub struct ProcessMonitor(pub Mutex<System>);

impl Default for ProcessMonitor {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

/// Sum CPU and memory across `root` and all of its descendants.
/// The returned CPU is normalized to 0..=100 by dividing the per-core sum by
/// `num_cpus`; memory is the raw byte sum of the tree.
pub fn aggregate_tree(procs: &HashMap<u32, ProcStat>, root: u32, num_cpus: usize) -> (f32, u64) {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, st) in procs {
        children.entry(st.parent).or_default().push(*pid);
    }
    let mut stack = vec![root];
    let mut seen: HashSet<u32> = HashSet::new();
    let mut cpu = 0.0f32;
    let mut mem = 0u64;
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(st) = procs.get(&pid) {
            cpu += st.cpu;
            mem += st.mem;
        }
        if let Some(kids) = children.get(&pid) {
            stack.extend(kids.iter().copied());
        }
    }
    let denom = num_cpus.max(1) as f32;
    let norm = (cpu / denom).clamp(0.0, 100.0);
    (norm, mem)
}

/// The pids of every descendant of `root`, `root` itself not counted. A pid
/// whose parent is itself (the init of a container) is skipped by the seen set.
pub fn descendants_of(procs: &HashMap<u32, ProcStat>, root: u32) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, st) in procs {
        children.entry(st.parent).or_default().push(*pid);
    }
    let mut stack = vec![root];
    let mut seen: HashSet<u32> = HashSet::new();
    let mut out: Vec<u32> = Vec::new();
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if pid != root {
            out.push(pid);
        }
        if let Some(kids) = children.get(&pid) {
            stack.extend(kids.iter().copied());
        }
    }
    out.sort_unstable();
    out
}

/// The real parent/child table of every process, straight from `ps`. sysinfo on
/// macOS cannot read the parent of setuid executables (`top`, `sudo`, ...) and
/// reports it as 0, which prunes them out of the tree exactly when the user
/// runs one in the foreground; `ps` reads the same ppid unprivileged, so both
/// the signal and the metrics walk this table. Fails to an empty map.
pub fn real_proc_table() -> HashMap<u32, ProcStat> {
    let Ok(output) = std::process::Command::new("ps")
        .args(["-axo", "pid=,ppid="])
        .output()
    else {
        return HashMap::new();
    };
    if !output.status.success() {
        return HashMap::new();
    }
    parse_proc_table(&String::from_utf8_lossy(&output.stdout))
}

fn parse_proc_table(output: &str) -> HashMap<u32, ProcStat> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let pid: u32 = fields.next()?.parse().ok()?;
            let parent: u32 = fields.next()?.parse().ok()?;
            Some((pid, ProcStat { parent, cpu: 0.0, mem: 0 }))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(parent: u32, cpu: f32, mem: u64) -> ProcStat {
        ProcStat { parent, cpu, mem }
    }

    #[test]
    fn aggregates_tree_and_ignores_outsiders() {
        let mut procs = HashMap::new();
        procs.insert(100, st(1, 0.0, 10)); // shell
        procs.insert(200, st(100, 50.0, 100)); // npm
        procs.insert(300, st(200, 150.0, 200)); // node (grandchild)
        procs.insert(999, st(1, 80.0, 500)); // unrelated process
        let (cpu, mem) = aggregate_tree(&procs, 100, 4);
        // (0 + 50 + 150) / 4 cores = 50.0
        assert!((cpu - 50.0).abs() < 0.01);
        assert_eq!(mem, 310);
    }

    #[test]
    fn clamps_to_100() {
        let mut procs = HashMap::new();
        procs.insert(100, st(1, 800.0, 0));
        let (cpu, _) = aggregate_tree(&procs, 100, 4);
        assert_eq!(cpu, 100.0);
    }

    #[test]
    fn missing_root_yields_zero() {
        let procs: HashMap<u32, ProcStat> = HashMap::new();
        let (cpu, mem) = aggregate_tree(&procs, 100, 4);
        assert_eq!(cpu, 0.0);
        assert_eq!(mem, 0);
    }

    #[test]
    fn descendants_walks_the_whole_tree_and_skips_the_root() {
        let mut procs = HashMap::new();
        procs.insert(100, st(1, 0.0, 0));
        procs.insert(101, st(100, 0.0, 0));
        procs.insert(102, st(100, 0.0, 0));
        procs.insert(103, st(101, 0.0, 0));
        procs.insert(104, st(999, 0.0, 0));
        assert_eq!(descendants_of(&procs, 100), vec![101, 102, 103]);
        assert_eq!(descendants_of(&procs, 104), Vec::<u32>::new());
    }

    #[test]
    fn descendants_bends_a_cycle_instead_of_looping() {
        let mut procs = HashMap::new();
        procs.insert(200, st(201, 0.0, 0));
        procs.insert(201, st(200, 0.0, 0));
        assert_eq!(descendants_of(&procs, 200), vec![201]);
        assert_eq!(descendants_of(&procs, 300), Vec::<u32>::new());
    }

    #[test]
    fn parses_the_ps_table_into_proc_stats() {
        let procs = parse_proc_table("    1     0\n  100     1\n  200   100\n");
        assert_eq!(procs.len(), 3);
        assert_eq!(procs[&100].parent, 1);
        assert_eq!(procs[&200].parent, 100);
        assert_eq!(procs[&1].parent, 0);
    }

    #[test]
    fn parse_proc_table_ignores_garbage_lines() {
        let procs = parse_proc_table("no numbers here\n\n  abc     1\n  300     1\n");
        assert_eq!(procs.len(), 1);
        assert_eq!(procs[&300].parent, 1);
    }
}
