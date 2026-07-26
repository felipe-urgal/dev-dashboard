# Próxima atividade — 009: Persistência do histórico de execuções

## Objetivo

Persistir um histórico limitado das execuções reconhecidas para que estado, resultado e logs protegidos possam ser recuperados após reiniciar a API.

## Plano detalhado

1. Definir contratos de resumo, detalhe e paginação do histórico.
2. Modelar armazenamento versionado no diretório de estado com permissões restritas.
3. Restaurar registros terminais e reconciliar com segurança processos interrompidos.
4. Aplicar limites de idade e quantidade compatíveis com a política de logs.
5. Expor listagem e detalhe somente por IDs, com schemas explícitos.
6. Integrar o histórico ao painel de scripts sem polling de registros terminais.
7. Cobrir migração, corrupção parcial, concorrência, paginação e limpeza.
8. Atualizar arquitetura, segurança, README e registro da task.

## Fora do escopo

- sincronização remota;
- histórico multiusuário;
- reexecução automática;
- exportação irrestrita de logs.

## Critérios de aceite

- execuções recentes sobrevivem ao reinício da API;
- registros ativos órfãos são reconciliados sem sinalizar PIDs desconhecidos;
- histórico e logs respeitam limites seguros;
- nenhuma rota aceita caminho ou comando;
- typecheck, build e testes passam.
