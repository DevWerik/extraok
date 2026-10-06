# Planos e Pix do ExtraOK

O prestador paga pelo uso do ExtraOK. O pagamento dos serviços extras entre prestador e cliente continua separado.

| Plano | Valor | Atendimentos com primeiro link | Período |
| --- | --- | --- | --- |
| Gratuito | R$ 0 | 3 | Mês civil no horário de São Paulo |
| Pro | R$ 9,99 | 50 | 30 dias |
| Negócio | R$ 19,99 | 200 | 30 dias |

O catálogo oficial da aplicação está em `src/modules/billing/plans.ts`; a interface consulta a API, sem manter outra tabela de preços.

Os preços do catálogo valem para novas cobranças. Cobranças já geradas, inclusive Pix pendentes reutilizados, mantêm o valor registrado na criação; a confirmação e o histórico usam esse mesmo valor. Períodos já comprados preservam seus limites e datas.

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

Os benefícios não exigem migration própria; a integração Pix/Orders exige `0004_pix_orders`, conforme a seção de ativação. Publique primeiro a API (catálogo e permissões) e depois o frontend. Modelos de serviços, duplicação e personalização visual não fazem parte desta etapa e não são anunciados nos planos.

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

Antes de ativar, execute na raiz `pnpm.cmd billing:check`. O comando lê as variáveis do terminal e `apps/api/.env`, lista somente os nomes das configurações pendentes e consulta o banco em modo de leitura para conferir as tabelas e as migrations `0003_pix_billing` e `0004_pix_orders`. Não altera dados nem cria cobranças. Código de saída `1` indica pendências. Para verificar o ambiente publicado, execute na raiz do repositório no serviço da API `pnpm --filter @extraok/api exec node dist/scripts/check-billing.js` (ou `node dist/scripts/check-billing.js` se o diretório atual já for `apps/api`); rodar localmente não consulta as variáveis do Render. A validação do token e a entrega do webhook continuam exigindo homologação com o provedor.

No Docker Compose, use `docker compose exec api node apps/api/dist/scripts/check-billing.js` após reconstruir a imagem. A imagem inclui os arquivos de migration necessários à conferência, e o comando usa as variáveis já definidas no container.

1. Na conta recebedora do Mercado Pago, conclua a verificação cadastral e cadastre uma chave Pix. Em **Criar aplicação**, selecione **Checkout Transparente → Tipo de API: API de Orders**, com nome `ExtraOK`. Novas cobranças usam `POST /v1/orders`, `type=online`, `processing_mode=automatic` e uma única transação `payment_method.id=pix`, `type=bank_transfer`. Os valores são strings decimais calculadas no servidor, e a expiração é `PT30M`.
2. Confira os custos da sua conta. As taxas são do provedor e não são calculadas no preço do plano pelo código.
3. Mantenha `BILLING_ENABLED=false` no Render durante a atualização. Se já houver cobranças ativas, salve e publique essa desativação **antes de aplicar a migration**, evitando que a API antiga crie registros com o padrão novo. Confirme o banco de destino, faça o backup previsto para produção e aplique as migrations versionadas, inclusive `0003_pix_billing`, `0004_pix_orders` e `0005_pix_risk_data`. Com `DATABASE_URL` definida explicitamente no terminal para a conexão direta do banco, execute na raiz: `pnpm.cmd db:migrate:deploy` (no terminal Linux do Render, `pnpm db:migrate:deploy`). Depois remova a variável temporária do terminal local. A migration `0004_pix_orders` marca todas as tentativas existentes como `payments`, inclusive as que perderam a resposta do provedor; novas tentativas usam `orders`. A `0005_pix_risk_data` acrescenta o Device ID temporário, o motivo sanitizado da recusa e a data da primeira recusa. Este desenvolvimento não aplica migrations no banco remoto automaticamente.
4. Em **Mercado Pago → Suas integrações → ExtraOK → Webhooks → Configurar notificações**, configure o evento **Order (Mercado Pago)**. A notificação usa `type=order`, com ID `ORD...` (algumas telas/documentações chamam o tópico de `orders`). A URL é `https://SEU-DOMINIO/api/v1/billing/webhooks/mercadopago`, sem parâmetros ou barra final. Para a API configurada em `apps/web/wrangler.jsonc`, pode-se usar diretamente `https://extraok-api.onrender.com/api/v1/billing/webhooks/mercadopago`. Copie a assinatura secreta gerada nessa mesma aplicação. **Orders exige configurar a URL no painel**: ela não é enviada como `notification_url` na criação. Se existirem cobranças antigas, mantenha também as notificações Pagamentos (`payment`) e o acesso da credencial aos pagamentos dessa conta durante a transição. A compatibilidade legada pressupõe a mesma assinatura secreta; outra aplicação exige concluir/reconciliar as cobranças antigas antes de trocar as credenciais.
5. Configure as variáveis abaixo em **Render → serviço da API → Environment**. Para executar a API diretamente no desenvolvimento local, elas pertencem a **`apps/api/.env`**. Se usar **Docker Compose**, configure-as no **`.env` da raiz**: `compose.yaml` encaminha esses valores apenas para a API. Não use variáveis `VITE_*` para credenciais.

