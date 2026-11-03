// Pure helpers, kept free of the vscode API so they can be tested with plain node.

/**
 * Turn a git remote URL into an https web base URL.
 * Handles scp-style (git@host:owner/repo.git), ssh://, git://, and http(s) remotes.
 */
function remoteToWebBase(remoteUrl) {
  let url = remoteUrl.trim();
  let host;
  let repoPath;

  const scp = url.match(/^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/);
  if (scp) {
    host = scp[1];
    repoPath = scp[2];
  } else {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Unrecognized remote URL: ${remoteUrl}`);
    }
    // ssh ports (e.g. :2222) aren't the web port, so drop them for non-http remotes.
    host = parsed.protocol.startsWith("http") ? parsed.host : parsed.hostname;
    repoPath = parsed.pathname;
  }

  repoPath = repoPath.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
  return { host, base: `https://${host}/${repoPath}` };
}

/** Build a permalink for a file at a commit, for lines startLine..endLine (1-based). */
function buildPermalink({ remoteUrl, commit, relPath, startLine, endLine }) {
  const { host, base } = remoteToWebBase(remoteUrl);
  const isGitLab = /gitlab/i.test(host);
  const encodedPath = relPath.split("/").map(encodeURIComponent).join("/");

  let anchor = `#L${startLine}`;
  if (endLine && endLine !== startLine) {
    anchor += isGitLab ? `-${endLine}` : `-L${endLine}`;
  }

  // plain=1 shows source instead of the rendered view (Markdown etc.) so line anchors work.
  const blob = isGitLab ? "-/blob" : "blob";
  return `${base}/${blob}/${commit}/${encodedPath}?plain=1${anchor}`;
}

module.exports = { remoteToWebBase, buildPermalink };
