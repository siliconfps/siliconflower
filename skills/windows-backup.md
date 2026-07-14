# Windows Backup

## Quando aplicar
Use esta skill no MODO SISTEMA quando o usuário pedir backup, "faça backup de", "salve uma cópia" de arquivos, pastas ou configurações.

## Diretrizes
- Prefira `robocopy` para cópias grandes (preserva permissões, retomável).
- Para configurações de usuário, considere: Registry (reg export), perfis de navegador, chaves de aplicativos em `%APPDATA%` e `%LOCALAPPDATA%`.
- SEMPRE confirme o destino antes de copiar e evite sobrescrever sem sufixo de data.
- Nomeie backups com data: `nome_YYYY-MM-DD`.
- Para restauração, exiba o que será restaurado e peça confirmação.

## Exemplo (perfil de uma pasta)
```powershell
$dest = "D:\Backups\MeusDocs_$(Get-Date -Format yyyy-MM-dd)"
robocopy "C:\Users\Eli\Documents" $dest /MIR /R:1 /W:1 /XA:SH /XJ
```

## Segurança
- Nunca delete a origem após backup sem confirmação explícita.
- Registre cada operação no log do agente.
