# Próxima atividade — 008: Proteção e retenção de logs

## Objetivo

Reduzir a exposição de credenciais nos logs gerenciados e tornar sua retenção explícita, observável e configurável com limites seguros.

## Plano detalhado

1. Definir contratos para política, metadados de retenção e conteúdo mascarado.
2. Inventariar todos os produtores e leitores de logs de servidor, teste e catálogo.
3. Implementar mascaramento conservador de tokens, credenciais em URLs e variáveis sensíveis conhecidas.
4. Preservar contexto útil sem retornar o valor original e indicar quando houve mascaramento.
5. Aplicar limites seguros de tamanho, idade e quantidade com defaults fechados.
6. Integrar limpeza ao ciclo de vida do Process Manager sem aceitar caminhos do navegador.
7. Expor configuração e limpeza por IDs, schemas explícitos e confirmação para remoção.
8. Apresentar avisos, retenção e conteúdo mascarado na UI.
9. Cobrir falsos positivos críticos, limites, rotação, concorrência e entradas malformadas.
10. Atualizar arquitetura, segurança, README e registro da task.

## Fora do escopo

- cofre de segredos;
- exportação de logs sem limite;
- armazenamento remoto;
- auditoria multiusuário.

## Critérios de aceite

- padrões sensíveis conhecidos não aparecem nas respostas da API;
- mascaramento é aplicado de forma central aos três tipos de processo;
- retenção possui defaults limitados e limpeza segura;
- nenhuma rota aceita caminho de log;
- typecheck, build e testes passam.
