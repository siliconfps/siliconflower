# Code Review

## Quando aplicar
Use esta skill quando o usuário pedir revisão de código, "review", "analise este código" ou relatar bugs.

## Diretrizes
- Leia o arquivo completo com `read_file` antes de opinar.
- Avalie: correção, segurança, performance, legibilidade e aderência às convenções do projeto.
- Comente cada ponto com a severidade: **bloqueante**, **atenção** ou **sugestão**.
- Sugira correções concretas com `edit_file` quando apropriado.
- Não reescreva código que já está correto apenas por estilo, a menos que o projeto tenha linter que exija.

## Formato da resposta
1. Resumo (1-3 linhas)
2. Pontos por severidade
3. Ações aplicadas (edições feitas) ou próximas etapas
