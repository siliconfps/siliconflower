# Windows Privacy & Hardening

## Quando aplicar
Use esta skill no MODO SISTEMA para privacidade, telemetria, rastreamento e endurecimento do Windows.

## Diretrizes
- SEMPRE mostre o impacto de cada alteração antes de executá-la.
- Para telemetria: prefira políticas de grupo/registry sob `HKLM\SOFTWARE\Policies\Microsoft\Windows`.
- Liste configurações reversíveis e marque as que exigem reinício.
- Não desative recursos de segurança (Windows Defender, UAC, firewall) sem avisar os riscos explicitamente.
- Crie um ponto de restauração antes de mudanças em massa:
  ```powershell
  Checkpoint-Computer -Description "antes-siliconflower" -RestorePointType MODIFY_SETTINGS
  ```

## Tópicos comuns
- Telemetria e diagnósticos
- Serviços desnecessários (com cautela)
- Aplicativos pré-instalados
- Permissões de apps em segundo plano
- Côokies/rastreamento de navegador

## Formato da resposta
Para cada mudança: 
1. O que faz
2. Comando/script
3. Como reverter
