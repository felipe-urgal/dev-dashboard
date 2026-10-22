# Serviços locais — Home Music

A rota principal `/local-services` é **independente** da área Produção/Deploy e
não compila, migra, atualiza Git nem configura política de boot.

## Preparação

1. Instale Home Music como serviço **do sistema** no Linux usando
   `npm run service:install` no checkout do Home Music. A instalação usa
   `/etc/systemd/system/home-music.service`, owner root e um helper fixo em
   `/usr/local/sbin/home-music-service-control`.
2. Atualize o checkout do Dev Dashboard e execute `npm run local:install`.
3. Abra **Serviços locais**, no menu principal.

**Atenção:** se Home Music já estiver instalado, após atualizar seu checkout
execute novamente `npm run service:install` uma vez para atualizar o helper
e o sudoers. A operação pode reiniciar a aplicação; faça em janela apropriada.
Não use `service:update` para introduzir mudanças de permissões.

## Autorização e operação

A API opera somente a identidade literal `home-music.service` no escopo
`system`, exigindo `Id`, `FragmentPath`, `LoadState` e `Transient`
corretos e helper `root:root` com modo 0755. Não há seleção de comando,
unit, caminho ou serviço controlável pelo navegador.

O backend verifica `sudo -n <helper> check`; sem autorização, a interface
permanece read-only. O helper executa somente `check|start|stop|restart`
na unit fixa, através da regra sudoers NOPASSWD do instalador, sem conceder
sudo genérico. A própria API continua como usuário não privilegiado.

`GET /api/local-services` retorna estado e saúde. Para operar:
`GET /api/local-services/home-music/plan?action=start|stop|restart`
gera confirmação efêmera de 30 segundos; após confirmação visível do usuário,
`POST /api/local-services/home-music/actions` recebe
`{ "action": "start", "confirmation": "<token>" }`.
O token é de uso único e o backend revalida estado e autorização. Só é
permitido iniciar quando parado ou em estado `failed`, parar/reiniciar quando executando.

A verificação de saúde consulta **somente**
`http://127.0.0.1:8787/ready`, com timeout; ausência de resposta não
é sucesso. Operações que podem ter sido aplicadas mas não foram verificadas
terminam como `unverified`, sem retry automático. A auditoria registra intenção
antes do comando e resultado em
`<DEV_DASHBOARD_STATE_DIR>/local-services/operations.jsonl`.
Falha da auditoria antes do comando bloqueia a mutação.

Os logs usam o leitor `SystemdJournalReader`, limitando saída e removendo
segredos por máscaras existentes; permissões insuficientes mostram
indisponibilidade, sem elevar privilégios. Não expor dados crus do journal.

## Limites

- O fluxo de ação é serializado por instância da API. Outras instâncias,
  shells e ferramentas externas podem concorrer; observações pré/pós
  reduzem a chance de erro, mas não constituem fencing entre processos.
- O módulo só autoriza Home Music. Outros serviços observados no inventário
  não recebem permissão de mutação por semelhança de nome, porta ou checkout.
- Pare/Start não mudam `systemctl enable` nem têm efeito de deploy.
- Não execute testes de lifecycle no serviço real; testes devem usar fake runner.

## Diagnóstico quando Iniciar/Parar não funciona

No mesmo usuário Linux que executa o Dev Dashboard, rode **somente leituras**:

```bash
systemctl show home-music.service -p Id -p LoadState -p ActiveState -p SubState -p FragmentPath -p Transient
stat -c '%U:%G %a %n' /usr/local/sbin/home-music-service-control
sudo -n /usr/local/sbin/home-music-service-control check
systemctl --user status dev-dashboard.service --no-pager
journalctl --user -u dev-dashboard.service -n 50 --no-pager
```

O helper deve pertencer a root:root, modo 755, e `check` deve sair com
código zero **sem pedir senha**. Se a regra NOPASSWD não estiver instalada,
reexecute `npm run service:install` no checkout atualizado do Home Music,
com o mesmo usuário. Atenção: o instalador faz build e reinicia o serviço.

Se a ação retornar `unverified`, verifique o estado do `systemd` antes de
clicar novamente: o comando pode ter sido executado. Um processo ativo com
`/ready` indisponível é apresentado como ciclo de vida concluído, mas saúde
HTTP não saudável. Erros das ações permanecem visíveis apesar do polling de
status de 10 em 10 segundos.
