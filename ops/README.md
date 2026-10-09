# Operação do ExtraOK: Neon, Render e Cloudflare

Responsável informado: **ExtraOk**. Contato público de suporte e privacidade: **extraokweb@gmail.com**. O usuário mantém outro e-mail que acompanha na conta do Render. A automação usa `OPS_ALERT_TO`, de preenchimento obrigatório, e não altera o destinatário do Render.

O usuário escolheu fazer a configuração administrativa pelos painéis. Nenhuma credencial precisa ser enviada no chat. O estado verificado está registrado abaixo; as demais seções documentam os procedimentos para operação e novas configurações.

## Estado verificado em 09/10/2026

- Restauração em PostgreSQL **18.6** real, isolado por Docker: passou. Seis migrações, 14 tabelas, igualdade dos registros sintéticos, 18 chaves estrangeiras e 12 checks. Chave errada e arquivo adulterado recusados. Diretório de dados em tmpfs conferido; containers removidos pelo próprio teste. Um ensaio anterior na versão 17 também passou.
- Versão do Neon: captura do SQL Editor, após `SHOW server_version`, mostra **18.6**. O cliente de backup e o servidor de restauração foram alinhados à versão principal 18 antes do primeiro backup real pelo workflow.
- Site, `/health`, `/ready` direto no Render e `/ready` pelo Cloudflare: passaram na consulta pública. `/ready` executa uma consulta no banco; isso não comprova backup ou retenção.
- Retenção Neon: o responsável confirmou pelo chat que selecionou **6h** e salvou no painel. Capturas confirmaram criação de uma branch com dados históricos de `production` em 09/10/2026 às 10:26 GMT-3. O operador executou a consulta na branch recuperada: 14 tabelas acessíveis, seis migrações, zero migrações incompletas, vínculos inválidos, extras órfãos e constraints não validadas. Evidência fornecida pelo operador; sem consulta administrativa autenticada pela ferramenta nem comparação integral dos registros no mesmo timestamp.
- Render: operador confirmou Health Check Path `/ready`; evento do painel e logs enviados mostram alteração, deploy live e HTTP 200 nas verificações. Capturas mostram os padrões do workspace em **Email** e **Only failure notifications**, e o serviço da API em **Use workspace default (Only failure notifications)**. O usuário informou o e-mail da conta e confirmou que acompanha essa caixa. Configuração conferida; **entrega efetiva de alerta ainda não testada**.
- Monitor no GitHub: teste de e-mail recebido, confirmado pelo operador; captura da execução manual #4 no commit `cde9a07` mostra Success. O operador confirmou `OPS_MONITOR_ENABLED=true`. Capturas, inclusive após 13:10 GMT-3, mostram zero resultados para `event:schedule`, mesmo com o workflow habilitado e o cron publicado na branch padrão `main`. O cron foi ajustado para os minutos 09, 24, 39 e 54 como tentativa de reativação, mantendo 15 minutos entre execuções. A causa não foi estabelecida e o disparo automático ainda não foi comprovado.
- Backup real no GitHub: job manual #1 no commit `baf5c96` concluído, com dois artefatos. O relatório fornecido pelo operador confirma restauração aprovada em 09/10/2026 às 12:24 GMT-3, em container novo: 14 tabelas, seis migrações, 18 chaves estrangeiras, 12 checks, zero constraints não validadas e limpeza concluída. Não houve comparação linha a linha com a origem no mesmo instante.
- O operador confirmou os secrets de backup e a cópia recuperável da chave de criptografia em seu gerenciador de senhas, fora do GitHub. Confirmou também `OPS_BACKUP_ENABLED=true` em Repository variables: programação diária às **01:17 em Brasília**, com retenção dos artefatos criptografados por **14 dias**. A primeira execução agendada do backup ainda não foi verificada; o teste aprovado foi manual.

- Recuperação de senha: o operador confirmou o teste funcional e o recebimento com e-mail diferente daquele cadastrado na conta Resend. Os itens de envio a outro destinatário e recuperação estão concluídos por essa confirmação. A ferramenta não reexecutou o fluxo nem conferiu o domínio/remetente atual no painel.

## 1. Neon: retenção e recuperação pelo painel

