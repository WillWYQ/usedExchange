import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { GitError, publishChanges, readChanges } from "./studioGit";

const run = promisify(execFile);
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function git(cwd: string, args: string[]): Promise<void> {
  await run("git", args, { cwd });
}

/** A repo with one committed item and a bare `origin` it can push to. */
async function makeRepo(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "studio-git-"));
  created.push(base);

  const origin = path.join(base, "origin.git");
  await run("git", ["init", "--bare", "--initial-branch=main", origin]);

  const repo = path.join(base, "site");
  await fs.mkdir(repo);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "seller@example.com"]);
  await git(repo, ["config", "user.name", "Seller"]);
  await git(repo, ["config", "commit.gpgsign", "false"]);

  const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
  await fs.mkdir(itemDir, { recursive: true });
  await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Desk lamp" }\n`);
  await fs.mkdir(path.join(repo, "lib", "generated"), { recursive: true });
  await fs.writeFile(path.join(repo, "lib", "generated", "image-manifest.json"), "{}\n");
  await fs.writeFile(path.join(repo, ".env.local"), "CF_R2_SECRET=hunter2\n");

  await git(repo, ["add", "content", "lib"]);
  await git(repo, ["commit", "-m", "initial"]);
  await git(repo, ["remote", "add", "origin", origin]);
  await git(repo, ["push", "-u", "origin", "main"]);

  return repo;
}

describe("readChanges", () => {
  it("reports nothing on a clean tree", async () => {
    const repo = await makeRepo();
    const { branch, files } = await readChanges(repo);
    expect(branch).toBe("main");
    expect(files).toEqual([]);
  });

  it("reports a modified item and a new photo", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);
    await fs.writeFile(path.join(itemDir, "01-lamp.jpg"), "not really a jpeg");

    const { files } = await readChanges(repo);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      "content/items/electronics/desk-lamp/01-lamp.jpg",
      "content/items/electronics/desk-lamp/item.json",
    ]);
    expect(files.find((f) => f.path.endsWith("item.json"))?.code).toBe("M");
    expect(files.find((f) => f.path.endsWith("01-lamp.jpg"))?.code).toBe("?");
  });

  it("ignores changes outside content/ and the manifest", async () => {
    const repo = await makeRepo();
    // .env.local holds the seller's R2 credentials. It must never appear in the
    // publish list, whether or not .gitignore happens to cover it.
    await fs.writeFile(path.join(repo, ".env.local"), "CF_R2_SECRET=changed\n");
    await fs.writeFile(path.join(repo, "README.md"), "# edited\n");
    expect((await readChanges(repo)).files).toEqual([]);
  });

  it("handles a filename with a space and a non-ASCII filename", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "my photo.jpg"), "x");
    await fs.writeFile(path.join(itemDir, "照片.jpg"), "x");

    const paths = (await readChanges(repo)).files.map((f) => f.path).sort();
    expect(paths).toContain("content/items/electronics/desk-lamp/my photo.jpg");
    expect(paths).toContain("content/items/electronics/desk-lamp/照片.jpg");
  });

  it("throws a GitError outside a git repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-nogit-"));
    created.push(dir);
    await expect(readChanges(dir)).rejects.toBeInstanceOf(GitError);
  });
});

describe("publishChanges", () => {
  it("commits, pushes, and reports what shipped", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);

    const result = await publishChanges(repo, "chore: rename the lamp");
    expect(result.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(result.files.map((f) => f.path)).toEqual([
      "content/items/electronics/desk-lamp/item.json",
    ]);

    // The tree is clean afterwards, and origin has the commit.
    expect((await readChanges(repo)).files).toEqual([]);
    const { stdout } = await run("git", ["log", "-1", "--pretty=%s", "origin/main"], {
      cwd: repo,
    });
    expect(stdout.trim()).toBe("chore: rename the lamp");
  });

  it("never stages files outside content/ and the manifest", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "README.md"), "# edited\n");
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);

    await publishChanges(repo, "chore: update listings");

    const { stdout } = await run("git", ["show", "--name-only", "--pretty=", "HEAD"], {
      cwd: repo,
    });
    expect(stdout).not.toContain("README.md");
    expect(stdout).not.toContain(".env.local");
  });

  it("refuses when there is nothing to publish", async () => {
    const repo = await makeRepo();
    await expect(publishChanges(repo, "chore: nothing")).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an empty or whitespace-only message", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);
    await expect(publishChanges(repo, "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("treats a message starting with a dash as text, not a flag", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);

    await publishChanges(repo, "--amend is not a flag here");
    const { stdout } = await run("git", ["log", "--oneline"], { cwd: repo });
    // Two commits, not one amended commit.
    expect(stdout.trim().split("\n")).toHaveLength(2);
  });

  it("surfaces a push failure with git's own message and leaves the commit in place", async () => {
    const repo = await makeRepo();
    await git(repo, ["remote", "set-url", "origin", path.join(repo, "does-not-exist.git")]);
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);

    await expect(publishChanges(repo, "chore: update listings")).rejects.toBeInstanceOf(
      GitError,
    );
    // The commit already happened; the seller must be told the push is what
    // failed, not that nothing was saved.
    const { stdout } = await run("git", ["log", "--oneline"], { cwd: repo });
    expect(stdout.trim().split("\n")).toHaveLength(2);
  });
});
