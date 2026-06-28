use serde::Serialize;

pub(crate) const DEFAULT_TIMEOUT_SECS: u64 = 30;
pub(crate) const NETWORK_TIMEOUT_SECS: u64 = 120;
pub(crate) const MAX_TIMEOUT_SECS: u64 = 180;
pub(crate) const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
pub(crate) const MIN_GIT_VERSION: &str = "2.23";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub repo_root: String,
    pub branch: String,
    pub upstream: Option<String>,
    pub is_detached: bool,
    pub is_worktree: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub status_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSnapshot {
    pub repo_root: String,
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_detached: bool,
    pub truncated: bool,
    pub changed_files: Vec<GitChangedFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPanelSnapshot {
    pub repo: Option<GitRepoInfo>,
    pub status: Option<GitStatusSnapshot>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardEntry {
    pub path: String,
    pub untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub diff_text: String,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffContentResult {
    pub original_content: String,
    pub modified_content: String,
    pub is_binary: bool,
    pub fallback_patch: String,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub commit_sha: String,
    pub summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFileChange {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub status_label: String,
    pub added: u32,
    pub removed: u32,
    pub is_binary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub sha: String,
    pub short_sha: String,
    pub author: String,
    pub author_email: String,
    pub timestamp_secs: i64,
    pub parents: Vec<String>,
    pub subject: String,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResult {
    pub remote: Option<String>,
    pub branch: Option<String>,
    pub pushed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub remote: Option<String>,
    pub upstream: Option<String>,
    pub worktree: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub last_commit_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeStatus {
    pub worktree_name: Option<String>,
    pub worktree_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_current: bool,
    pub is_main: bool,
}

pub(crate) struct GitOutput {
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) exit_code: Option<i32>,
    pub(crate) timed_out: bool,
    pub(crate) truncated: bool,
}

pub(crate) enum TextSource {
    Missing,
    Binary,
    Text(String),
}

impl TextSource {
    pub(crate) fn into_text(self) -> String {
        match self {
            TextSource::Text(text) => text.replace("\r\n", "\n"),
            TextSource::Missing | TextSource::Binary => String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn into_text_normalizes_crlf() {
        let src = TextSource::Text("foo\r\nbar\r\nbaz".to_string());
        assert_eq!(src.into_text(), "foo\nbar\nbaz");
    }

    #[test]
    fn into_text_leaves_lf_unchanged() {
        let src = TextSource::Text("foo\nbar\n".to_string());
        assert_eq!(src.into_text(), "foo\nbar\n");
    }

    #[test]
    fn into_text_binary_returns_empty() {
        assert_eq!(TextSource::Binary.into_text(), "");
    }
}
