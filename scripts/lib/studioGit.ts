// The publish half of Seller Studio: what has changed, and commit + push it.
//
// Two rules that are not stylistic:
//
//   1. `git add` names its paths. Never `-A`. The seller's .env.local holds R2
//      credentials, and one bad .gitignore away, -A publishes them to a public
//      repo. The path list matches package.json's `pnpm push` script exactly,
//      so the CLI and studio ship the same thing.
//   2. Every git invocation goes through execFile with an argument array — no
//      shell, ever. The commit message is seller input.
//
// Note git is invoked with `-c core.quotepath=false` and `-z` where output is
// parsed: without them a filename with a space or a CJK character comes back
// quoted and octal-escaped, and the seller's photo silently drops out of the
// change list.

import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

/** Paths studio is allowed to publish. Mirrors package.json's `push` script. */
const PUBLISHABLE_PATHS = ["content", "lib/generated/image-manifest.json"] as const;

const MAX_MESSAGE_LENGTH = 500;

export type ChangedFile = {
  /** Porcelain status letter: M, A, D, R, or "?" for untracked. */
  code: string;
  /** Repo-relative, forward-slashed, unquoted. */
  path: string;
};

export class GitError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

type ExecFailure = { stderr?: string; stdout?: string; message?: string };

function gitMessage(err: unknown): string {
  const e = err as ExecFailure;
  const text = (e.stderr ?? "").trim() || (e.stdout ?? "").trim() || (e.message ?? "");
  return text || String(err);
}

async function git(cwd: string, args: string[], stdin?: string): Promise<string> {
  const child = run("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (stdin !== undefined) {
    child.child.stdin?.end(stdin);
  }
  const { stdout } = await child;
  return stdout;
}

async function assertRepo(projectRoot: string): Promise<void> {
  try {
    await git(projectRoot, ["rev-parse", "--git-dir"]);
  } catch {
    throw new GitError(
      400,
      `${projectRoot} is not a git repository, so there is nothing to publish. ` +
        `Run \`git init\` and add a remote first — see docs/setup_instruction.md.`,
    );
  }
}

/**
 * Splits `git status -z` output. Entries are NUL-terminated; a rename entry is
 * followed by a SECOND NUL-terminated field holding the original path, which
 * must be consumed or it is misread as a file of its own.
 *
 * Verified against git on this machine — with NUL rendered as `|`:
 *
 *   " M content/…/item.json|?? content/…/my photo.jpg|?? content/…/照片.jpg|"
 *   "RM content/…/item2.json|content/…/item.json|"      <- rename: two fields
 *
 * Note the space-padded status column (" M", not "M"), and that a filename
 * containing a space needs no special handling because -z never quotes.
 */
function parseStatusZ(raw: string): ChangedFile[] {
  const parts = raw.split("\0").filter((p) => p !== "");
  const files: ChangedFile[] = [];

  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry === undefined || entry.length < 4) continue;

    // "XY <path>" — two status columns, a space, then the path.
    const x = entry[0] ?? " ";
    const y = entry[1] ?? " ";
    const filePath = entry.slice(3);

    // Prefer the staged column when it says something, else the worktree one.
    const code = x !== " " && x !== "?" ? x : y === "?" || x === "?" ? "?" : y;
    files.push({ code, path: filePath });

    // A rename's original path is the next NUL-separated field. Skip it.
    if (x === "R" || y === "R") i++;
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The current branch plus every publishable path that differs from HEAD. */
export async function readChanges(
  projectRoot: string,
): Promise<{ branch: string; files: ChangedFile[] }> {
  await assertRepo(projectRoot);

  // --porcelain=v1 pins the format: v2 has a different, longer line shape, and
  // a future git defaulting to it would silently break this parser.
  const [statusRaw, branchRaw] = await Promise.all([
    git(projectRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ...PUBLISHABLE_PATHS,
    ]),
    git(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);

  return { branch: branchRaw.trim(), files: parseStatusZ(statusRaw) };
}

/**
 * Stages the publishable paths, commits with `message`, and pushes.
 *
 * The change list is re-read here rather than taken from the caller: the seller
 * approved a diff, and between their click and this call a photo can land or a
 * file can change. Re-reading means the returned list is what actually shipped.
 */
export async function publishChanges(
  projectRoot: string,
  message: string,
): Promise<{ commit: string; files: ChangedFile[] }> {
  const trimmed = message.trim();
  if (trimmed === "") {
    throw new GitError(400, "a commit message is required");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new GitError(400, `commit message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  if (trimmed.includes("\0")) {
    throw new GitError(400, "commit message must not contain NUL bytes");
  }

  const { files } = await readChanges(projectRoot);
  if (files.length === 0) {
    throw new GitError(409, "nothing to publish — content/ matches the last commit");
  }

  try {
    await git(projectRoot, ["add", "--", ...PUBLISHABLE_PATHS]);
  } catch (err: unknown) {
    throw new GitError(500, `git add failed: ${gitMessage(err)}`);
  }

  // Staging can still come out empty — e.g. every change was to a .gitignored
  // path that `git status` reported as untracked-but-ignored. Committing then
  // would fail with git's own confusing "nothing added" text.
  const staged = await git(projectRoot, ["diff", "--cached", "--name-only", "-z"]);
  if (staged.split("\0").filter((p) => p !== "").length === 0) {
    throw new GitError(409, "nothing to publish — no changes could be staged");
  }

  try {
    // -F - reads the message from stdin. Not `-m`: a message beginning with a
    // dash is a plausible thing for a seller to type, and stdin removes any
    // question of it being read as an option.
    await git(projectRoot, ["commit", "-F", "-"], trimmed);
  } catch (err: unknown) {
    throw new GitError(500, `git commit failed: ${gitMessage(err)}`);
  }

  const commit = (await git(projectRoot, ["rev-parse", "--short", "HEAD"])).trim();

  try {
    await git(projectRoot, ["push"]);
  } catch (err: unknown) {
    // The commit already landed. Say so — "publish failed" alone would send the
    // seller looking for lost work that is safely on disk.
    throw new GitError(
      502,
      `Changes were committed locally as ${commit}, but the push failed:\n${gitMessage(err)}\n` +
        `Your work is saved. Fix the problem and run \`git push\` from a terminal, or try again.`,
    );
  }

  return { commit, files };
}
