# Próxima atividade

A task 068 concluiu os health checks locais declarativos. A próxima frente
candidata é transformar o campo `favorite`, hoje sempre vindo como `false` da
descoberta, em uma preferência local persistente e acionável na visão geral.

## Favoritos persistentes por projeto

Permitir destacar os projetos usados com mais frequência sem alterar arquivos
dos repositórios nem sincronizar essa preferência externamente.

### Escopo proposto

- persistir favoritos em arquivo privado da configuração local, associados ao
  identificador estável do projeto;
- aplicar a preferência depois de cada scan, sem misturá-la ao resultado bruto
  da descoberta;
- oferecer uma rota autenticada e fechada para marcar ou desmarcar um projeto;
- adicionar uma ação compacta e acessível no `ProjectCard`;
- manter favoritos no topo da lista, preservando a ordenação alfabética dentro
  de cada grupo;
- atualizar a tela imediatamente e reconciliar com a resposta da API em caso de
  falha;
- remover ou ignorar com segurança referências a projetos que deixaram de ser
  descobertos, sem tocar no filesystem desses projetos.

### Decisões antes da implementação

- decidir se favoritos ausentes devem ser apenas ignorados ou removidos durante
  o scan;
- decidir se a ação ficará sempre visível no card ou aparecerá apenas no hover,
  mantendo acesso por teclado;
- definir se a primeira versão precisa de um filtro "Somente favoritos" ou se a
  ordenação no topo já é suficiente.

Nenhum código desta frente foi escrito ainda.
