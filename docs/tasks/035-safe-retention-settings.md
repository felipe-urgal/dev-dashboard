# Task 035 — Configurações seguras de retenção

## Status

Concluída.

## Revisão da task 034

A revisão identificou uma janela insegura na paleta: antes de terminar a consulta
do processo — ou quando ela falhava — a ausência temporária de estado era tratada
como servidor parado e “Iniciar servidor” ficava disponível. Estado desconhecido
agora não produz ação; iniciar/parar aparece somente depois de uma resposta válida.

## Resultado

- Contrato compartilhado explicita valores, limites e defaults de retenção.
- `RetentionSettingsRepository` lê a configuração validada, preserva as variáveis
  de ambiente legadas como fallback e persiste `retention.json` atomicamente com
  diretório `0700` e arquivo `0600`.
- As rotas autenticadas `GET` e `PUT /api/settings/retention` possuem schemas
  fechados e não aceitam caminhos, propriedades adicionais ou valores fora dos
  limites.
- A API aplica os valores persistidos aos gerenciadores na inicialização. Salvar
  não executa limpeza; a tela informa explicitamente que é necessário reiniciar.
- A nova tela `/settings` apresenta os valores e limites e está acessível pela
  sidebar e pela paleta global.

## Limites definidos

| Preferência | Padrão | Mínimo | Máximo |
| --- | ---: | ---: | ---: |
| Retenção de logs/estados (dias) | 7 | 1 | 365 |
| Histórico de scripts | 200 | 10 | 1000 |
| Histórico de testes | 50 | 10 | 500 |

## Segurança e limitações

O navegador transmite somente três inteiros limitados. Os caminhos permanecem
derivados no backend. A gravação não remove nenhum arquivo, e alterações entram em
vigor somente na próxima inicialização da API para evitar políticas parcialmente
aplicadas entre serviços já instanciados. Arquivos inválidos são ignorados de modo
conservador em favor dos defaults seguros (ou variáveis legadas válidas).

## Verificação

```bash
npm run typecheck
npm run build
npm test
```
