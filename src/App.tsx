import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { renderLogo } from "./ascii.js";
import { streamChat } from "./llm.js";
import { McpManager } from "./mcp.js";
import { builtinToolsAsMcp, isBuiltin, runBuiltin } from "./tools.js";
import { loadSkills, readSkillContent, SKILL_TOOL, type Skill } from "./skills.js";
import { buildSystemPrompt, modeLabel, nextMode, type Mode } from "./modes.js";
import { log, logFile, type LogLevel } from "./logger.js";
import type { AppConfig, ChatMessage, McpTool, ReasoningLevel, StreamEvent } from "./types.js";
import { REASONING_LEVELS } from "./types.js";

const REASONING_LABEL: Record<ReasoningLevel, string> = {
  none: "off",
  low: "low",
  medium: "med",
  high: "high",
};

interface AppProps {
  config: AppConfig;
  overrides: { model?: string; reasoning?: ReasoningLevel; mode?: Mode };
}

interface UIMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  toolName?: string;
}

const App: React.FC<AppProps> = ({ config, overrides }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cols, rows] = [stdout?.columns ?? 100, stdout?.rows ?? 40];
  const [model] = useState(overrides.model ?? config.model);
  const [reasoning, setReasoning] = useState<ReasoningLevel>(overrides.reasoning ?? config.reasoning);
  const [mode, setMode] = useState<Mode>(overrides.mode ?? config.mode ?? "programação");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveThinking, setLiveThinking] = useState("");
  const [lastThinking, setLastThinking] = useState("");
  const [status, setStatus] = useState("pronto");
  const [mcpCount, setMcpCount] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mcpRef = useRef<McpManager | null>(null);
  const skillsRef = useRef<Skill[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const { art, color } = renderLogo();

  // boot: MCP + skills
  useEffect(() => {
    const mcp = new McpManager();
    mcpRef.current = mcp;
    (async () => {
      const loaded = await loadSkills();
      skillsRef.current = loaded;
      setSkills(loaded);
      await log("info", `siliconflower iniciado — provider=${config.provider} model=${model}`);
      await log("info", `skills carregadas: ${loaded.length} (${loaded.map((s) => s.name).join(", ") || "nenhuma"})`);
      setStatus("conectando MCP…");
      try {
        const tools = await mcp.connectAll(config.mcpServers);
        setMcpCount(tools.length);
        await log("ok", `MCP conectado: ${mcp.serverCount()} servidores, ${tools.length} ferramentas`);
        setStatus(tools.length ? "pronto" : "pronto (sem MCP)");
      } catch (e) {
        await log("warn", `MCP indisponível: ${String(e)}`);
        setStatus("MCP indisponível");
      }
    })();
    return () => {
      mcp.close();
      abortRef.current?.abort();
      void log("info", "siliconflower encerrado").then(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleReasoning = useCallback(() => {
    setReasoning((r) => {
      const idx = REASONING_LEVELS.indexOf(r);
      const next = REASONING_LEVELS[(idx + 1) % REASONING_LEVELS.length];
      void log("info", `reasoning alterado: ${r} -> ${next}`);
      return next;
    });
  }, []);

  const cycleMode = useCallback(() => {
    setMode((m) => {
      const n = nextMode(m);
      void log("info", `modo alterado: ${m} -> ${n}`);
      return n;
    });
  }, []);

  useInput((ch, key) => {
    const c = ch.toLowerCase();
    if (key.ctrl && c === "e") {
      cycleReasoning();
    } else if (key.ctrl && c === "m") {
      cycleMode();
    } else if (key.ctrl && c === "c") {
      if (streaming) {
        abortRef.current?.abort();
        setStatus("cancelado");
        void log("warn", "stream cancelado pelo usuário");
      } else {
        exit();
      }
    }
  });

  const allTools = useCallback((): McpTool[] => {
    const mcp = mcpRef.current;
    const list: McpTool[] = [...builtinToolsAsMcp()];
    list.push({ server: "skill", name: SKILL_TOOL.name, description: SKILL_TOOL.description, inputSchema: SKILL_TOOL.inputSchema });
    if (mcp) list.push(...mcp.allTools());
    return list;
  }, []);

  const executeTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<{ result: string; isError: boolean }> => {
      const argsStr = JSON.stringify(args).slice(0, 500);
      if (name === SKILL_TOOL.name) {
        try {
          const content = await readSkillContent(String(args.name ?? ""));
          await log("tool", `read_skill(${args.name}) [${content.length} chars]`);
          return { result: content, isError: false };
        } catch (e) {
          await log("error", `read_skill falhou: ${String(e)}`);
          return { result: String(e), isError: true };
        }
      }
      if (isBuiltin(name)) {
        await log("tool", `${name}(${argsStr})`);
        const r = await runBuiltin(name, args);
        await log(r.isError ? "error" : "ok", `${name} ${r.isError ? "FALHOU" : "ok"}: ${r.result.slice(0, 200)}`);
        return r;
      }
      const mcp = mcpRef.current;
      if (mcp) {
        await log("tool", `[mcp] ${name}(${argsStr})`);
        try {
          const result = await mcp.callTool(name, args);
          await log("ok", `[mcp] ${name} ok: ${result.slice(0, 200)}`);
          return { result, isError: false };
        } catch (e) {
          await log("error", `[mcp] ${name} falhou: ${String(e)}`);
          return { result: String(e), isError: true };
        }
      }
      await log("error", `ferramenta não encontrada: ${name}`);
      return { result: `ferramenta não encontrada: ${name}`, isError: true };
    },
    []
  );

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setError(null);
      const userMsg: UIMessage = { role: "user", content: text.trim() };
      const history: ChatMessage[] = [
        ...messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            reasoning: m.reasoning,
          })),
        { role: "user" as const, content: text.trim() },
      ];
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setStreaming(true);
      setLiveText("");
      setLiveThinking("");
      setStatus("pensando…");

      const currentMode = modeRef.current;
      const systemPrompt = buildSystemPrompt(currentMode, config.system, skillsRef.current);
      const controller = new AbortController();
      abortRef.current = controller;
      const tools = allTools();

      await log("info", `>>> usuário (modo=${currentMode}, reasoning=${reasoning}, tools=${tools.length}): ${text.trim().slice(0, 300)}`);

      let accText = "";
      let accThink = "";
      const convo: ChatMessage[] = [...history];
      let hadError = false;

      try {
        const gen = streamChat({
          config: { ...config, system: systemPrompt, model },
          messages: convo,
          tools,
          reasoning,
          signal: controller.signal,
          executeTool,
        });

        for await (const ev of gen as AsyncIterable<StreamEvent>) {
          switch (ev.type) {
            case "thinking":
              accThink += ev.text;
              setLiveThinking(accThink);
              break;
            case "text":
              accText += ev.text;
              setLiveText(accText);
              break;
            case "tool_call":
              setMessages((m) => [
                ...m,
                { role: "tool", content: `→ ${ev.name}(${ev.args})`, toolName: ev.name },
              ]);
              setStatus(`executando ${ev.name}…`);
              break;
            case "tool_result":
              setMessages((m) => [
                ...m,
                {
                  role: "tool",
                  content: `← ${ev.name}${ev.isError ? " (erro)" : ""}: ${truncate(ev.result, 400)}`,
                  toolName: ev.name,
                },
              ]);
              break;
            case "error":
              hadError = true;
              setError(ev.message);
              await log("error", `stream erro: ${ev.message}`);
              break;
            case "done":
              if (ev.content) {
                setMessages((m) => [
                  ...m,
                  { role: "assistant", content: ev.content, reasoning: ev.reasoning },
                ]);
              }
              setLastThinking(ev.reasoning || accThink);
              if (!hadError) {
                await log("ok", `<<< resposta (${accText.length} chars, ${accThink.length} reasoning)`);
              }
              break;
          }
        }
        setStatus(hadError ? "erro" : "pronto");
      } catch (e) {
        hadError = true;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("erro");
        await log("error", `send falhou: ${msg}`);
        if (accText) {
          setMessages((m) => [...m, { role: "assistant", content: accText, reasoning: accThink }]);
        }
      } finally {
        setStreaming(false);
        setLiveText("");
        setLiveThinking("");
        abortRef.current = null;
      }
    },
    [config, model, reasoning, streaming, messages, allTools, executeTool]
  );

  const logoLines = art.split("\n");
  const logoHeight = logoLines.length;
  const footerHeight = 9;
  const transcriptHeight = Math.max(3, rows - logoHeight - footerHeight - 2);

  const visible = messages.slice(-Math.max(1, Math.floor(transcriptHeight / 2)));
  const totalTools = builtinToolsAsMcp().length + 1 + mcpCount;

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      <Box flexDirection="column" alignItems="center">
        {logoLines.map((line, i) => (
          <Text key={i} color={color} bold>
            {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={0}>
        <Text dimColor>{"─".repeat(Math.min(cols, 100))}</Text>
        <Box flexDirection="column" height={transcriptHeight} overflowY="hidden">
          {visible.length === 0 && (
            <Text dimColor italic>
              {" "}
              Envie uma mensagem para o modelo. (Enter envia · Ctrl+E reasoning · Ctrl+M modo · Ctrl+C cancela/sai)
            </Text>
          )}
          {visible.map((m, i) => (
            <Box key={i} flexDirection="column">
              <Text>
                <Text color={m.role === "user" ? "cyan" : m.role === "tool" ? "yellow" : "green"} bold>
                  {m.role === "user" ? "você" : m.role === "tool" ? "tool" : "ia"}{" > "}
                </Text>
                <Text wrap="truncate-end">{m.content}</Text>
              </Text>
            </Box>
          ))}
          {streaming && liveText && (
            <Text>
              <Text color="green" bold>
                ia{" > "}
              </Text>
              <Text>{liveText}</Text>
            </Text>
          )}
        </Box>
      </Box>

      <Box
        borderStyle="round"
        borderColor="magenta"
        flexDirection="column"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Box>
          <Text color="magenta" bold>
            {"> "}
          </Text>
          <TextInput
            value={input}
            onChange={setInput}
            placeholder={streaming ? "aguardando resposta…" : "digite para a LLM…"}
            onSubmit={send}
          />
        </Box>
      </Box>

      <Box marginTop={0}>
        <Text>
          <Text color="green" bold>
            Model:{" "}
          </Text>
          <Text>{model} </Text>
          <Text color="magenta" bold>
            | Reasoning:{" "}
          </Text>
          <Text color={reasoning === "none" ? "gray" : "magenta"}>{REASONING_LABEL[reasoning]} </Text>
          <Text color="blue" bold>
            | Modo:{" "}
          </Text>
          <Text color={mode === "sistema" ? "red" : "blue"}>{modeLabel(mode)} </Text>
          <Text color="yellow" bold>
            | Tools:{" "}
          </Text>
          <Text>{totalTools} </Text>
          <Text color="cyan" bold>
            | Skills:{" "}
          </Text>
          <Text>{skills.length} </Text>
          <Text dimColor>| </Text>
          <Text dimColor italic>
            {status}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray" bold>
          Pensamento:
        </Text>
        <Box height={3} overflowY="hidden">
          <Text dimColor italic wrap="truncate">
            {streaming
              ? liveThinking || "…"
              : lastThinking
                ? lastThinking.slice(-300)
                : "(nenhum pensamento registrado)"}
          </Text>
        </Box>
        {error && (
          <Text color="red">⚠ {error}</Text>
        )}
        <Text dimColor>log: {logFile().replace(/\\/g, "/")}</Text>
      </Box>
    </Box>
  );
};

function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

export function startApp(config: AppConfig, overrides: { model?: string; reasoning?: ReasoningLevel; mode?: Mode }) {
  render(<App config={config} overrides={overrides} />);
}
