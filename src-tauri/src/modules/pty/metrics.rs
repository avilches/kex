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
pub fn aggregate_tree(
    procs: &HashMap<u32, ProcStat>,
    root: u32,
    num_cpus: usize,
) -> (f32, u64) {
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
}
