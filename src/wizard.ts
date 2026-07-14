import { select, input, password, editor, confirm } from "@inquirer/prompts";
import { saveConfig, presets, loadConfig, configFile, configDir } from "./config.js";
import type { AppConfig, McpServerConfig, Provider, ReasoningLevel } from "./types.js";
import { REASONING_LEVELS } from "./types.js";

const LABELS: Record<ReasoningLevel, string> = {
  none: "Nenhum (sem pensamento)",
  low: "Baixo (rápido)",
  medium: "Médio (equilibrado)",
  high: "Alto (profundo)",
};

export async function runSetup(existing: AppConfig | null): Promise<AppConfig> {
  console.clear();
  console.log("\n\x1b[35m SILICONFLOWER \x1b[0m — configuração inicial\n");

  const provider = (await select<Provider>({
    message: "Variante do modelo (API format):",
    default: existing?.provider ?? "openai",
    choices: [
      { name: presets().openai.label, value: "openai" },
      { name: presets().anthropic.label, value: "anthropic" },
    ],
  })) as Provider;

  const preset = presets()[provider];

  const baseURL = await input({
    message: "URL base da API (compatível):",
    default: existing?.baseURL || preset.baseURL,
  });

  let apiKey = "";
  if (existing?.apiKey) {
    const keep = await confirm({
      message: `Manter a API Key existente (${existing.apiKey.slice(-4).padStart(existing.apiKey.length, "•")})?`,
      default: true,
    });
    if (keep) {
      apiKey = existing.apiKey;
    } else {
      apiKey = await password({ message: "API Key:", mask: "*" });
    }
  } else {
    apiKey = await password({ message: "API Key:", mask: "*" });
  }

  const model = await input({
    message: "Identificação / modelo da IA:",
    default: existing?.model || "",
    validate: (v) => (v.trim() ? true : "Informe um modelo"),
  });

  const reasoning = (await select<ReasoningLevel>({
    message: "Nível de reasoning padrão:",
    default: existing?.reasoning ?? "high",
    choices: REASONING_LEVELS.map((l) => ({ name: `${l} — ${LABELS[l]}`, value: l })),
  })) as ReasoningLevel;

  const useSystem = await confirm({
    message: "Definir um system prompt opcional?",
    default: Boolean(existing?.system),
  });
  let system: string | undefined = existing?.system;
  if (useSystem) {
    if (existing?.system) {
      const reuse = await confirm({ message: "Reutilizar o system prompt existente?", default: true });
      if (!reuse) system = await editor({ message: "System prompt:", default: existing.system });
    } else {
      system = await editor({ message: "System prompt:" });
    }
  }

  const mcpServers: Record<string, McpServerConfig> = { ...(existing?.mcpServers ?? {}) };
  let addMcp = await confirm({
    message: "Adicionar um servidor MCP agora? (poderá editar depois)",
    default: false,
  });
  while (addMcp) {
    const name = await input({ message: "Nome do servidor MCP:", validate: (v) => (v.trim() ? true : "obrigatório") });
    const command = await input({ message: "Comando:", default: "npx", validate: (v) => (v.trim() ? true : "obrigatório") });
    const argsRaw = await input({ message: "Argumentos (separados por espaço):", default: "-y @modelcontextprotocol/server-filesystem C:/" });
    mcpServers[name.trim()] = {
      command: command.trim(),
      args: argsRaw.trim() ? argsRaw.trim().split(/\s+/) : [],
    };
    addMcp = await confirm({ message: "Adicionar outro servidor MCP?", default: false });
  }

  const finalKey = (apiKey || (existing?.apiKey ?? "")).trim();

  const config: AppConfig = {
    provider,
    baseURL: baseURL.trim(),
    apiKey: finalKey.trim(),
    model: model.trim(),
    reasoning,
    system: system?.trim() || undefined,
    mcpServers,
  };

  await saveConfig(config);
  console.log(`\n\x1b[32m✓ Configuração salva em ${configFile()}\x1b[0m`);
  console.log(`  Diretório: ${configDir()}\n`);
  return config;
}

export async function ensureConfig(): Promise<AppConfig> {
  const existing = await loadConfig();
  if (existing && existing.apiKey && existing.baseURL && existing.model) {
    return existing;
  }
  return runSetup(existing);
}
