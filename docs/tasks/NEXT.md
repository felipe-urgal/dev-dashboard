# Próxima atividade

A task 064 concluiu a abertura segura do projeto em um editor local conhecido.

## Docker Compose por serviços declarados e allowlist

Próxima frente candidata do Horizonte 3. O desenho completo está em
`docs/architecture/docker-compose-design.md`: a API lê um arquivo
`docker-compose.yml`, `docker-compose.yaml`, `compose.yml` ou `compose.yaml`
já existente no projeto e oferece somente serviços declarados nele.

### Escopo proposto

- detectar um único arquivo Compose reconhecido na raiz do projeto;
- listar os serviços declarados sem criar ou buildar imagens;
- catálogo fechado de `start`, `stop`, `restart` e `logs`;
- executar `docker compose` com argumentos em array, `cwd` canônico e sem
  shell;
- confirmação em duas etapas para `stop` e `restart`;
- limitar logs por tamanho e aplicar o mascaramento já usado nas demais fontes;
- nunca aceitar nome de arquivo, serviço ou comando livre do navegador.

### Decisão antes da implementação

Definir se `logs` será acompanhado ao vivo como um terceiro `kind` de
`ManagedProcess` (`compose-service`) ou lido pontualmente com `--tail`. O
desenho recomenda o primeiro caminho para manter a experiência dos painéis de
processo, mas ele exige generalizar persistência, arquivos de log, observação
de saída e limpeza de estados no `ProcessManager`.

Nenhum código desta frente foi escrito ainda.
