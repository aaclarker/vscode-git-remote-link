const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { buildPermalink } = require("./lib");

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

/** The remote the current branch tracks, falling back to "origin". */
async function upstreamRemote(cwd) {
  try {
    const remote = await git(cwd, ["config", "--get", `branch.${await git(cwd, ["symbolic-ref", "--short", "HEAD"])}.remote`]);
    if (remote && remote !== ".") return remote;
  } catch {
    // Detached HEAD or no upstream configured.
  }
  return "origin";
}

/** Build the permalink for the active editor's cursor/selection, warning if it may be stale. */
async function currentPermalink() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    throw new Error("no saved file is active.");
  }

  const filePath = fs.realpathSync(editor.document.uri.fsPath);
  const cwd = path.dirname(filePath);

  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  const commit = await git(cwd, ["rev-parse", "HEAD"]);
  const remote = await upstreamRemote(cwd);
  const remoteUrl = await git(cwd, ["remote", "get-url", remote]);
  const relPath = path.relative(fs.realpathSync(root), filePath).split(path.sep).join("/");

  const sel = editor.selection;
  let endLine = sel.end.line;
  // A selection ending at column 0 doesn't really include that line.
  if (endLine > sel.start.line && sel.end.character === 0) endLine--;

  const url = buildPermalink({
    remoteUrl,
    commit,
    relPath,
    startLine: sel.start.line + 1,
    endLine: endLine + 1,
  });

  const pushed = await git(cwd, ["branch", "-r", "--contains", commit]).catch(() => "");
  if (!pushed) {
    vscode.window.showWarningMessage(
      `Commit ${commit.slice(0, 7)} isn't on any remote branch yet, so the link may 404 until you push.`
    );
  }
  const changed = await git(root, ["diff", "--quiet", "HEAD", "--", relPath]).then(() => false, () => true);
  if (editor.document.isDirty || changed) {
    vscode.window.showWarningMessage("File differs from HEAD; line numbers may not match the remote.");
  }

  return url;
}

async function openLine() {
  try {
    await vscode.env.openExternal(vscode.Uri.parse(await currentPermalink()));
  } catch (err) {
    vscode.window.showErrorMessage(`Open in remote: ${err.message}`);
  }
}

async function copyLine() {
  try {
    await vscode.env.clipboard.writeText(await currentPermalink());
    vscode.window.setStatusBarMessage("$(check) Copied remote permalink", 3000);
  } catch (err) {
    vscode.window.showErrorMessage(`Copy remote permalink: ${err.message}`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitRemoteLink.open", openLine),
    vscode.commands.registerCommand("gitRemoteLink.copy", copyLine)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
