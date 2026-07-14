# 🌸 SILICONFLOWER

Um agente de IA para terminal (CLI/TUI) que roda no **Windows**, com suporte a **MCP**, **reasoning** ajustável, **skills** (`.md`), **modos** (programação/sistema), acesso real ao sistema de arquivos e backends compatíveis com **OpenAI** e **Anthropic** (ex.: SiliconFlow, OpenRouter, OpenAI, Anthropic).

> Logo ASCII gigante no topo, janela de input, nome do modelo e o **pensamento** (reasoning) da IA logo abaixo.

```
███████╗██╗██╗     ██╗ ██████╗ ██████╗ ███╗   ██╗███████╗██╗      ██████╗ ██╗    ██╗███████╗██████╗
...
┌──────────────────────────────────────────────────────────┐
│ > digite para a LLM…                                     │
└──────────────────────────────────────────────────────────┘
Model: tencent/Hy3 | Reasoning: high | Modo: PROG | Tools: 10 | Skills: 3 | pronto
Pensamento:
…
```

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **Backends compatíveis** | OpenAI (`/v1/chat/completions`) e Anthropic (`/v1/messages`). Suporta SiliconFlow, OpenRouter, OpenAI, Anthropic e proxies. |
| **Reasoning selecionável** | `none` / `low` / `medium` / `high`. OpenAI-compat envia `reasoning_effort` e lê `reasoning_content`; Anthropic usa `thinking` com `budget_tokens`. |
| **Ferramentas nativas** | Acesso real ao host: ler/criar/editar/mover/listar/buscar/excluir arquivos e pastas. |
| **MCP** | Conecta servidores MCP via stdio e expõe as ferramentas ao modelo (loop de tool-calling até 8 passos). |
| **Skills (.md)** | Carrega instruções especializadas de `~/.siliconflower/skills/*.md`. O modelo lê via ferramenta `read_skill`. |
| **Modos** | `programação` (foco em código) e `sistema` (PowerShell, backup, privacidade, config do Windows). Cicla com `Ctrl+M`. |
| **Logging** | Tudo é registrado em `~/.siliconflower/logs/siliconflower.log` com timestamps e níveis. |
| **TUI (ink/React)** | Interface em terminal com logo, histórico, janela de input, status e área de pensamento. |

---

## 🚀 Instalação

### Pré-requisitos
- **Bun** ≥ 1.1 (recomendado, roda TypeScript nativamente) — https://bun.sh
  - Alternativa: Node.js ≥ 20 + `tsx` (já incluso em `devDependencies`)

### Passos
```powershell
git clone https://github.com/<seu-usuario>/siliconflower.git
cd siliconflower
bun install         # ou: npm install
```

### Uso direto
```powershell
bun run start                    # inicia a TUI (wizard na 1ª vez)
bun run start -- -m tencent/Hy3 -r high
npm start                        # equivalente via npm
node bin\siliconflower.js        # launcher auto-detecta runtime
```

---

## ⚙️ Configuração inicial

Na primeira execução um **wizard** pergunta:

1. **Variante do modelo**: `openai` ou `anthropic`
2. **URL base**: padrão `https://api.siliconflow.com/v1`
3. **Modelo**: ex. `tencent/Hy3`, `deepseek-ai/DeepSeek-V3`, `claude-3-5-sonnet-20241022`
4. **API Key**
5. **Nível de reasoning** padrão
6. **System prompt** opcional
7. **Servidores MCP** (opcional)

A configuração fica em `~/.siliconflower/config.json`:

```json
{
  "provider": "openai",
  "baseURL": "https://api.siliconflow.com/v1",
  "apiKey": "sk-...",
  "model": "tencent/Hy3",
  "reasoning": "high",
  "mode": "programação",
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/"] }
  }
}
```

> ⚠️ **Importante:** a **SiliconFlow** usa a variante **`openai`** (formato OpenAI). Selecionar `anthropic` resulta em 404.

### Reconfigurar
```powershell
bun run start -- config      # reabre o wizard
bun run start -- show        # mostra config (com chave mascarada)
```

---

## 🎮 Atalhos (TUI)

| Tecla | Ação |
|---|---|
| `Enter` | Envia a mensagem |
| `Ctrl+E` | Alterna nível de reasoning |
| `Ctrl+M` | Alterna modo (programação ↔ sistema) |
| `Ctrl+C` | Cancela o stream (ou sai se ocioso) |

