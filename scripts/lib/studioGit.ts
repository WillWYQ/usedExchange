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
 * The current branch name, or the literal string "HEAD" if HEAD is detached.
 *
 * Deliberately NOT `git rev-parse --abbrev-ref HEAD`: that fails with a raw
 * "fatal: ambiguous argument 'HEAD'" (exit 128) on a freshly-init'd repo with
 * zero commits — an "unborn branch" — because there is no commit for HEAD to
 * resolve to yet. `git symbolic-ref --short HEAD` reads the REF HEAD points
 * at (e.g. "refs/heads/main") rather than resolving it to a commit, so it
 * works on an unborn branch with no special-casing.
 *
 * It cuts the other way on a detached HEAD: there HEAD is not a symbolic ref
 * at all, so `symbolic-ref` fails where rev-parse would have succeeded
 * (returning the literal string "HEAD"). Catching that failure and
 * returning "HEAD" ourselves reproduces the same value rev-parse would have
 * given — "HEAD" is not a legal branch name, so it doubles as an unambiguous
 * sentinel publishChanges uses to refuse committing from a detached HEAD.
 */
async function getBranch(projectRoot: string): Promise<string> {
  try {
    return (await git(projectRoot, ["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return "HEAD";
  }
}

/** True for a git-status path this tool is ever allowed to add, commit, or push. */
function isPublishablePath(p: string): boolean {
  return p === "lib/generated/image-manifest.json" || p === "content" || p.startsWith("content/");
}

/**
 * Commits reachable from HEAD but not yet on the upstream branch. Used to
 * detect a commit stranded by a prior push failure (see publishChanges).
 * Returns 0 — not an error — when there is no upstream to compare against
 * (a branch that has never been pushed): that is a different, pre-existing
 * situation this function does not attempt to fix.
 */
async function countUnpushedCommits(projectRoot: string): Promise<number> {
  try {
    const out = await git(projectRoot, ["rev-list", "--count", "@{upstream}..HEAD"]);
    return Number.parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Pushes HEAD, translating a failure into the same "committed but not
 * pushed" GitError shape regardless of which call site triggered it.
 */
async function pushOrThrowFriendly(projectRoot: string, commit: string): Promise<void> {
  try {
    await git(projectRoot, ["push"]);
  } catch (err: unknown) {
    // The commit already landed (this one, or an earlier stranded one this
    // call is retrying). Say so — "publish failed" alone would send the
    // seller looking for lost work that is safely on disk.
    throw new GitError(
      502,
      `Changes were committed locally as ${commit}, but the push failed:\n${gitMessage(err)}\n` +
        `Your work is saved. Fix the problem and run \`git push\` from a terminal, or try again.`,
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

  let statusRaw: string;
  let branch: string;
  try {
    // --porcelain=v1 pins the format: v2 has a different, longer line shape, and
    // a future git defaulting to it would silently break this parser.
    [statusRaw, branch] = await Promise.all([
      git(projectRoot, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--",
        ...PUBLISHABLE_PATHS,
      ]),
      getBranch(projectRoot),
    ]);
  } catch (err: unknown) {
    // assertRepo only confirms a .git dir exists — a BARE repo has one but no
    // working tree, so `git status` fails here with its own raw "this
    // operation must be run in a work tree". Surfacing that as an
    // uncaught 500 would be exactly the kind of internals-leaking response
    // this module exists to avoid; translate it into the same 400 shape as
    // "not a git repository" — from the seller's side, both mean "publish
    // has nothing usable to point at here".
    throw new GitError(
      400,
      `${projectRoot} has no working tree to publish from: ${gitMessage(err)}`,
    );
  }

  return { branch, files: parseStatusZ(statusRaw) };
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

  const { branch, files } = await readChanges(projectRoot);

  // A commit made from a detached HEAD belongs to no branch. It would still
  // land and still push (to whatever `git push`'s default resolves to, which
  // is itself unreliable detached), but it becomes reachable only through the
  // reflog — invisible the moment the seller checks out a branch, with no
  // warning that anything was lost. Refuse before committing, not after.
  if (branch === "HEAD") {
    throw new GitError(
      400,
      `${projectRoot} has a detached HEAD, so a commit here would not belong to any branch ` +
        `and could be lost the moment you check one out. Run \`git checkout <branch>\` first.`,
    );
  }

  if (files.length === 0) {
    // The working tree matches HEAD, but a PRIOR publish can have committed
    // locally and then failed to push (see the 502 below) — that commit is
    // real, and a seller has no way to discover or resend it short of a
    // terminal. Treat it as unfinished work to finish, not as "nothing to
    // publish": otherwise every retry after a transient network failure
    // reports 409 forever while the live site stays stale.
    const unpushed = await countUnpushedCommits(projectRoot);
    if (unpushed > 0) {
      const commit = (await git(projectRoot, ["rev-parse", "--short", "HEAD"])).trim();
      await pushOrThrowFriendly(projectRoot, commit);
      return { commit, files: [] };
    }
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
  const stagedRaw = await git(projectRoot, ["diff", "--cached", "--name-only", "-z"]);
  const staged = stagedRaw.split("\0").filter((p) => p !== "");
  if (staged.length === 0) {
    throw new GitError(409, "nothing to publish — no changes could be staged");
  }

  // `git add` names its own paths, but `git commit` has no pathspec here, so
  // it commits EVERYTHING already in the index — not just what the `add`
  // above staged. A file staged out-of-band before publishChanges ever ran
  // (an interrupted `pnpm push`, a `git add -p` session, an agent that staged
  // something, one bad .gitignore) rides along into the commit and the push
  // silently, while the return value still reports only the safe files this
  // function meant to ship. This is the exact failure "git add never -A" (see
  // the header) exists to prevent, reached through a second door: naming
  // paths on `add` is necessary but not sufficient when the index can already
  // hold something else. Refusing here, before any commit exists, is what
  // closes it — by the time this check passes, the entire staged set (which
  // is what `git commit` is about to commit, unscoped) is known-safe.
  const disallowed = staged.filter((p) => !isPublishablePath(p));
  if (disallowed.length > 0) {
    throw new GitError(
      409,
      `refusing to publish: ${disallowed.join(", ")} ${
        disallowed.length === 1 ? "is" : "are"
      } staged outside content/ and the manifest. Unstage ${
        disallowed.length === 1 ? "it" : "them"
      } first (\`git restore --staged -- <path>\`), then try again.`,
    );
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
  await pushOrThrowFriendly(projectRoot, commit);

  return { commit, files };
}