| Variável | Origem e finalidade |
| --- | --- |
| `BILLING_ENABLED` | `true` depois das configurações; `false` desativa novas cobranças e reconciliação, mantendo o catálogo e os limites |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado da aplicação Orders recebedora; use a credencial da seção Produção para pagamentos reais |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta exibida nas configurações de Webhooks |
| `MERCADOPAGO_COLLECTOR_ID` | ID numérico da conta recebedora (`id` em `GET /users/me` com o mesmo Access Token) |
| `MERCADOPAGO_WEBHOOK_URL` | A URL HTTPS exata cadastrada no painel na etapa 4; esta variável não cadastra automaticamente o webhook de Orders |
| `MERCADOPAGO_LIVE_MODE` | `true` em produção; `false` nos testes com `NODE_ENV=test` ou `development` |

6. Publique a API atualizada depois da migration, mantendo `BILLING_ENABLED=false`. Confira o resultado de `billing:check`; apenas o indicador de cobrança habilitada deve continuar pendente. Publique também o frontend atualizado, que permite revisar o nome completo e coleta o Device ID. Depois altere para `BILLING_ENABLED=true` e use **Save and deploy**. O Worker existente encaminha `/api/*`, incluindo corpo, query e headers de assinatura. Nenhuma chave de pagamento precisa ir para o Cloudflare/frontend.
7. Confira `/health`, `/ready`, o catálogo na página inicial e **Meu plano** autenticado. Sem as credenciais, os botões pagos mostram indisponibilidade; não existe modo de pagamento falso para usuários.
8. Valide primeiro em ambiente de testes separado, com credenciais de teste e `MERCADOPAGO_LIVE_MODE=false`. A documentação de Orders usa o nome `APRO` no pagador para o cenário Pix aprovado; credenciais de teste também podem começar por `APP_USR`, portanto o prefixo não comprova produção. O sandbox pode devolver a imagem QR vazia, mantendo o Pix Copia e Cola. Depois, faça uma compra real controlada pela interface com uma conta comum do ExtraOK (a conta proprietária isenta não pode comprar). Verifique a notificação validada, o período, o consumo e o reembolso total/parcial pelo painel. Dados de teste não liberam períodos em produção.

## Compatibilidade e validação de Orders

- `providerApi` registra a API de cada tentativa, e `providerId` guarda o ID da order `ORD...` para novas cobranças. IDs numéricos antigos continuam consultando Payments. Uma tentativa antiga sem ID remoto repete o POST original em Payments com a mesma chave; não cria outra cobrança em Orders. Não altere manualmente esses campos.
- O backend consulta a order autenticada após a criação e a cada notificação. Só libera o plano quando order e transação estão `processed/accredited` e os valores efetivamente pagos conferem integralmente. `processed/partially_refunded`, reembolso confirmado ou contestação revogam o período conforme a regra existente.
- Orders nem sempre devolve `live_mode`. Para Pix, o backend confere o modo pela URL de ticket fornecida pela API autenticada (`https://www.mercadopago.com.br/sandbox/payments/.../ticket` ou `/payments/.../ticket`), confrontando `live_mode` quando ele existir. Pedidos de teste também podem usar `ORDTST` seguido de 26 caracteres: esse identificador retornado pela API autenticada comprova sandbox mesmo quando o ticket já não aparece após a aprovação. Qualquer indicação de modo real nesse pedido é rejeitada. O prefixo comum `ORD` não comprova produção.
- Se uma order com transação omitir esses indicadores, o backend consulta `GET /users/me` com o mesmo token. Exige uma conta brasileira, o mesmo ID de `order.user_id` e a lista `tags` válida: `test_user` identifica o vendedor de teste usado pelo sandbox de Orders. A configuração `MERCADOPAGO_LIVE_MODE` continua sendo comparada com o modo verificado antes de processar a cobrança; não é usada como prova. Conta incompleta, recebedor diferente, divergência de modo ou falha na consulta impede processar o pagamento. Essa consulta não cria cobranças e também atende polling, webhooks e reconciliação. Homologue esse formato com a credencial da sua aplicação antes de habilitar vendas.
- Orders sem transação pronta ficam aguardando, sem liberação de plano. O ID já salvo permite buscar o QR Code pelo polling/reconciliador, sem novo POST. A falta de imagem não impede o uso do Pix Copia e Cola.
- A API de Orders não fornece `date_approved` nesse contrato; `approvedAt` registra a atualização autenticada que confirmou a aprovação e é preservado nas consultas seguintes. O período de 30 dias continua começando na concessão local ou depois do último período já comprado.

