# Planos e Pix do ExtraOK

O prestador paga pelo uso do ExtraOK. O pagamento dos serviços extras entre prestador e cliente continua separado.

| Plano | Valor | Atendimentos com primeiro link | Período |
| --- | --- | --- | --- |
| Gratuito | R$ 0 | 3 | Mês civil no horário de São Paulo |
| Pro | R$ 29,90 | 50 | 30 dias |
| Negócio | R$ 59,90 | 200 | 30 dias |

O catálogo oficial da aplicação está em `src/modules/billing/plans.ts`; a interface consulta a API, sem manter outra tabela de preços.

## Benefícios por assinatura

| Benefício | Gratuito | Pro | Negócio |
| --- | --- | --- | --- |
| Clientes, extras, aprovação pelo celular, histórico, reenvio e dashboard básico | Sim | Sim | Sim |
| PDF do atendimento, extras e respostas | — | Sim | Sim |
| Relatórios por período, cliente e status | — | — | Sim |
| Exportação dos relatórios em CSV | — | — | Sim |

O catálogo retorna `features` e `benefits` por plano. O resumo `/billing` retorna `current.features`, calculado pelo período pago vigente, sem depender da disponibilidade de novas cobranças Pix. As rotas de cada benefício conferem o plano no servidor e restringem consultas ao proprietário autenticado. Ausência de período, vencimento ou revogação retornam ao Gratuito; um período futuro não antecipa benefícios. Exportar não consome atendimentos com link. Os dados existentes e arquivos já baixados são preservados.

Em `/relatorios`, as datas inicial e final são inclusivas no horário de Brasília e filtram **a data agendada do atendimento**. Os totais representam o estado atual dos extras desses atendimentos, inclusive respostas recebidas fora do período; não representam valores pagos nem são filtrados pela data de resposta. A taxa de aprovação considera apenas extras respondidos. O período máximo é 366 dias; a tela pagina 25 atendimentos e os totais consideram todas as páginas. O CSV exporta todos os resultados dos mesmos filtros, até 5.000 atendimentos, e rejeita volumes maiores sem truncar o arquivo. Usa UTF-8 com BOM, separador `;`, decimal `,` e neutralização de fórmulas de planilha.

