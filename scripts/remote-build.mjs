#!/usr/bin/env node

/**
 * remote-build.mjs
 *
 * Builds RDO-MetaLobby on GitHub Actions, streams the run live, downloads the
 * artifact and syncs it straight into src-tauri/target/release.
 *
 * Usage:
 *   node scripts/remote-build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.resolve(rootDir, 'src-tauri/target/release');
const tempDownloadDir = path.resolve(rootDir, '.remote-download-tmp');
const workflowName = 'test-build.yml';
const artifactName = 'rdo-metalobby-target-release';

console.log(`\n============================================================`);
console.log(`  RDO-MetaLobby: Seamless Remote Build via GitHub Actions`);
console.log(`============================================================\n`);

// 1. Check prerequisites: git & gh CLI, authenticated
function checkCommand(cmd, name) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
  } catch {
    console.error(`[ERROR] '${name}' is not installed or not in PATH.`);
    process.exit(1);
  }
}

checkCommand('git', 'Git');
checkCommand('gh', 'GitHub CLI (gh)');

try {
  execSync('gh auth status', { stdio: 'ignore' });
} catch {
  console.error(`[ERROR] GitHub CLI is not authenticated. Please run 'gh auth login' first.`);
  process.exit(1);
}

// 2. Detect current branch
let branch = execSync('git branch --show-current', { cwd: rootDir, encoding: 'utf8' }).trim() || 'main';
console.log(`Current branch: ${branch}`);

// 3. Warn about uncommitted changes (they are NOT built — CI builds the pushed commit)
const statusOutput = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
if (statusOutput) {
  console.warn(`\n[NOTICE] Uncommitted changes will NOT be built — CI builds the pushed commit:`);
  console.warn(statusOutput.split('\n').map(l => `  ${l}`).join('\n'));
}

// 4. Push current branch
console.log(`Pushing branch '${branch}' to origin...`);
const pushRes = spawnSync('git', ['push', 'origin', branch], { cwd: rootDir, stdio: 'inherit' });
if (pushRes.status !== 0) {
  console.error(`[ERROR] Failed to push '${branch}' to origin.`);
  process.exit(pushRes.status ?? 1);
}

// 5. Dispatch the workflow
console.log(`\nDispatching GitHub Actions workflow (${workflowName}) on branch '${branch}'...`);
const dispatchRes = spawnSync('gh', ['workflow', 'run', workflowName, '--ref', branch], {
  cwd: rootDir, stdio: 'inherit',
});
if (dispatchRes.status !== 0) {
  console.error(`[ERROR] Failed to trigger workflow '${workflowName}'.`);
  process.exit(dispatchRes.status ?? 1);
}

// 6. Find the newly triggered run
console.log(`[OK] Workflow dispatched. Waiting for run to initialize...`);
let runId = null;
let runUrl = null;
for (let attempt = 0; attempt < 15 && !runId; attempt++) {
  try {
    const runs = JSON.parse(
      execSync(`gh run list --workflow=${workflowName} --branch=${branch} --limit 3 --json databaseId,url,createdAt`, {
        cwd: rootDir, encoding: 'utf8',
      })
    );
    const now = Date.now();
    const recent = runs.find(r => now - new Date(r.createdAt).getTime() < 120000);
    if (recent) {
      runId = recent.databaseId;
      runUrl = recent.url;
      console.log(`Found run ID: ${runId}\nRun URL: ${runUrl}\n`);
    }
  } catch {}
  if (!runId) execSync('node -e "setTimeout(() => {}, 2000)"');
}
if (!runId) {
  console.error(`[ERROR] Could not locate the triggered workflow run. Check 'gh run list'.`);
  process.exit(1);
}

// 7. Watch the run to completion
const watchRes = spawnSync('gh', ['run', 'watch', runId.toString(), '--exit-status'], {
  cwd: rootDir, stdio: 'inherit',
});
if (watchRes.status !== 0) {
  console.error(`\n[ERROR] GitHub Actions build failed or was cancelled.`);
  console.error(`View details at: ${runUrl}`);
  process.exit(watchRes.status ?? 1);
}
console.log(`\n[OK] Remote build finished successfully on GitHub Actions!`);

// 8. Download the artifact
if (fs.existsSync(tempDownloadDir)) fs.rmSync(tempDownloadDir, { recursive: true, force: true });
fs.mkdirSync(tempDownloadDir, { recursive: true });

const dlRes = spawnSync('gh', ['run', 'download', runId.toString(), '-n', artifactName, '-D', tempDownloadDir], {
  cwd: rootDir, stdio: 'inherit',
});
if (dlRes.status !== 0) {
  console.error(`[ERROR] Failed to download artifact '${artifactName}' from run ${runId}.`);
  process.exit(dlRes.status ?? 1);
}

// 9. Sync into src-tauri/target/release (kill the running app first — the exe locks itself)
if (process.platform === 'win32') {
  console.log('Terminating any running rdo-metalobby instances...');
  spawnSync('taskkill', ['/F', '/IM', 'rdo-metalobby.exe', '/T'], { stdio: 'ignore', shell: true });
}

console.log(`\nSyncing build files into: ${releaseDir}`);

function syncDirectory(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      const sizeMb = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(2);
      console.log(`  -> [SYNCED] ${path.relative(releaseDir, destPath)} (${sizeMb} MB)`);
    }
  }
}

syncDirectory(tempDownloadDir, releaseDir);
try { fs.rmSync(tempDownloadDir, { recursive: true, force: true }); } catch {}

console.log(`\n============================================================`);
console.log(`  [SUCCESS] Target Release Synced!`);
console.log(`  Executable Location: src-tauri\\target\\release\\rdo-metalobby.exe`);
console.log(`  Installers Location: src-tauri\\target\\release\\bundle\\`);
console.log(`============================================================\n`);

// 10. Open Explorer to the release directory
if (process.platform === 'win32') {
  try {
    spawnSync('explorer', [releaseDir], { detached: true, stdio: 'ignore' });
  } catch {}
}