## Segurança e recuperação de falhas

- Apenas a rota exata do webhook substitui o controle de `Origin` por autenticação HMAC-SHA256. As demais rotas preservam a proteção original. GETs privados e compras exigem sessão e proprietário.
- O webhook usa o `data.id` da query assinada e busca a order ou o pagamento legado na API autenticada. Aceita a assinatura com o ID alfanumérico em minúsculas e com a caixa original usada pelo SDK oficial; ambos vinculam a mesma order. Nunca concede acesso com base no corpo recebido, no navegador ou em um comprovante.
- Notificações Pix autenticadas e válidas de outras vendas, sem referência ao ExtraOK, são ignoradas sem acessar o banco ou liberar plano. Respostas incompatíveis com o contrato Pix são rejeitadas. Ao consultar uma cobrança própria, a referência correspondente continua obrigatória.
- Antes de conceder acesso, confere referência interna, ID do pagamento, conta recebedora, modo teste/produção, Pix, BRL e valor exato. O valor e o limite vêm do backend.
- Cada tentativa usa uma UUID persistida como chave de idempotência no provedor. Há no máximo uma cobrança em aberto por proprietário. Repetir uma tentativa ou abrir duas abas reutiliza o Pix pendente.
- Uma cobrança concede no máximo um período. Travas por proprietário, chave única por pagamento e datas de atualização protegem contra concorrência e notificações repetidas ou fora de ordem.
- O CPF é validado, enviado ao Mercado Pago e fica temporariamente no registro para recuperar uma criação cujo retorno foi perdido. É removido quando o pagamento é vinculado ao provedor ou quando a tentativa expira. Não é retornado pela API nem incluído nos logs. O e-mail vem da conta autenticada; o nome completo é revisado no checkout e registrado apenas nessa cobrança, sem alterar o cadastro ou cobranças anteriores. Clientes antigos podem omitir o nome revisado e usar o nome completo já existente no cadastro.
- O frontend acompanha o pagamento e o backend reconcilia lotes a cada minuto, inclusive sem aba aberta. Cobranças aprovadas de períodos vigentes são revisitadas para recuperar reembolsos. Falhas são tentadas novamente sem criar outro pagamento.
- Se a criação retornar erro e o resumo depois confirmar o resultado da mesma tentativa, o frontend troca o formulário pelo estado conhecido da cobrança. Uma recusa confirmada encerra o polling automático e não fica escondida por dados antigos de uma consulta que falhou. Isso não altera a decisão do Mercado Pago nem libera plano sem confirmação.
- Webhooks só recebem sucesso depois de processados. Se banco ou provedor falharem, a resposta de erro permite nova entrega. Monitore falhas no painel do Mercado Pago e os avisos de reconciliação na API. A reconciliação é complementar; mantenha o webhook operacional.
- Um Pix tem validade inicial de 30 minutos. Ao expirar, não há liberação local; uma confirmação autêntica posterior ainda pode recuperar um pagamento realizado.

## Dados do pagador e recusa por risco

