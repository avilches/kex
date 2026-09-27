#!/usr/bin/env node
// Bumps the version in every place Kex hardcodes it: package.json,
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml. Then refreshes
// src-tauri/Cargo.lock's own entry for the kex package (offline, no
// dependency resolution) so `cargo test --locked` doesn't choke on a
// stale lockfile. Does not commit, tag or push; see docs/BUILD.md for
// the rest of the release flow.
//
// CLI: node scripts/bump-version.mjs <new-version>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(newVersion)) {
  console.error(
    "Usage: node scripts/bump-version.mjs <version>  (e.g. 0.7.4)",
  );
  process.exit(1);
}

function bumpJsonVersion(relPath) {
  const path = join(root, relPath);
  const before = readFileSync(path, "utf8");
  const oldVersion = JSON.parse(before).version;
  const after = before.replace(
    /"version":\s*"[^"]+"/,
    `"version": "${newVersion}"`,
  );
  if (after === before) {
    throw new Error(`No "version" field found in ${relPath}`);
  }
  writeFileSync(path, after);
  return oldVersion;
}

function bumpCargoToml(relPath) {
  const path = join(root, relPath);
  const before = readFileSync(path, "utf8");
  const packageBlockMatch = before.match(/\[package\][\s\S]*?(?=\n\[|$)/);
  if (!packageBlockMatch) {
    throw new Error(`No [package] section found in ${relPath}`);
  }
  const packageBlock = packageBlockMatch[0];
  const oldVersionMatch = packageBlock.match(/^version\s*=\s*"([^"]+)"/m);
  if (!oldVersionMatch) {
    throw new Error(`No version field in [package] of ${relPath}`);
  }
  const newPackageBlock = packageBlock.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${newVersion}"`,
  );
  writeFileSync(path, before.replace(packageBlock, newPackageBlock));
  return oldVersionMatch[1];
}

const versions = {
  "package.json": bumpJsonVersion("package.json"),
  "src-tauri/tauri.conf.json": bumpJsonVersion("src-tauri/tauri.conf.json"),
  "src-tauri/Cargo.toml": bumpCargoToml("src-tauri/Cargo.toml"),
};

const distinctOldVersions = new Set(Object.values(versions));
if (distinctOldVersions.size > 1) {
  console.warn(
    "Warning: the three files were out of sync before this run:",
    versions,
  );
}

console.log(`Bumped to ${newVersion}:`);
for (const file of Object.keys(versions)) {
  console.log(`  ${file}: ${versions[file]} -> ${newVersion}`);
}

console.log("\nRefreshing Cargo.lock...");
execFileSync("cargo", ["check", "--offline", "--quiet"], {
  cwd: join(root, "src-tauri"),
  stdio: "inherit",
});

console.log("\nNext steps:");
console.log(
  "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock",
);
console.log(`  git commit -m "Bump version to ${newVersion}"`);
console.log(`  git tag v${newVersion} && git push origin v${newVersion}`);
