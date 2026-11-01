//! One way to replace a config file of another tool without ever leaving it half written.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Replaces `path` through a unique temp file in the same directory and a rename, keeping the
/// mode of the file it replaces. A symlinked config is written through to its target so dotfiles
/// links stay links. The temp name is unique, so two writers never share one.
pub fn write_atomically(path: &Path, contents: &str) -> io::Result<()> {
    let target = resolve_write_path(path)?;
    let dir = match target.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".kex-")
        .suffix(".tmp")
        .tempfile_in(&dir)?;
    tmp.write_all(contents.as_bytes())?;
    #[cfg(unix)]
    if let Ok(meta) = fs::metadata(&target) {
        tmp.as_file().set_permissions(meta.permissions())?;
    }
    tmp.as_file().sync_all()?;
    tmp.persist(&target).map_err(|e| e.error)?;
    Ok(())
}

/// Same as `write_atomically` and leaves the file executable, for the hook scripts.
#[cfg(unix)]
pub fn write_atomically_executable(path: &Path, contents: &str) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    write_atomically(path, contents)?;
    fs::set_permissions(resolve_write_path(path)?, fs::Permissions::from_mode(0o755))
}

#[cfg(not(unix))]
pub fn write_atomically_executable(path: &Path, contents: &str) -> io::Result<()> {
    write_atomically(path, contents)
}

fn resolve_write_path(path: &Path) -> io::Result<PathBuf> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => fs::canonicalize(path),
        Ok(_) => Ok(path.to_path_buf()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(path.to_path_buf()),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_file_and_its_folder() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a").join("b.json");
        write_atomically(&path, "{}").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
    }

    #[cfg(unix)]
    #[test]
    fn keeps_a_symlink_a_symlink_and_writes_its_target() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("dotfiles-settings.json");
        fs::write(&target, "old").unwrap();
        let link = dir.path().join("settings.json");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        write_atomically(&link, "new").unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_mode_of_the_file_it_replaces() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        write_atomically(&path, "new").unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn the_executable_variant_sets_the_exec_bits() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("hook.sh");
        write_atomically_executable(&path, "#!/bin/sh\n").unwrap();
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o755);
    }

    #[test]
    fn concurrent_writers_never_leave_a_torn_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let payloads: Vec<String> = (0..8)
            .map(|i| format!("{{\"n\":{i}}}").repeat(500))
            .collect();
        std::thread::scope(|s| {
            for p in &payloads {
                let path = path.clone();
                s.spawn(move || {
                    for _ in 0..20 {
                        write_atomically(&path, p).unwrap();
                    }
                });
            }
        });
        let final_text = fs::read_to_string(&path).unwrap();
        assert!(payloads.contains(&final_text));
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name() != "settings.json")
            .collect();
        assert!(leftovers.is_empty(), "stray temp files: {leftovers:?}");
    }
}
