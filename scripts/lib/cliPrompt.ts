// scripts/lib/cliPrompt.ts
//
// Piping answers into an interactive CLI script (e.g. `printf '2\ntitle\n...'
// | pnpm bump`) used to crash with ERR_USE_AFTER_CLOSE: readline drains a
// fully-buffered, non-TTY stdin and auto-closes the instant it hits EOF,
// which can happen before the script's first ask() call ever runs. Attaching
// readline only for a real TTY — and otherwise answering prompts from a
// pre-read line queue — avoids that crash. Extracted from
// scripts/bump-version.ts (where this was first fixed) so
// scripts/export-facebook.ts, and any future interactive script, share the
// same fix instead of re-implementing it.
//
// Constraint this carries: loadPipedInput reads all of stdin to EOF before
// ask() answers even its first prompt. That's fine for a feeder that writes
// every answer up front and then closes the pipe (`printf '...' | pnpm bump`)
// — but a feeder that writes answers incrementally while holding the pipe
// open will see no prompts and an apparently frozen process until it finally
// closes stdin, a hang instead of the old crash. Piped input must be fully
// buffered before the pipe closes.

import * as readline from "readline";

export type CliPrompt = {
  ask(prompt: string): Promise<string>;
  closeInput(): void;
};

export function createPrompt(): CliPrompt {
  const rl = process.stdin.isTTY
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  let pipedLines: string[] | null = null;
  let pipedIndex = 0;

  async function loadPipedInput(): Promise<string[]> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const lines = Buffer.concat(chunks).toString("utf-8").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  async function ask(prompt: string): Promise<string> {
    if (rl) {
      return new Promise((resolve) => rl.question(prompt, (a) => resolve(a.trim())));
    }
    if (pipedLines === null) pipedLines = await loadPipedInput();
    const raw = pipedLines[pipedIndex];
    if (raw === undefined) {
      console.error(`\n  ✗ Ran out of piped input at prompt: "${prompt.trim()}"`);
      process.exit(1);
    }
    pipedIndex++;
    const line = raw.trim();
    console.log(`${prompt}${line}`);
    return line;
  }

  function closeInput(): void {
    rl?.close();
  }

  return { ask, closeInput };
}
