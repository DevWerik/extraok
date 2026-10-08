# Pix com Stripe no ExtraOK

O Stripe Checkout recebe pagamentos avulsos **somente por Pix**, em BRL. Pro custa R$ 9,99 e Negócio R$ 19,99; cada compra mantém os limites e os 30 dias do catálogo da API. Não há cartão, assinatura recorrente ou renovação automática. A conta proprietária mantém a isenção.

## 1. Criar a conta e conferir Pix

1. Crie uma conta em https://dashboard.stripe.com/register e cadastre os dados reais da empresa no Brasil. Conclua as verificações solicitadas pelo painel.
2. No painel, abra **Configurações → Formas de pagamento** e confirme se **Pix** está disponível para sua conta. Se não estiver, solicite orientação ao suporte Stripe antes de ativar a integração. A disponibilidade depende da conta; implementar o código não garante habilitação.
3. Comece no ambiente de testes da Stripe. Prefira uma chave **restrita** de teste (`rk_test_...`), obtenha o ID da conta (`acct_...`) e o segredo do webhook (`whsec_...`). Chaves secretas `sk_test_...` também são aceitas. Não use a chave publicável `pk_...` no backend.

Esta implementação confere pela API que a conta autenticada é brasileira e corresponde a `STRIPE_ACCOUNT_ID`. Contas de outros países não são aceitas, evitando alterar o valor do plano com conversão cambial/IOF.

## 2. Configurar a API

Para desenvolvimento, os valores ficam em `apps/api/.env`. No site publicado, configure em **Render → serviço extraok-api → Environment**. No Docker Compose, use o `.env` da raiz. Não coloque chaves no frontend nem em variáveis `VITE_*`.

```dotenv
BILLING_ENABLED=false
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=rk_test_SUBSTITUA_NO_AMBIENTE_LOCAL
STRIPE_WEBHOOK_SECRET=whsec_SUBSTITUA_NO_AMBIENTE_LOCAL
STRIPE_ACCOUNT_ID=acct_SUBSTITUA_NO_AMBIENTE_LOCAL
STRIPE_LIVE_MODE=false
```

Os exemplos acima são placeholders. Use as credenciais do próprio ambiente. Em produção, prefira `rk_live_...` com permissões limitadas; `sk_live_...` também é aceita. Configure o segredo do endpoint de produção e `STRIPE_LIVE_MODE=true`. O nome da variável continua `STRIPE_SECRET_KEY` para ambos os tipos. O servidor rejeita a ativação com chave de modo diferente. `WEB_ORIGIN` deve ser a origem exata do frontend: atualmente `https://app.extraok.workers.dev` no site publicado; localmente, a origem do Vite.

### Chaves restritas

Na criação da chave, escolha **Criar a própria integração → Permissões personalizadas**. A chave pertence ao backend ExtraOK hospedado no Render. Configure as permissões a partir das chamadas usadas pelo código:

| Chamada | Uso |
| --- | --- |
| `GET /v1/account` | Confirmar conta brasileira, ID recebedor e ativação de pagamentos reais |
| `POST /v1/checkout/sessions` | Criar o checkout Pix com preço e produto definidos pelo servidor |
| `GET /v1/checkout/sessions/:id` | Consultar a sessão com expansão de `payment_intent.latest_charge` |
| `GET /v1/payment_intents/:id` | Identificar a cobrança local em notificações de reembolso ou disputa |

Configure inicialmente estas permissões nas linhas individuais do painel:

| Seção e recurso | Permissão |
| --- | --- |
| Connect → Accounts (inclui `/v1/account`) | Leitura |
| Core → Charges and Refunds | Leitura |
| Core → Payment Intents | Leitura |
| Checkout Sessions → Checkout Sessions | Escrever |

A revisão deve mostrar quatro permissões: três de leitura e uma de escrita. Mantenha os demais recursos em Nenhum. `Account Evaluations` não substitui `Accounts`. A criação com `price_data.product_data` pode exigir permissões adicionais agrupadas no painel: confirme-as com uma chave restrita de teste e os erros de permissão da Stripe, sem ampliar para acesso total. O código não cria repasses, transferências, assinaturas ou reembolsos e não gerencia endpoints de webhook; a configuração do webhook é feita no painel.

