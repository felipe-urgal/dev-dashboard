# Próxima atividade — 010: Eventos de execução em tempo real

## Objetivo

Substituir o polling da execução ativa por um canal local autenticado de eventos, mantendo recuperação determinística por estado persistido.

## Plano detalhado

1. Definir contratos fechados para eventos de estado e atualização de log.
2. Escolher SSE autenticado na mesma origem e documentar reconexão e expiração.
3. Expor eventos somente por projeto e ID de execução reconhecidos.
4. Aplicar limites de frequência, tamanho e quantidade de assinantes.
5. Encerrar assinaturas ao trocar projeto, concluir execução ou desconectar.
6. Manter detalhe e histórico HTTP como fonte de recuperação após lacunas.
7. Integrar o painel sem polling periódico de execução ativa.
8. Cobrir autenticação, reconexão, isolamento entre projetos e cleanup.
9. Atualizar arquitetura, segurança, README e registro da task.

## Fora do escopo

- WebSocket genérico;
- eventos de comandos arbitrários;
- acesso remoto;
- fila durável distribuída.

## Critérios de aceite

- acompanhamento ativo não depende de polling;
- eventos não atravessam projetos ou sessões;
- conexões e buffers possuem limites explícitos;
- reconexão recupera o estado por endpoints existentes;
- typecheck, build e testes passam.
