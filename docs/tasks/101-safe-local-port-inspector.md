
# Task 101 — Inspetor seguro de portas locais

## Status

Implementada no PR desta branch, aguardando validação final e revisão.

## Objetivo

Mostrar, na página global de Processos, quais portas TCP relevantes
estão ocupadas no ambiente local, quem as ocupa quando essa informação
pode ser obtida com segurança e se existe conflito com a porta
configurada de um projeto.

## Decisão principal

A entrega é estritamente somente leitura. Ela não recupera linha de
comando, diretório de trabalho ou variáveis do processo externo e não
oferece ação para encerrar PID arbitrário. A identidade do
`ProcessManager` continua sendo a única autorização aceita para ações
de parada já existentes no produto.

## Escopo

- contrato compartilhado `LocalPortInspection`;
- rota autenticada `GET /api/ports`;
- adaptador Linux isolado usando `ss -H -ltnp`, sem shell;
- timeout de 1,5 segundo e saída limitada a 256 KiB;
- portas TCP em loopback e binds em todas as interfaces, pois estes
  também ocupam o loopback;
- associação por PID/porta com processos gerenciados ativos;
- PID e nome limitado de processo externo somente após confirmar em
  `/proc/<pid>/status` que ele pertence ao UID atual;
- união com portas explicitamente configuradas nos servidores dos
  projetos;
- indicação de porta livre, ocupada, gerenciada ou em conflito;
- sugestão informativa da próxima porta não observada como ocupada;
- no máximo 100 entradas, priorizando conflitos e portas esperadas;
- painel compacto dentro de `/processes`, com deep link apenas para
  áreas já autorizadas do projeto.

## Guardas

- nenhuma string do navegador vira comando, argumento, host ou PID;
- execução por `execFile`, argumentos fixos e `shell: false` implícito;
- plataformas diferentes de Linux retornam estado `unsupported`;
- ausência do utilitário `ss` retorna mensagem segura, sem erro bruto;
- endereço específico fora de loopback é ignorado na primeira versão;
- nome externo é limitado a 64 caracteres e caracteres de controle são
  removidos;
- processos de outro usuário não têm PID/nome expostos;
- nenhum caminho de `/proc`, cwd, comando ou argumento chega à API;
- não há botão de matar processo externo.

## Critérios de aceite

- [x] processo gerenciado é associado somente quando PID e porta são
  coerentes;
- [x] PID divergente na mesma porta é tratado como ocupante externo;
- [x] porta configurada e ocupada por outro processo vira conflito;
- [x] porta configurada e livre aparece como disponível;
- [x] binds `127.0.0.1`, `::1`, `0.0.0.0` e `::` são reconhecidos;
- [x] endereço específico fora de loopback fica fora da lista;
- [x] processo externo só aparece após confirmação do UID;
- [x] rota exige autenticação local;
- [x] painel preserva a lista durante atualização manual;
- [x] nenhum encerramento externo foi adicionado.

## Validação automatizada

- testes unitários do parser/adaptador Linux;
- regressão de PID divergente;
- estados `unsupported` e `unavailable`;
- teste de rota com configuração de servidor e processo gerenciado;
- teste montado do painel Vue;
- `npm run typecheck`;
- `npm run build`;
- `npm run docs:api:check`;
- `npm test`;
- Smoke E2E pelo CI normal do repositório.

## Roteiro de QA

1. Abrir **Processos** em um Linux com um servidor iniciado pelo
   dashboard e confirmar o badge **Gerenciado** na porta correta.
2. Configurar uma porta ocupada por outro processo do mesmo usuário e
   confirmar **Conflito**, PID/nome limitado e sugestão de próxima
   porta.
3. Configurar uma porta livre e confirmar o estado **Livre**.
4. Verificar que processos de outro usuário ou sem permissão aparecem
   apenas como **Não identificado**.
5. Confirmar que nenhuma linha de comando, cwd ou ação de encerramento
   externo aparece na interface.