Valide a chave `rk_test_...` no ambiente separado antes de aplicar as mesmas permissões à chave real. Aceitar o prefixo no código e passar testes com respostas simuladas não comprovam que as permissões da chave no painel são suficientes. Consulte [chaves restritas da Stripe](https://docs.stripe.com/keys/restricted-api-keys).

Após preencher as variáveis, execute no PowerShell, de qualquer pasta:

```powershell
pnpm.cmd --dir "C:\Users\Pichau\extraok" billing:check
```

A checagem é somente de leitura: confere configuração e migrations, sem validar a elegibilidade da conta Stripe, criar cobranças ou revelar segredos.

## 3. Migration e publicação

Aplique as migrations versionadas, incluindo `0006_stripe_checkout`, no banco correto antes de iniciar esta versão da API. Ela preserva os registros existentes, acrescenta o provedor `stripe`, amplia o ID externo e inclui a URL temporária do checkout.

No fluxo de publicação do Render, use `pnpm --filter @extraok/api prisma:migrate:deploy` após o build da API. Não execute `migrate dev` em produção. Publique API e frontend; mantenha a cobrança desabilitada durante a configuração inicial. O código não aplica migrations nem publica serviços automaticamente.

## 4. Webhook

No painel Stripe, em **Workbench → Webhooks** (ou **Destinos de eventos**), crie um endpoint para os eventos da sua conta:

```text
https://extraok-api.onrender.com/api/v1/billing/webhooks/stripe
```

Também é possível usar a mesma rota sob `https://app.extraok.workers.dev`. O Worker preserva o corpo e o header `Stripe-Signature`. Escolha **Sua conta**, formato **Snapshot** (a rota lê `data.object`), versão de API **2026-09-30.endive** e estes eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

Copie o segredo de assinatura desse endpoint para `STRIPE_WEBHOOK_SECRET`. Teste e produção possuem configurações próprias. O segredo de um listener local da Stripe CLI também é diferente do segredo do endpoint publicado.

O webhook verifica assinatura e timestamp sobre o corpo original, consulta a Stripe e valida referência, conta, modo, método Pix, BRL e valor. O pagamento só é aprovado quando sessão, PaymentIntent e charge confirmam o recebimento integral. Retornar ao site não aprova o plano. Eventos repetidos reutilizam o mesmo período; reembolso, inclusive parcial, ou disputa confirmada revoga o período associado.

## 5. Homologar e ativar

1. Em ambiente de desenvolvimento/testes separado, configure as chaves de teste e habilite `BILLING_ENABLED=true`. Gere a compra pela tela **Meu plano** e siga os cenários oficiais de Pix no Checkout de teste. Use apenas dados de teste nesse ambiente.
2. Verifique a chegada do webhook, a confirmação no histórico e a liberação de um único período. Teste duplicação/reentrega de evento, retorno antes da confirmação, expiração e reembolso parcial/total pelo painel de testes.
3. Confirme que compras de outra conta ExtraOK não podem ser consultadas. Confira a isenção do proprietário e a renovação após um período já pago.
4. Depois da homologação e da habilitação do Pix na conta real, configure as chaves de produção no Render, `STRIPE_LIVE_MODE=true`, `BILLING_PROVIDER=stripe` e `BILLING_ENABLED=true`. Use **Save and deploy** e valide `/health`, `/ready` e o resumo autenticado.

Sem conta e credenciais Stripe, os testes automatizados usam respostas simuladas; não demonstram recebimento de um Pix real nem entrega de webhook em produção.

## 6. Configuração de produção no Render

1. No painel Stripe, clique em **Alternar para conta de produção**. Conclua as pendências de ativação apresentadas pela Stripe e confira o Pix em **Configurações → Formas de pagamento** nessa conta. O Pix habilitado na área restrita não comprova a habilitação na conta real.
2. Na conta de produção, crie uma chave restrita `rk_live_...` com as permissões validadas em testes e obtenha o ID `acct_...`. Chaves `sk_live_...` também são compatíveis, mas dão acesso mais amplo à conta. O ID da área restrita pode ser diferente: confira os dados da conta real. Cadastre o webhook público descrito na seção 4 e obtenha o `whsec_...` desse destino de produção.
3. Em **Render → extraok-api → Environment**, prepare os valores abaixo. Os campos entre `<...>` precisam ser substituídos diretamente no painel; não são valores válidos. O arquivo local `apps/api/.env` continua com as credenciais de teste e não altera o Render.

   ```dotenv
   BILLING_ENABLED=false
   BILLING_PROVIDER=stripe
   STRIPE_SECRET_KEY=<chave restrita rk_live_ da conta de producao>
   STRIPE_ACCOUNT_ID=<ID acct_ da conta de producao>
   STRIPE_WEBHOOK_SECRET=<segredo whsec_ do destino publico de producao>
   STRIPE_LIVE_MODE=true
   WEB_ORIGIN=https://app.extraok.workers.dev
   ```

   Preserve as demais configurações existentes do Render, especialmente `DATABASE_URL`, `PASSWORD_PEPPER` e as credenciais do Mercado Pago usadas por cobranças antigas. `DATABASE_POOL_MAX=1` é o ajuste do Prisma Dev local; não é requisito para o PostgreSQL de produção. Durante `BILLING_ENABLED=false`, criação, webhooks e reconciliação ficam temporariamente pausados.
4. Publique o código da API e aplique `0006_stripe_checkout` no banco do Render com `pnpm --filter @extraok/api prisma:migrate:deploy`, executado na raiz do repositório após o build e antes de iniciar a nova versão. A migration e o código precisam estar na mesma publicação; o teste local não migra o banco publicado.
5. Publique o frontend com `pnpm.cmd --dir "C:\Users\Pichau\extraok" --filter @extraok/web run deploy`. O Worker configurado é `app`, com endereço esperado `https://app.extraok.workers.dev`.
6. Confira `/health`, `/ready` e `/api/v1/billing/plans` no site publicado. O catálogo deve informar `paymentProvider: "stripe"`; com a ativação ainda desligada, `pixAvailable` deve ser `false`.
7. Quando conta, Pix, credenciais, webhook, migration e versões publicadas estiverem prontos, altere somente `BILLING_ENABLED=true` no Render e use **Save and deploy**. Execute `pnpm billing:check` no ambiente do Render, se houver acesso ao terminal; a checagem local consulta outro banco e não substitui essa verificação.
8. Na primeira compra real, confira o status na Stripe, a entrega do webhook com HTTP 200 e a ativação de um único período em **Meu plano**. Uma confirmação simulada da área restrita não valida o recebimento em produção.

Nunca cole chaves em mensagens, screenshots, arquivos versionados ou variáveis do frontend. A chave publicável `pk_live_...` não é necessária para este fluxo de Checkout hospedado.

## Checkout, expiração e transição

O frontend redireciona somente para `https://checkout.stripe.com/c/pay/...`. A Stripe coleta os dados necessários do pagador e apresenta o Pix. Nenhum script antifraude do Mercado Pago é carregado para preparar compras novas com Stripe. O retorno carrega apenas o UUID interno da cobrança, que continua protegido pela sessão e pela verificação de proprietário na API.

A sessão de checkout dura uma hora; o Pix gerado dentro dela usa validade de 30 minutos. O backend persiste a tentativa antes da chamada externa e repete a mesma chave de idempotência em caso de perda de resposta. Uma tentativa recuperada continua usando seus valores originais. O backend também reconcilia pagamentos sem depender da aba do navegador.

`BILLING_PROVIDER` seleciona apenas o provedor de **novas** tentativas. Cobranças Mercado Pago já existentes mantêm `payments`/`orders`, seus IDs e o fluxo original. Conserve as credenciais e o webhook Mercado Pago enquanto houver cobranças ou períodos antigos sujeitos a confirmação/reembolso. Um Pix antigo pendente precisa ser concluído ou expirar antes de uma nova compra; trocar de provedor não autoriza uma cobrança duplicada. `BILLING_ENABLED=false` continua desabilitando criação, webhooks e reconciliação dos dois provedores.

Documentação consultada: [Pix](https://docs.stripe.com/payments/pix), [criar Checkout Session](https://docs.stripe.com/api/checkout/sessions/create), [confirmação de pagamentos](https://docs.stripe.com/checkout/fulfillment), [webhooks](https://docs.stripe.com/webhooks), [versão da API](https://docs.stripe.com/api/versioning). A criação usa `allowed_payment_method_types=[pix]`, restringindo os métodos elegíveis na Stripe exclusivamente a Pix.
