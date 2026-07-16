import { readFile, writeFile, readdir, mkdir, stat, rename, rm, access } from "node:fs/promises";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { search } from "./glob-util.js";
import type { McpTool } from "./types.js";

export interface BuiltinTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  destructive?: boolean;
  run: (args: Record<string, unknown>) => Promise<{ result: string; isError: boolean }>;
}

function toAbs(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(process.cwd(), p);
}

function truncate(s: string, n = 20000): string {
  return s.length > n ? s.slice(0, n) + `\n...(truncado, ${s.length - n} chars omitidos)` : s;
}

export const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    name: "read_file",
    description:
      "Lê o conteúdo de um arquivo de texto do sistema. Use caminhos absolutos (ex: C:/Users/Eli/foo.txt) ou relativos ao diretório atual.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Caminho do arquivo" } },
      required: ["path"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        const content = await readFile(path, "utf8");
        return { result: truncate(content), isError: false };
      } catch (e) {
        return { result: `Erro ao ler ${path}: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "write_file",
    description:
      "Cria ou sobrescreve um arquivo de texto. Cria diretórios pai se necessário. CUIDADO: sobrescreve arquivos existentes sem aviso.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string", description: "Conteúdo completo do arquivo" },
      },
      required: ["path", "content"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, String(a.content ?? ""), "utf8");
        return { result: `Arquivo escrito: ${path} (${String(a.content ?? "").length} bytes)`, isError: false };
      } catch (e) {
        return { result: `Erro ao escrever ${path}: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "edit_file",
    description:
      "Edita um arquivo substituindo a primeira ocorrência de oldText por newText. Use replaceAll=true para substituir todas.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        oldText: { type: "string", description: "Texto exato a localizar" },
        newText: { type: "string", description: "Texto substituto" },
        replaceAll: { type: "boolean", default: false },
      },
      required: ["path", "oldText", "newText"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        const original = await readFile(path, "utf8");
        const all = Boolean(a.replaceAll);
        let updated: string;
        if (all) {
          updated = original.split(String(a.oldText)).join(String(a.newText));
        } else {
          const idx = original.indexOf(String(a.oldText));
          if (idx === -1) return { result: `oldText não encontrado em ${path}`, isError: true };
          updated = original.slice(0, idx) + String(a.newText) + original.slice(idx + String(a.oldText).length);
        }
        if (updated === original) return { result: `Nenhuma alteração em ${path}`, isError: false };
        await writeFile(path, updated, "utf8");
        return { result: `Editado: ${path}`, isError: false };
      } catch (e) {
        return { result: `Erro ao editar ${path}: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "list_directory",
    description: "Lista arquivos e pastas de um diretório.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Diretório (padrão: cwd)" } },
      required: [],
    },
    run: async (a) => {
      const path = toAbs(String(a.path ?? "."));
      try {
        const entries = await readdir(path, { withFileTypes: true });
        const lines = entries.map((e) => `${e.isDirectory() ? "[DIR] " : "[FILE] "}${e.name}`).sort();
        return { result: lines.length ? lines.join("\n") : "(diretório vazio)", isError: false };
      } catch (e) {
        return { result: `Erro ao listar ${path}: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "create_directory",
    description: "Cria um diretório (e subdiretórios) se não existir.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        await mkdir(path, { recursive: true });
        return { result: `Diretório criado/confirmado: ${path}`, isError: false };
      } catch (e) {
        return { result: `Erro ao criar diretório ${path}: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "move_path",
    description: "Move ou renomeia um arquivo/diretório.",
    inputSchema: {
      type: "object",
      properties: { source: { type: "string" }, destination: { type: "string" } },
      required: ["source", "destination"],
    },
    run: async (a) => {
      const src = toAbs(String(a.source));
      const dst = toAbs(String(a.destination));
      try {
        await mkdir(dirname(dst), { recursive: true });
        await rename(src, dst);
        return { result: `Movido: ${src} -> ${dst}`, isError: false };
      } catch (e) {
        return { result: `Erro ao mover: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "file_info",
    description: "Retorna metadados de um arquivo/diretório (tamanho, datas, tipo).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        const s = await stat(path);
        return {
          result: JSON.stringify(
            {
              path,
              type: s.isDirectory() ? "directory" : "file",
              size: s.size,
              created: s.birthtime.toISOString(),
              modified: s.mtime.toISOString(),
            },
            null,
            2
          ),
          isError: false,
        };
      } catch (e) {
        return { result: `Erro: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "search_files",
    description: "Busca arquivos por padrão glob (ex: '**/*.ts'). Retorna caminhos absolutos.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Diretório base da busca" },
        pattern: { type: "string", description: "Padrão glob, ex: **/*.md" },
      },
      required: ["path", "pattern"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      try {
        const matches = await search(path, String(a.pattern));
        return { result: matches.length ? matches.slice(0, 200).join("\n") : "(nenhum arquivo encontrado)", isError: false };
      } catch (e) {
        return { result: `Erro na busca: ${String(e)}`, isError: true };
      }
    },
  },
  {
    name: "delete_path",
    description:
      "DESTRUTIVO: exclui um arquivo ou diretório. Use recursive=true para diretórios não vazios. Requer confirm=true quando recursive=true. Confirme a necessidade antes de usar.",
    destructive: true,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        recursive: { type: "boolean", default: false, description: "Necessário para diretórios não vazios" },
        confirm: { type: "boolean", default: false, description: "Obrigatório quando recursive=true" },
      },
      required: ["path"],
    },
    run: async (a) => {
      const path = toAbs(String(a.path));
      const recursive = Boolean(a.recursive);
      const confirm = Boolean(a.confirm);
      if (recursive && !confirm) {
        return {
          result:
            "Operação destrutiva em diretório requer confirmação. Rechame com confirm=true após confirmar com o usuário.",
          isError: true,
        };
      }
      try {
        await access(path);
      } catch {
        return { result: `Caminho não existe: ${path}`, isError: true };
      }
      try {
        await rm(path, { recursive, force: false });
        return { result: `Excluído: ${path}`, isError: false };
      } catch (e) {
        return { result: `Erro ao excluir ${path}: ${String(e)}`, isError: true };
      }
    },
  },
];

export function builtinToolsAsMcp(): McpTool[] {
  return BUILTIN_TOOLS.map((t) => ({
    server: "builtin",
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export function isBuiltin(name: string): boolean {
  return BUILTIN_TOOLS.some((t) => t.name === name);
}

export async function runBuiltin(name: string, args: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
  const tool = BUILTIN_TOOLS.find((t) => t.name === name);
  if (!tool) return { result: `ferramenta nativa desconhecida: ${name}`, isError: true };
  return tool.run(args);
}