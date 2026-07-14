import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { join as pjoin } from "node:path";

export interface Skill {
  name: string;
  title: string;
  path: string;
  content: string;
}

const USER_SKILLS_DIR = join(homedir(), ".siliconflower", "skills");

export function skillsDir(): string {
  return USER_SKILLS_DIR;
}

export async function ensureBuiltinSkills(): Promise<void> {
  // shipped example skills live next to the running module under ../skills
  // we only ensure the user dir exists here; examples are copied on demand via CLI cmd 'skills sync'
  await mkdir(USER_SKILLS_DIR, { recursive: true });
}

export async function loadSkills(): Promise<Skill[]> {
  await mkdir(USER_SKILLS_DIR, { recursive: true });
  const out: Skill[] = [];
  let names: string[] = [];
  try {
    names = await readdir(USER_SKILLS_DIR);
  } catch {
    return out;
  }
  for (const n of names) {
    if (!n.toLowerCase().endsWith(".md")) continue;
    const path = pjoin(USER_SKILLS_DIR, n);
    try {
      const content = await readFile(path, "utf8");
      const name = n.replace(/\.md$/i, "");
      const title = extractTitle(content) ?? "";
      out.push({ name, title, path, content });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function extractTitle(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const l of lines) {
    const m = /^#\s+(.+)$/.exec(l.trim());
    if (m) return m[1].trim();
  }
  // fallback: first non-empty line
  for (const l of lines) {
    const t = l.trim();
    if (t) return t.slice(0, 80);
  }
  return null;
}

export async function readSkillContent(name: string): Promise<string> {
  const safe = name.replace(/\.md$/i, "") + ".md";
  const path = pjoin(USER_SKILLS_DIR, safe);
  return readFile(path, "utf8");
}

export const SKILL_TOOL = {
  name: "read_skill",
  description:
    "Lê o conteúdo completo de uma skill (.md) carregada pelo usuário para aplicar suas instruções especializadas.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "Nome da skill (sem .md)" } },
    required: ["name"],
  },
};