1. Acesse [Neon Console](https://console.neon.tech/) e selecione o projeto que abastece a API do ExtraOK.
2. Abra **Settings → Postgres → History window**. Registre o plano e o valor efetivo. Aumente a janela conforme sua necessidade e o limite/custo exibidos. A recomendação de produção do Neon é considerar sete dias; não pressuponha que seu plano permita esse valor. Janela zero desativa a recuperação histórica. [Documentação oficial](https://neon.com/docs/postgres/backup-restore/history-window).
3. Para testar sem substituir o banco principal: **Branches → New branch**. Escolha a branch de produção como origem, o nome `audit-restore-2026-10-09`, **Past data** e um horário dentro da janela disponível, posterior à migração que deseja verificar. Defina expiração de um dia e crie a branch. Anote o horário exato e o fuso selecionado. [Criação de branches](https://neon.com/docs/manage/branches).
4. No SQL Editor, selecione explicitamente **essa branch de auditoria** e o banco correto. Execute [verify-restored-database.sql](verify-restored-database.sql). O script só consulta contagens e integridade, sem retornar nomes, e-mails, tokens ou hashes de senha.
5. Compare com o estado esperado naquele horário. Se disponível, execute a mesma consulta no **Time Travel Assist**, na origem e no mesmo instante. Uma comparação com a produção atual pode divergir legitimamente por novas escritas. Registre o resultado e a duração da recuperação.
6. Mantenha a branch recuperada fora da aplicação: não troque a `DATABASE_URL` do Render. Após guardar a evidência, deixe expirar a branch de auditoria ou exclua somente ela.

Não use **Restore from history** com a branch principal como destino para este ensaio: essa operação substitui seus dados e interrompe conexões. Criar uma branch com dados históricos valida a recuperação para um destino separado. [Semântica da restauração](https://neon.com/docs/postgres/backup-restore/branch-restore).

## 2. Render: prontidão e alertas pelo painel

1. Acesse [Render Dashboard](https://dashboard.render.com/) → serviço da API ExtraOK → **Settings → Health Checks**. Configure **Health Check Path = `/ready`** e salve. Essa rota verifica a conexão PostgreSQL. O endpoint `/health` confirma somente que o processo responde. [Health checks](https://render.com/docs/health-checks).
2. No workspace, abra **Integrations → Notifications**. Escolha **Email** e **Only failure notifications** (ou nível mais abrangente, se desejar). No serviço, confira **Settings → Notifications** para garantir que nenhum override esteja em `None`.
3. Confira nos dados da conta/workspace o endereço operacional e o recebimento dos alertas. O usuário escolheu manter o e-mail existente da conta do Render, que acompanha. O contato público `extraokweb@gmail.com` no site não configura o destinatário do Render. O Render documenta alertas de serviço indisponível, deploy e cron com falha. [Notificações](https://render.com/docs/notifications).
4. Se o painel oferecer um teste de notificação, execute-o e confirme o recebimento. Caso contrário, use um serviço de teste separado para provocar uma falha controlada e verificar o canal. Não derrube a API nem troque a conexão do banco de produção para testar alertas. Sem recebimento confirmado, marque a entrega como pendente.

Os alertas nativos da API não cobrem sozinhos todos os problemas do frontend Cloudflare. O monitor externo consulta o site e as rotas de saúde; o teste de e-mail e a execução manual passaram. A ativação foi confirmada pelo operador, e a execução automática ainda precisa ser conferida.

## 3. Ferramentas locais

Execute na raiz do repositório, com Node 24, pnpm e Docker Desktop iniciado. Não é necessária instalação global adicional. Os scripts não carregam `.env` da aplicação nem substituem sua conexão de banco.

```powershell
pnpm.cmd ops:test
pnpm.cmd ops:backup:test
pnpm.cmd ops:monitor
```

`ops:backup:test` cria duas instâncias temporárias de PostgreSQL com dados sintéticos; gera, criptografa e restaura um dump. Verifica registros, vínculos e constraints. `ops:monitor` apenas consulta os quatro endpoints públicos; não envia e-mails. Relatórios ficam em `.ops-state/`.

Para uso futuro com credenciais, copie `ops/.env.example` para `ops/.env` no editor e preencha apenas as variáveis necessárias. O arquivo é ignorado pelo Git. Não sobrescreva um arquivo de configuração já preenchido.

| Operação | Variáveis necessárias |
| --- | --- |
| Ler configurações administrativas | `NEON_API_KEY`, `NEON_PROJECT_ID`, `RENDER_API_KEY`, `RENDER_SERVICE_ID` |
| Backup de origem real | `BACKUP_DATABASE_URL` direta do Neon, `BACKUP_ENCRYPTION_KEY` |
| Restaurar arquivo criptografado | `BACKUP_ENCRYPTION_KEY` da criação do arquivo |
| E-mail de alerta | `OPS_RESEND_API_KEY`, `OPS_ALERT_FROM` verificado no Resend, `OPS_ALERT_TO` |

`BACKUP_ENCRYPTION_KEY` deve conter 32 bytes aleatórios, representados por 64 caracteres hexadecimais. Gere em um gerenciador seguro, mantenha uma cópia recuperável e separada dos backups. Sem a chave, não há recuperação. O script recusa valor vazio ou formato inválido; não fornece segredo padrão.

```powershell
pnpm.cmd ops:hosting
pnpm.cmd ops:backup
pnpm.cmd ops:restore ".backups/NOME-DO-ARQUIVO.pgdump.enc"
```

`ops:hosting` faz somente GET nas APIs administrativas e registra retenção/versão PostgreSQL e o caminho do health check. Não confirma destinatários do Render. Sem acesso, retorna código 2 e `pending-access`.

O backup usa `pg_dump` em leitura, conexão direta (recusa `-pooler.`), TLS `verify-full` em origem remota e AES-256-GCM. Apenas o arquivo criptografado é gravado. A restauração autentica o arquivo antes de executar SQL, cria sempre um container novo, com porta em loopback e dados em tmpfs, e remove esse container ao terminar. Não existe parâmetro de destino remoto. Restaure somente arquivos de origem confiável.

Limites: imagem PostgreSQL **18.6** (`postgres:18.6-alpine3.24`); confirme a versão do servidor antes de usar, pois `pg_dump` não aceita servidor de versão principal mais nova. Na imagem 18, `PGDATA` é `/var/lib/postgresql/18/docker`; o tmpfs deve cobrir `/var/lib/postgresql`. O script confere ambos antes de restaurar. Dumps limitados a 512 MiB e operações a dez minutos; bancos maiores exigem ferramenta apropriada. O script valida as tabelas atuais do ExtraOK, não roles globais nem objetos externos ao banco. A limpeza automática depende de execução normal; após interrupção abrupta, confira containers com label `extraok.restore-drill` antes de remover exclusivamente os recursos do ensaio. [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html), [diretório da imagem Docker](https://hub.docker.com/_/postgres).

Para testar o canal de e-mail, depois de configurar um remetente autorizado:

```powershell
pnpm.cmd ops:monitor --send-test-alert
```

Esse comando envia **um e-mail de teste** ao destinatário configurado. `accepted-by-provider` confirma somente a aceitação pelo Resend. Confira o recebimento na caixa de entrada/spam. `pnpm.cmd ops:monitor --notify` envia e-mail apenas quando uma verificação falha. Modos de notificação recusam configuração vazia mesmo que o site esteja saudável; `--check-config` confere o preenchimento sem consultar a rede nem enviar e-mail.

No GitHub, `OPS_ALERT_FROM` aceita somente o endereço, sem o nome de exibição (`Nome <endereco>`). Essa variável configura o monitor, separadamente de `EMAIL_FROM` da API no Render. O remetente de testes `onboarding@resend.dev` restringe a entrega real ao e-mail da própria conta Resend; para outros destinatários, inclusive usuários em recuperação de senha, configure um domínio verificado e seu remetente. [Restrição do Resend](https://resend.com/docs/api-reference/errors).

## 4. Automação no GitHub

- `.github/workflows/availability.yml`: programação nos minutos 09, 24, 39 e 54 de cada hora (intervalo de 15 minutos), até quatro tentativas com timeout de 25 segundos por endpoint e intervalo de cinco segundos (janela aproximada de 115 segundos), checagem do HTML/JSON e alerta se a falha persistir. Interrompe as tentativas ao obter todas as respostas válidas; preserva cada resultado em `attemptHistory` e indica recuperação em `recoveredAfterRetry`.
- O operador confirmou que a API usa Render Free. Esse plano suspende o serviço após 15 minutos sem tráfego e pode levar cerca de um minuto para iniciá-lo. A janela do monitor acomoda essa inicialização, mas não elimina a demora percebida pelos usuários nem garante recuperação. Timeouts isolados não comprovam que essa foi a causa: consulte os logs do Render no mesmo horário. [Comportamento do Render Free](https://render.com/docs/free#spinning-down-on-idle).
- `.github/workflows/database-backup.yml`: programação diária às 04:17 UTC (01:17 em Brasília), dump criptografado, restauração isolada e retenção dos artefatos criptografados por 14 dias.
- Cada agendamento depende de sua variável: `OPS_MONITOR_ENABLED=true` / `OPS_BACKUP_ENABLED=true` em **GitHub → Settings → Secrets and variables → Actions → Variables**. O disparo manual executa mesmo sem essas flags. O estado confirmado pelo operador está registrado no início deste documento.
- Para ativar, publique os workflows na branch padrão, cadastre `BACKUP_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` e `OPS_RESEND_API_KEY` em **Secrets**, e `OPS_ALERT_FROM` / `OPS_ALERT_TO` em **Variables**. Faça uma execução manual, baixe o arquivo criptografado, teste uma restauração com sua chave preservada e confirme o recebimento do alerta. Só então habilite os agendamentos.
- Em **Actions → Availability and alerts → Run workflow**, marque `send_test_alert` para enviar um e-mail de teste. Desmarque essa opção para testar as quatro verificações públicas com notificação em caso de falha. Não é necessário tornar o serviço indisponível para testar o e-mail.
- O acesso aos artefatos também deve ser restrito. Mantenha a chave fora dos artefatos e preserve uma cópia dos backups fora do mesmo domínio de falha conforme sua necessidade. A retenção de 14 dias desses arquivos não altera a janela histórica do Neon.
- GitHub Actions pode atrasar ou descartar execuções agendadas. Essa programação não garante SLA de 15 minutos nem execução diária pontual; confira a idade do último backup bem-sucedido e mantenha os alertas nativos do provedor. [Limitações de schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## 5. Documentos públicos e CSP

Conteúdo em `apps/web/src/features/legal/legal-content.ts`; rotas públicas `/termos` e `/privacidade`. Cadastro abre os links em nova aba. Identidade e contato refletem as informações fornecidas pelo responsável. Os registros anteriores de `termsVersion` correspondem à declaração apresentada na época: publicar novos documentos não demonstra aceite retroativo, e esta entrega não altera esses registros nem a configuração da API. Uma nova exigência contratual deve coordenar texto, `TERMS_VERSION` e eventual novo aceite.

Referências usadas na redação: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [CDC](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), [direitos do titular — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados). Os documentos descrevem o produto e o canal informado; não representam certificação de conformidade das operações do responsável.

`apps/web/public/_headers` configura os assets do Cloudflare; `apps/web/nginx.conf` mantém a política equivalente no deploy Docker. Scripts inline/eval são bloqueados; `frame-ancestors 'none'` e `X-Frame-Options: DENY` impedem incorporação em iframe. Estilos inline são necessários para styled-components, Radix e animações. O Zod recebe `jitless: true` antes da criação dos schemas, evitando geração dinâmica de código. A permissão de domínios Mercado Pago atende à integração opcional; mudanças de fornecedor devem ser revalidadas. [Cloudflare](https://developers.cloudflare.com/workers/static-assets/headers/), [Zod e CSP](https://zod.dev/compile#content-security-policy).

## Evidências a registrar nos painéis

- [ ] Plano Neon, versão PostgreSQL, nome da branch de produção e janela histórica efetiva.
- [ ] Branch separada criada com dados históricos; horário/fuso e consulta de integridade sem erros.
- [ ] Branch de auditoria removida/expirada, produção preservada.
- [ ] Render usando `/ready` e notificações de falha habilitadas para o serviço.
- [ ] Destinatário efetivo conferido; e-mail de teste recebido, com horário e evento.
- [ ] Monitor externo e backup independente ativados, se adotados, com execução comprovada.

Registre apenas estado, datas e resultados sanitizados; não coloque URLs de conexão, tokens ou dados de clientes no relatório.
