# Próxima atividade — 042: manutenção de processos (dev-clean / dev-kill-port)

## Contexto

A task 041 abriu a "paridade CLI→Web seletiva" do Horizonte 2 com o
`git-save` no painel Git. O mesmo item do roadmap lista `dev-clean` e
`dev-kill-port` como ações de manutenção no painel de processos — hoje
exclusivas do CLI bash (`lib/server/`): `dev-clean` varre arquivos de PID
obsoletos cujo processo não existe mais, e `dev-kill-port` libera uma porta
ocupada.

## Objetivo

Oferecer na página global de processos (`/processes`) ações de manutenção
equivalentes, começando pela fatia de menor risco: limpeza de estado
obsoleto do lado da API (equivalente ao `dev-clean`), e avaliar com cuidado
o desbloqueio de porta (equivalente ao `dev-kill-port`) sob a política de
operações destrutivas.

## Plano sugerido

1. Estudar `lib/server/core/` (`dev-clean`, `dev-kill-port`) e o que o
   `ProcessManager` já cobre (`sweepStaleProcesses`, limpeza manual da task
   036) para não duplicar capacidade existente — a fatia pode se resumir a
   expor lacunas reais, não a reimplementar o que já há.
2. Para a limpeza: mapear estados obsoletos que a varredura atual não
   alcança (ex. arquivos de log/estado órfãos no diretório gerenciado) e
   expor uma ação fechada de manutenção com resposta explícita do que foi
   removido.
3. Para o kill-port: **ler primeiro** "Requisitos antes de operações
   destrutivas" em `docs/architecture/security.md`. O modelo atual proíbe
   encerrar processos que o dashboard não iniciou; qualquer versão web
   precisa se restringir a processos gerenciados cuja identidade foi
   validada (`/proc/<pid>/cwd`) — nunca um PID arbitrário dono da porta. Se
   isso esvaziar a utilidade da ação, registrar a decisão e reduzir o
   escopo a diagnóstico (mostrar quem ocupa a porta) em vez de mutação.
4. Confirmação em duas etapas para qualquer mutação, seguindo o padrão de
   token consumível das mutações Git.
5. Testes de serviço, rota e componente cobrindo sucesso, recusa e o caso
   de identidade divergente.

## Segurança

- Nenhum PID ou caminho vindo do navegador: apenas IDs de processos
  gerenciados e ações do catálogo fechado.
- Identidade de processo validada antes de qualquer sinal; TERM antes de
  KILL.
- Caminhos de limpeza derivados exclusivamente do diretório de estado
  gerenciado.
- Confirmação explícita e mensagem descrevendo exatamente o que será
  removido/encerrado.

## Fora do escopo

- Encerrar processos arbitrários que ocupam uma porta (fora do modelo de
  ameaça atual).
- `git-pr` e snapshot/restore de banco (fatias próprias do mesmo item do
  roadmap).
- Abrir editor/terminal via adaptadores locais.

## Critérios de aceite

- ações de manutenção disponíveis na página de processos com confirmação e
  feedback do que foi feito;
- nenhuma string arbitrária, PID ou caminho do navegador chega a
  `spawn`/sinalização;
- decisão registrada (task + security.md se necessário) caso o kill-port
  seja reduzido ou adiado;
- `npm run typecheck`, `npm run build` e `npm test` passam.
