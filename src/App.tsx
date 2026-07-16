import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useApp, useInput, useStdout } from "ink";
import { renderLogo } from "./ascii.js";
import { streamChat } from "./llm.js";
import { McpManager } from "./mcp.js";
import { builtinToolsAsMcp, isBuiltin, runBuiltin } from "./tools.js";
import { loadSkills, readSkillContent, SKILL_TOOL, type Skill } from "./skills.js";
import { buildSystemPrompt, modeLabel, nextMode, type Mode } from "./modes.js";
import { log, logFile } from "./logger.js";
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

// Custom input component that handles shortcuts without passing them to input
const ShortcutInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder: string;
  streaming: boolean;
  onCycleReasoning: () => void;
  onCycleMode: () => void;
  onCancel: () => void;
}> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  streaming,
  onCycleReasoning,
  onCycleMode,
  onCancel,
}) => {
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (key.ctrl && (input === "e" || input === "\u0005")) {
      onCycleReasoning();
      return;
    }
    if (key.ctrl && (input === "o" || input === "\u000f")) {
      onCycleMode();
      return;
    }
    if (key.ctrl && (input === "c" || input === "\u0003")) {
      onCancel();
      return;
    }
    if (key.return) {
      onSubmit(value);
      onChange("");
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.escape || key.tab || key.pageUp || key.pageDown) {
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  const displayPlaceholder = !streaming && !value;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Text color="magenta" bold>{"> "}</Text>
      <Box flexGrow={1} paddingLeft={1}>
        {value ? (
          <>
            <Text>{value}</Text>
            {showCursor && <Text color="magenta" bold>{" |"}</Text>}
          </>
        ) : displayPlaceholder ? (
          <Text dimColor italic>{placeholder}</Text>
        ) : (
          <Text dimColor italic>{"[...] aguardando resposta"}</Text>
        )}
      </Box>
    </Box>
  );
};