- Novos cadastros exigem nome e sobrenome. A tela de pagamento permite revisar o nome completo, exibe o e-mail da conta e solicita o CPF. As validações de formato não verificam identidade, titularidade do CPF ou a decisão do antifraude. Não há sobrenome inventado quando o nome estiver incompleto.
- O checkout carrega `https://www.mercadopago.com/v2/security.js` com `view=checkout`, obtém `MP_DEVICE_SESSION_ID` e o envia no corpo privado ao ExtraOK. O backend encaminha o valor no header `X-meli-session-id` ao criar a cobrança. Sem obter um identificador válido em até cinco segundos, a interface informa que não conseguiu preparar o pagamento e não envia a compra. A API mantém o campo opcional para clientes e tentativas anteriores. Não há identificador falso como fallback. Consulte as [recomendações oficiais da Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/improve-payment-approval/recommendations).
- O Device ID fica temporariamente no registro para que reenvios após perda de resposta usem os mesmos dados e a mesma chave. É apagado ao vincular o recurso do provedor ou expirar a tentativa sem recurso. O identificador, CPF, nome e e-mail não aparecem nas respostas públicas de cobrança, e o Device ID não é incluído nos logs.
- HTTP 402 na criação de uma order pode indicar que a order foi criada e a transação falhou. Quando a resposta contém um ID válido, o backend consulta esse ID e aplica todas as verificações de referência, recebedor, modo, método, moeda e valor. Sem uma consulta verificável, continua tratando o resultado como incerto, com a mesma tentativa persistida. Nenhum acesso é liberado a partir de um corpo de erro. Veja a [referência de criação de Orders](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/create-order/post).
- Uma recusa confirmada registra a data da primeira observação. `high_risk` ou `rejected_high_risk` da transação são normalizados para o motivo sanitizado `high_risk`; recusas desconhecidas não são rotuladas como risco. A interface mostra a orientação específica quando o motivo foi confirmado.
- Após qualquer recusa confirmada, novas cobranças da mesma conta, em qualquer plano, aguardam **10 minutos**. A API retorna `429 PAYMENT_RETRY_LATER` com `Retry-After`, e o resumo fornece `retryAvailableAt` para o contador da interface. Repetir a mesma referência recupera seu resultado, sem criar outra cobrança. Webhooks repetidos não reiniciam o intervalo. Essa pausa é uma política do ExtraOK para evitar tentativas imediatas semelhantes, não um prazo oficial de desbloqueio do Mercado Pago. Consulte a [orientação sobre recusas por risco](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/improve-payment-approval/reasons-for-rejection).

Depois de publicar a migration, API e frontend, valide a preparação do checkout e o fluxo Pix em um ambiente de testes separado. Dados de teste pertencem ao sandbox. Uma compra real controlada deve usar dados reais e seguir a homologação da etapa 8. Esses ajustes melhoram os dados da análise; não garantem aprovação.

## Diagnosticar PAYMENT_UNAVAILABLE em uma cobrança existente

O diagnóstico abaixo autentica a credencial fornecida, busca a referência nas orders dos últimos sete dias e aplica a mesma validação da API às orders encontradas. Usa somente GETs no Mercado Pago: não consulta o banco, não cria nem altera cobranças e não carrega `.env`. A saída contém apenas dados técnicos selecionados, sem token, CPF, e-mail ou código Pix. A busca por referência segue a [documentação oficial de Orders](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/search-order/get).

Execute no PowerShell, na raiz do projeto. Substitua `UUID-DA-COBRANCA` pelo ID interno visto em `/billing/payments/:id`. Quando solicitado, cole o mesmo Access Token configurado em **Render → Environment → MERCADOPAGO_ACCESS_TOKEN**; a entrada fica oculta e não é salva no histórico:

```powershell
$pixDiagnosticoSeguro = Read-Host "Access Token configurado no Render" -AsSecureString
try {
    $pixDiagnosticoToken = [System.Net.NetworkCredential]::new('', $pixDiagnosticoSeguro).Password
    $pixDiagnosticoToken | pnpm.cmd --filter @extraok/api exec tsx src/scripts/diagnose-pix.ts UUID-DA-COBRANCA
}
finally {
    Remove-Variable pixDiagnosticoToken, pixDiagnosticoSeguro -ErrorAction SilentlyContinue
}
```

`account.mode=test` identifica uma conta de teste; compare `account.collectorId` com `MERCADOPAGO_COLLECTOR_ID` no Render. `normalized=false` informa a validação que falhou. `provider.statusDetail` e `provider.payments[].statusDetail` mostram códigos técnicos de uma lista restrita dos status documentados; texto livre ou desconhecido aparece como `unrecognized`, sem expor seu conteúdo. `NO_MATCH_IN_LAST_7_DAYS` significa que essa credencial não encontrou a referência nesse intervalo; não prova que o Pix nunca foi criado. Uma consulta local bem-sucedida não comprova as variáveis efetivamente publicadas no Render, a entrega do webhook nem a liberação do plano. Nunca mude a chave de idempotência para contornar o diagnóstico.

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

Documentação oficial consultada em 2026-10-05: [Pix / Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix), [consulta da order](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/get-order/get), [Webhooks de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications), [status da order](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status), [teste de Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix), [tipos do SDK oficial](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/order/commonTypes.ts), [assinatura no SDK](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts).
