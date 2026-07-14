#!/usr/bin/env bun
import { Command } from "commander";
import { configExists, loadConfig, configFile, configDir } from "./config.js";
import { ensureConfig, runSetup } from "./wizard.js";
import { startApp } from "./App.js";
import type { Mode, ReasoningLevel } from "./types.js";
import { REASONING_LEVELS } from "./types.js";
import { MODES } from "./modes.js";
import { skillsDir, loadSkills } from "./skills.js";
import { logFile, tailLogs } from "./logger.js";
import { log } from "./logger.js";

const program = new Command();

program
  .name("siliconflower")
  .description("Agente de IA CLI com MCP, reasoning, skills, modos e backends OpenAI/Anthropic-compatible.")
  .version("0.1.0")
  .option("-m, --model <id>", "sobrescrever o modelo")
  .option("-r, --reasoning <level>", `nível de reasoning: ${REASONING_LEVELS.join(", ")}`)
  .option("--mode <mode>", `modo: ${MODES.join(", ")}`)
  .option("--provider <type>", "forçar provider: openai | anthropic")
  .option("--base-url <url>", "sobrescrever a URL base da API")
  .option("--api-key <key>", "sobrescrever a API key")
  .action(async (opts) => {
    const exists = await configExists();
    if (!exists) {
      const cfg = await runSetup(null);
      startApp(cfg, { model: opts.model, reasoning: normalizeReasoning(opts.reasoning), mode: normalizeMode(opts.mode) });
      return;
    }
    let config = await loadConfig();
    if (!config) config = await runSetup(null);
    const overrides: { model?: string; reasoning?: ReasoningLevel; mode?: Mode } = {};
    if (opts.model) overrides.model = opts.model;
    if (opts.reasoning) overrides.reasoning = normalizeReasoning(opts.reasoning);
    if (opts.mode) overrides.mode = normalizeMode(opts.mode);
    if (opts.provider) config!.provider = opts.provider === "anthropic" ? "anthropic" : "openai";
    if (opts.baseUrl) config!.baseURL = opts.baseUrl;
    if (opts.apiKey) config!.apiKey = opts.apiKey;
    await log("info", "=== siliconflower iniciado por CLI ===");
    startApp(config!, overrides);
  });

program
  .command("config")
  .description("Reexecutar a configuração inicial")
  .action(async () => {
    const existing = await loadConfig();
    await runSetup(existing);
    console.log("Pronto. Execute 'siliconflower' para conversar.");
  });

program
  .command("show")
  .description("Mostrar o caminho e conteúdo da configuração atual")
  .action(async () => {
    console.log("Caminho:", configFile());
    console.log("Diretório:", configDir());
    const cfg = await loadConfig();
    if (!cfg) {
      console.log("Nenhuma configuração encontrada. Execute 'siliconflower config'.");
      return;
    }
    const masked = { ...cfg, apiKey: cfg.apiKey ? "••••" + cfg.apiKey.slice(-4) : "" };
    console.log(JSON.stringify(masked, null, 2));
  });

program
  .command("ensure")
  .description("Criar configuração se ausente e sair")
  .action(async () => {
    await ensureConfig();
  });

program
  .command("skills")
  .description("Listar skills (.md) disponíveis")
  .action(async () => {
    console.log("Diretório de skills:", skillsDir());
    const skills = await loadSkills();
    if (!skills.length) {
      console.log("Nenhuma skill encontrada. Coloque arquivos .md em:", skillsDir());
      return;
    }
    for (const s of skills) {
      console.log(`- ${s.name}${s.title ? `  — ${s.title}` : ""}`);
    }
  });

program
  .command("logs")
  .description("Mostrar as últimas linhas do log")
  .option("-n, --lines <n>", "quantidade de linhas", "50")
  .action(async (opts) => {
    console.log("Arquivo de log:", logFile());
    const n = parseInt(opts.lines, 10) || 50;
    const tail = await tailLogs(n);
    console.log(tail);
  });

function normalizeReasoning(v: string | undefined): ReasoningLevel | undefined {
  if (!v) return undefined;
  const lower = v.toLowerCase() as ReasoningLevel;
  return REASONING_LEVELS.includes(lower) ? lower : undefined;
}

function normalizeMode(v: string | undefined): Mode | undefined {
  if (!v) return undefined;
  const lower = v.toLowerCase();
  return (MODES as string[]).includes(lower) ? (lower as Mode) : undefined;
}

program.parseAsync(process.argv);
