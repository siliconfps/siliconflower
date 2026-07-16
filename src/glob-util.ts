import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

function globToRegex(pattern: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && i + 1 < pattern.length && pattern[i + 1] === "*") {
      re += ".*";
      i += 2;
    } else if (ch === "*") {
      re += "[^/]*";
      i++;
    } else if (ch === "?") {
      re += "[^/]";
      i++;
    } else if (".+()[]{}^$|\\".includes(ch)) {
      re += "\\" + ch;
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  re += "$";
  return new RegExp(re);
}

export async function search(root: string, pattern: string): Promise<string[]> {
  const base = await safeStat(root);
  if (!base || !base.isDirectory()) {
    return [];
  }
  const results: string[] = [];
  const re = globToRegex(pattern);
  const limit = 1000;

  async function walk(dir: string, depth: number) {
    if (results.length >= limit) return;
    if (depth > 12) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= limit) return;
      if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      const rel = relative(root, full).replace(/\\/g, "/");
      if (re.test(rel)) results.push(full);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return results;
}

async function safeStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}