### Flags de linha de comando
```
-m, --model <id>        sobrescrever o modelo
-r, --reasoning <level> none | low | medium | high
    --mode <mode>       programação | sistema
    --provider <type>   openai | anthropic
    --base-url <url>    sobrescrever a URL base
    --api-key <key>     sobrescrever a API key
```

---

## 🧰 Ferramentas nativas (acesso ao host)

O agente pode operar o sistema de arquivos **sem MCP**:

| Ferramenta | Descrição |
|---|---|
| `read_file` | Lê arquivo de texto |
| `write_file` | Cria/sobrescreve arquivo (cria diretórios pai) |
| `edit_file` | Substitui texto (primeira ocorrência ou `replaceAll`) |
| `list_directory` | Lista arquivos/pastas |
| `create_directory` | Cria diretório (recursivo) |
| `move_path` | Move/renomeia |
| `file_info` | Metadados (tamanho, datas, tipo) |
| `search_files` | Busca por padrão glob |
| `delete_path` | Exclui (`recursive` para pastas) — **destrutivo** |

Todas as chamadas são registradas no log.

---

## 🧩 MCP

Adicione servidores MCP no `config.json`:

```json
"mcpServers": {
  "git": { "command": "uvx", "args": ["mcp-server-git", "--repository", "C:/projeto"] },
  "fs":  { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/Users/Eli"] }
}
```

As ferramentas MCP são mescladas com as nativas e ficam disponíveis ao modelo.

---

## 📚 Skills (.md)

Coloque arquivos Markdown em `~/.siliconflower/skills/`. Cada `.md` vira uma skill:

```powershell
# copiar exemplos do repositório para o seu diretório de skills
Copy-Item .\skills\*.md $env:USERPROFILE\.siliconflower\skills\
```

Estrutura sugerida de uma skill:
```markdown
# Nome da Skill

## Quando aplicar
...

## Diretrizes
...
```

O agente lista as skills no system prompt e pode ler o conteúdo completo via `read_skill`.

Comandos:
```powershell
bun run start -- skills     # lista skills carregadas
```

---

## 🎚 Modos

| Modo | Foco |
|---|---|
| **programação** | Escrever, revisar, refatorar e explicar código. Convenções do projeto, bibliotecas em uso, código idiomático. |
| **sistema** | Scripts Windows (PowerShell/batch), backup, privacidade, configurações, registro (com cautela), serviços. Sempre avisa impacto de ações destrutivas. |

Altere com `Ctrl+M` na TUI ou `--mode sistema`.

---

## 📋 Logs

Tudo é logado para diagnóstico:

```powershell
bun run start -- logs          # últimas 50 linhas
bun run start -- logs -n 200   # últimas 200
```

Arquivo: `~/.siliconflower/logs/siliconflower.log`

Níveis: `INFO`, `OK`, `TOOL`, `WARN`, `ERROR`. Rotação automática em 1 MB.

---

## 🗂 Estrutura do projeto

```
siliconflower/
├── bin/
│   └── siliconflower.js      # launcher (auto-detecta bun/tsx)
├── src/
│   ├── index.tsx             # CLI (commander) + entry
│   ├── App.tsx               # TUI (ink/React)
│   ├── llm.ts                # adapter OpenAI + Anthropic com reasoning e tools
│   ├── mcp.ts                # gerenciador de clientes MCP
│   ├── tools.ts              # ferramentas nativas de filesystem
│   ├── glob-util.ts          # busca de arquivos (sem deps)
│   ├── skills.ts             # carregador de skills (.md)
│   ├── modes.ts              # modos + system prompts
│   ├── logger.ts             # logging com rotação
│   ├── config.ts             # persistência da configuração
│   ├── wizard.ts             # setup interativo
│   ├── ascii.ts              # logo ASCII (figlet)
│   └── types.ts              # tipos compartilhados
├── skills/                   # skills de exemplo
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

---

## 🛠 Desenvolvimento

```powershell
bun install
bunx tsc --noEmit             # typecheck
bun run start                 # rodar
```

**Stack:** TypeScript · Bun · React (ink) · OpenAI SDK · Anthropic SDK · MCP SDK · commander · figlet · inquirer.

---

## 📄 Licença

MIT — veja [LICENSE](./LICENSE).