const App: React.FC<AppProps> = ({ config, overrides }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  useEffect(() => {
    if (!stdout) return;
    const handler = () => {
      setCols(stdout.columns);
      setRows(stdout.rows);
    };
    stdout.on("resize", handler);
    return () => {
      stdout.off("resize", handler);
    };
  }, [stdout]);

  const [model] = useState(overrides.model ?? config.model);
  const [reasoning, setReasoning] = useState<ReasoningLevel>(overrides.reasoning ?? config.reasoning);
  const [mode, setMode] = useState<Mode>(overrides.mode ?? config.mode ?? "programação");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState("pronto");
  const [mcpCount, setMcpCount] = useState(0);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cols, setCols] = useState(stdout?.columns ?? 100);
  const [rows, setRows] = useState(stdout?.rows ?? 40);
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
      await log("info", `siliconflower iniciado - provider=${config.provider} model=${model}`);
      await log("info", `skills carregadas: ${loaded.length} (${loaded.map((s) => s.name).join(", ") || "nenhuma"})`);
      setStatus("conectando MCP...");
      try {
        const tools = await mcp.connectAll(config.mcpServers);
        setMcpCount(tools.length);
        await log("ok", `MCP conectado: ${mcp.serverCount()} servidores, ${tools.length} ferramentas`);
        setStatus(tools.length ? "pronto" : "pronto (sem MCP)");
      } catch (e) {
        await log("warn", `MCP indisponivel: ${String(e)}`);
        setStatus("MCP indisponivel");
      }
    })();
    return () => {
      abortRef.current?.abort();
      void mcp.close().then(() => log("info", "siliconflower encerrado"));
    };
    // boot runs once on mount; config/model are read once at start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleReasoning = useCallback(() => {
    setReasoning((r) => {
      const idx = REASONING_LEVELS.indexOf(r);
      const next = REASONING_LEVELS[(idx + 1) % REASONING_LEVELS.length];
      void log("info", `reasoning alterado: ${r} -> ${next}`);
      setStatus(`reasoning: ${next}`);
      setTimeout(() => setStatus("pronto"), 1200);
      return next;
    });
  }, []);

  const cycleMode = useCallback(() => {
    setMode((m) => {
      const n = nextMode(m);
      void log("info", `modo alterado: ${m} -> ${n}`);
      setStatus(`modo: ${n}`);
      setTimeout(() => setStatus("pronto"), 1200);
      return n;
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (streaming) {
      abortRef.current?.abort();
      setStatus("cancelado");
      void log("warn", "stream cancelado pelo usuário");
    } else {
      exit();
    }
  }, [streaming, exit]);

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
          })),
        { role: "user" as const, content: text.trim() },
      ];
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setStreaming(true);
      setLiveText("");
      setStatus("pensando…");

      const currentMode = modeRef.current;
      const systemPrompt = buildSystemPrompt(currentMode, config.system, skillsRef.current);
      const controller = new AbortController();
      abortRef.current = controller;
      const tools = allTools();

      await log("info", `>>> usuário (modo=${currentMode}, reasoning=${reasoning}, tools=${tools.length}): ${text.trim().slice(0, 300)}`);

      let accText = "";
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
              setLiveText("");
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
              accText = "";
              setLiveText("");
              break;
            case "error":
              hadError = true;
              setError(ev.message);
              setLiveText("");
              await log("error", `stream erro: ${ev.message}`);
              break;
            case "done":
              if (ev.content && ev.content.trim()) {
                setMessages((m) => [
                  ...m,
                  { role: "assistant", content: ev.content, reasoning: ev.reasoning },
                ]);
              }
              if (!hadError) {
                await log("ok", `<<< resposta (${accText.length} chars)`);
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
          setMessages((m) => [...m, { role: "assistant", content: accText }]);
        }
      } finally {
        setStreaming(false);
        setLiveText("");
        abortRef.current = null;
      }
    },
    [config, model, reasoning, streaming, messages, allTools, executeTool]
  );

  function truncate(s: string, n: number): string {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > n ? one.slice(0, n) + "…" : one;
  }

  const logoLines = art.split("\n");
  const logoHeight = logoLines.length;
  const footerHeight = 9;
  const transcriptHeight = Math.max(3, rows - logoHeight - footerHeight - 2);

  const visible = messages.slice(-Math.max(1, Math.floor(transcriptHeight / 2) + (streaming ? 1 : 0)));
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

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>{"─".repeat(Math.min(cols, 100))}</Text>
        <Box flexDirection="column" height={transcriptHeight} overflowY="hidden">
          {visible.length === 0 && (
            <Text dimColor italic>
              {" "}
              Envie uma mensagem para o modelo. (Enter envia · Ctrl+E reasoning · Ctrl+O modo · Ctrl+C cancela/sai)
            </Text>
          )}
          {visible.map((m, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color={m.role === "user" ? "cyan" : m.role === "tool" ? "yellow" : "green"} bold>
                  {m.role === "user" ? "você" : m.role === "tool" ? "tool" : "ia"}{" > "}
                </Text>
                <Text wrap="truncate-end">{m.content}</Text>
              </Text>
            </Box>
          ))}
          {streaming && liveText && (
            <Box marginTop={1} marginBottom={1}>
              <Text>
                <Text color="green" bold>
                  ia{" > "}
                </Text>
                <Text>{liveText}</Text>
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      <ShortcutInput
        value={input}
        onChange={setInput}
        onSubmit={send}
        placeholder={streaming ? "aguardando resposta…" : error ? "erro — tente novamente" : "digite para a LLM…"}
        streaming={streaming}
        onCycleReasoning={cycleReasoning}
        onCycleMode={cycleMode}
        onCancel={handleCancel}
      />

      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>{"─".repeat(Math.min(cols, 100))}</Text>
        <Box flexDirection="row" flexWrap="wrap">
          <Text>
            <Text color="green" bold>Model:</Text> <Text>{model}</Text>
          </Text>
          <Text dimColor>{" │ "}</Text>
          <Text>
            <Text color="magenta" bold>Reasoning:</Text> <Text color={reasoning === "none" ? "gray" : "magenta"}>{REASONING_LABEL[reasoning]}</Text>
          </Text>
          <Text dimColor>{" │ "}</Text>
          <Text>
            <Text color="blue" bold>Modo:</Text> <Text color={mode === "sistema" ? "red" : "blue"}>{modeLabel(mode)}</Text>
          </Text>
          <Text dimColor>{" │ "}</Text>
          <Text>
            <Text color="yellow" bold>Tools:</Text> <Text>{totalTools}</Text>
          </Text>
          <Text dimColor>{" │ "}</Text>
          <Text>
            <Text color="cyan" bold>Skills:</Text> <Text>{skills.length}</Text>
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor italic>{status}</Text>
        </Box>
      </Box>

      {streaming && reasoning !== "none" && (
        <Box marginTop={1} marginBottom={1}>
          <Text color="green" bold>
            {"[THINKING]"}
          </Text>
        </Box>
      )}

      {error && (
        <Text color="red">[ERRO] {error}</Text>
      )}
      <Text dimColor>log: {logFile().replace(/\\/g, "/")}</Text>
    </Box>
  );
};

export function startApp(config: AppConfig, overrides: { model?: string; reasoning?: ReasoningLevel; mode?: Mode }) {
  render(<App config={config} overrides={overrides} />);
}