O PDF inclui identificação do atendimento, empresa, contatos do cliente, descrição, extras, status, datas de resposta e totais. Não inclui notas internas do cliente, tokens, dados de cobrança nem assinatura digital. Suporta até 500 extras por documento e não comprova pagamento nem substitui nota fiscal. É gerado com [PDFKit](https://pdfkit.org/docs/text.html) e fontes Noto Sans distribuídas pelo Fontsource, sem consultar serviços externos na exportação.

Esta etapa não exige nova migration. Publique primeiro a API (novo catálogo e permissões) e depois o frontend. Modelos de serviços, duplicação e personalização visual não fazem parte desta etapa e não são anunciados nos planos.

## Acesso do proprietário sem cobrança

`BILLING_OWNER_USER_ID` é uma configuração opcional e exclusiva da API. Informe o UUID de uma conta existente para liberar todos os benefícios, sem cota mensal de atendimentos com link e sem vencimento de assinatura. Vazio ou ausente mantém as regras dos planos; valor malformado impede a inicialização da API. A configuração não concede acesso a dados de outras contas e não altera a validade dos links nem limites técnicos das exportações.

Para localizar a conta no banco configurado, execute na raiz:

```powershell
pnpm.cmd billing:owner seu-email@example.com
```

O comando lê `apps/api/.env` e variáveis do terminal, busca somente ID e e-mail em uma transação de leitura e imprime `BILLING_OWNER_USER_ID=...`. Não altera contas, pagamentos ou permissões. O identificador deve pertencer à conta desejada no mesmo banco usado pela API.

- Desenvolvimento local: configure `BILLING_OWNER_USER_ID` em `apps/api/.env` e reinicie a API.
- Produção: configure a variável em **Render → serviço da API → Environment** e reinicie/republique o serviço depois de publicar este código.
- Docker Compose: configure no `.env` da raiz, que a repassa somente à API. Se o banco do Docker for diferente, localize o ID nesse banco.
- Não configure essa permissão no frontend, em variáveis `VITE_*`, no cadastro ou no Mercado Pago. O e-mail não concede a isenção; alterar/recriar uma conta com o mesmo e-mail não transfere o acesso.

O resumo autenticado retorna `current.billingExempt=true`, benefícios do Negócio e `null` em limite, saldo, datas e `nextPurchaseStartsAt`. `used` indica o total histórico de atendimentos compartilhados. O catálogo público continua com três planos. A tela **Meu plano** apresenta “Proprietário — acesso completo, sem cobrança”, sem botões para pagar ou renovar. Tentativas de criar pagamentos para a conta isenta retornam `409 BILLING_EXEMPT`, inclusive antes de chamar o provedor. A isenção funciona com `BILLING_ENABLED=false`.

O registro de primeiro compartilhamento é preservado, com `freeMonth` e `periodId` nulos durante a isenção, evitando consumo retroativo. Remover a configuração e reiniciar a API restaura o plano pago vigente ou o Gratuito; reenvios continuam sem novo consumo. Pagamentos e períodos já existentes mantêm estado e datas, inclusive reconciliação de cobranças anteriores. Não há criação de pagamentos aprovados fictícios nem alteração das regras de outras contas.

Esta configuração dispensa nova migration. Para implantação, publique a API e o frontend atualizados antes de habilitar a variável, pois clientes antigos podem não interpretar os campos nulos da isenção.

## Regras dos planos

- Conta sem período pago vigente usa o Gratuito, inclusive depois do vencimento ou reembolso.
- O consumo acontece na primeira geração de link de um atendimento. Extras, reenvios e rotações desse mesmo atendimento não gastam outra unidade.
- O limite e a criação do link são confirmados na mesma transação, com trava por proprietário. Uma falha não consome a unidade.
- A migration preserva atendimentos que já tinham qualquer link antes da implantação, sem cobrança retroativa ou consumo retroativo de cota.
- A criação e edição de clientes e atendimentos continuam disponíveis. Os links existentes mantêm sua validade original.
- Pagamento aprovado compra um período de 30 dias. Renovação antecipada, inclusive para outro plano, adiciona um período depois do último já pago. Não há troca imediata, cobrança proporcional nem reposição do limite atual.
- O novo período tem seu próprio limite; o saldo anterior não acumula. A interface informa a data antes do pagamento. Não há débito automático: para encerrar, basta não comprar outro período.
- Reembolso, inclusive parcial, ou reversão confirmada revoga o período dessa cobrança. Períodos posteriores já comprados conservam suas datas; não se apagam atendimentos nem respostas do cliente.
- Valores de aprovação de extras no dashboard não incluem as compras de plano.

## Ativar em produção

Antes de ativar, execute na raiz `pnpm.cmd billing:check`. O comando lê as variáveis do terminal e `apps/api/.env`, lista somente os nomes das configurações pendentes e consulta o banco em modo de leitura para conferir as tabelas e a migration. Não altera dados nem cria cobranças. Código de saída `1` indica pendências. Para verificar o ambiente publicado, execute dentro do serviço da API `node dist/scripts/check-billing.js`; rodar localmente não consulta as variáveis do Render. A validação do token e a entrega do webhook continuam exigindo homologação com o provedor.

No Docker Compose, use `docker compose exec api node apps/api/dist/scripts/check-billing.js` após reconstruir a imagem. A imagem inclui os arquivos de migration necessários à conferência, e o comando usa as variáveis já definidas no container.

1. Na conta recebedora do Mercado Pago, conclua a verificação cadastral, cadastre uma chave Pix e crie a aplicação de pagamentos online. A integração usa Payments API (`POST /v1/payments`, exclusivamente `payment_method_id=pix`).
2. Confira os custos da sua conta. As taxas são do provedor e não são calculadas no preço do plano pelo código.
3. Aplique a migration `0003_pix_billing` antes de publicar o novo código, inclusive se mantiver as cobranças desativadas. Ela também sustenta o limite Gratuito. Confirme o banco de destino e siga o procedimento normal de backup e implantação. Com `DATABASE_URL` definida explicitamente no terminal para a conexão direta do banco, execute na raiz do repositório: `pnpm.cmd db:migrate:deploy`. Depois remova essa variável temporária do terminal. Este desenvolvimento não aplica migrations no banco remoto automaticamente.
4. Em **Mercado Pago → Suas integrações → aplicação → Webhooks**, configure o tópico **Pagamentos (`payment`)**, não Orders/Assinaturas/QR presencial. A URL é `https://SEU-DOMINIO/api/v1/billing/webhooks/mercadopago`. Cadastre o domínio real da aplicação, sem parâmetros ou barra final.
5. Configure as variáveis abaixo em **Render → serviço da API → Environment**. Para executar a API diretamente no desenvolvimento local, elas pertencem a **`apps/api/.env`**. Se usar **Docker Compose**, configure-as no **`.env` da raiz**: `compose.yaml` encaminha esses valores apenas para a API. Não use variáveis `VITE_*` para credenciais.

| Variável | Origem e finalidade |
| --- | --- |
| `BILLING_ENABLED` | `true` depois das configurações; `false` desativa novas cobranças e reconciliação, mantendo o catálogo e os limites |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado da aplicação recebedora |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta exibida nas configurações de Webhooks |
| `MERCADOPAGO_COLLECTOR_ID` | ID numérico da conta recebedora (`id` em `GET /users/me` com o mesmo Access Token) |
| `MERCADOPAGO_WEBHOOK_URL` | A URL HTTPS exata cadastrada na etapa 4 |
| `MERCADOPAGO_LIVE_MODE` | `true` em produção; `false` nos testes com `NODE_ENV=test` ou `development` |

6. Publique a API e o frontend. O Worker existente encaminha `/api/*`, incluindo corpo, query e headers de assinatura. Nenhuma chave de pagamento precisa ir para o Cloudflare/frontend. O Nginx existente também encaminha esses headers e permite imagens PNG em `data:` para o QR Code.
7. Confira `/health`, `/ready`, o catálogo na página inicial e **Meu plano** autenticado. Sem as credenciais, os botões pagos mostram indisponibilidade; não existe modo de pagamento falso para usuários.
8. Valide primeiro em ambiente de testes conforme a documentação do Mercado Pago. Depois, faça uma compra real controlada pela interface, verifique a notificação validada, o período, o consumo e o reembolso pelo painel do provedor. Dados de teste não liberam períodos em produção.

## Segurança e recuperação de falhas

- Apenas a rota exata do webhook substitui o controle de `Origin` por autenticação HMAC-SHA256. As demais rotas preservam a proteção original. GETs privados e compras exigem sessão e proprietário.
- O webhook usa o `data.id` da query assinada e busca o pagamento na API autenticada. Nunca concede acesso com base no corpo recebido, no navegador ou em um comprovante.
- Notificações autenticadas de outras vendas, sem referência ao ExtraOK, são ignoradas sem acessar o banco ou liberar plano. Ao consultar uma cobrança própria, a referência correspondente continua obrigatória.
- Antes de conceder acesso, confere referência interna, ID do pagamento, conta recebedora, modo teste/produção, Pix, BRL e valor exato. O valor e o limite vêm do backend.
- Cada tentativa usa uma UUID persistida como chave de idempotência no provedor. Há no máximo uma cobrança em aberto por proprietário. Repetir uma tentativa ou abrir duas abas reutiliza o Pix pendente.
- Uma cobrança concede no máximo um período. Travas por proprietário, chave única por pagamento e datas de atualização protegem contra concorrência e notificações repetidas ou fora de ordem.
- O CPF é validado, enviado ao Mercado Pago e fica temporariamente no registro para recuperar uma criação cujo retorno foi perdido. É removido quando o pagamento é vinculado ao provedor ou quando a tentativa expira. Não é retornado pela API nem incluído nos logs. E-mail/nome são o retrato da conta na geração da cobrança.
- O frontend acompanha o pagamento e o backend reconcilia lotes a cada minuto, inclusive sem aba aberta. Cobranças aprovadas de períodos vigentes são revisitadas para recuperar reembolsos. Falhas são tentadas novamente sem criar outro pagamento.
- Webhooks só recebem sucesso depois de processados. Se banco ou provedor falharem, a resposta de erro permite nova entrega. Monitore falhas no painel do Mercado Pago e os avisos de reconciliação na API. A reconciliação é complementar; mantenha o webhook operacional.
- Um Pix tem validade inicial de 30 minutos. Ao expirar, não há liberação local; uma confirmação autêntica posterior ainda pode recuperar um pagamento realizado.

## Endpoints

| Método | Endpoint sob `/api/v1` | Acesso |
| --- | --- | --- |
| GET | `/billing/plans` | Público; catálogo e disponibilidade |
| GET | `/billing` | Conta autenticada; plano, uso, períodos futuros e 20 cobranças recentes |
| POST | `/billing/payments` | Conta autenticada; `{ planId, cpf, idempotencyKey }` |
| GET | `/billing/payments/:id` | Somente dono; consulta e sincronização com intervalo mínimo |
| POST | `/billing/webhooks/mercadopago?data.id=...` | Assinatura válida; confirmação/reembolso |
| GET | `/jobs/:id/pdf` | Dono com Pro ou Negócio vigente; PDF para download; 5/min por IP |
| GET | `/reports/jobs?from=2026-09-01&to=2026-09-30` | Negócio vigente; opcionais `clientId`, `status`, `page`; 30/min por IP |
| GET | `/reports/jobs.csv?from=2026-09-01&to=2026-09-30` | Negócio vigente; mesmos filtros; exporta todas as páginas; 5/min por IP |

## Validação

Use apenas pnpm, a partir da raiz:

```powershell
pnpm.cmd --filter @extraok/api typecheck
pnpm.cmd --filter @extraok/web typecheck
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd run build
```

Os testes de integração exigem `TEST_DATABASE_URL` de um PostgreSQL **exclusivo de testes**, com todas as migrations aplicadas. Nunca use o banco de produção. Os pagamentos são simulados pelo transporte injetado somente nos testes; nenhuma cobrança real é criada pela suíte. Valide também o viewport móvel, teclado, copiar Pix, expiração e atualização da tela depois do pagamento.

Na validação local desta implementação, a suíte passou com PGlite descartável e os arquivos de teste da API em sequência (`--test-concurrency=1`), preservando as requisições simultâneas dentro de cada teste. Isso não substitui o teste de concorrência com conexões independentes em PostgreSQL nativo nem a homologação com o Mercado Pago.

Documentação oficial consultada: [Pix / Payments](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [custos do Checkout](https://www.mercadopago.com.br/ferramentas-para-vender/check-out).
