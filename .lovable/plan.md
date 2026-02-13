

# Plano de Cobranca Hibrida -- v5.3

**Novas Pontas Soltas: #80-#85 | Novas Melhorias: M32-M34**
**Totais acumulados: 85 pontas soltas, 34 melhorias**

---

## Novas Pontas Soltas v5.3 (#80-#85)

### 80. process-cancellation invoca create-invoice com `service_role_key` como Bearer token -- BUG de autenticacao (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 451-457)

O `process-cancellation` invoca `create-invoice` passando o `SUPABASE_SERVICE_ROLE_KEY` como Authorization header:
```javascript
headers: {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
}
```

Porem, `create-invoice` (linha 45) usa `supabaseClient.auth.getUser(token)` para autenticar o usuario. O service_role_key **nao e um JWT de usuario** -- o `getUser()` retornara erro ou um objeto invalido, impedindo a identificacao do `teacher_id`. Isso significa que faturas de cancelamento geradas pelo `process-cancellation` podem falhar silenciosamente ou usar um user.id incorreto.

**Impacto**: Toda fatura de cancelamento gerada automaticamente (aluno cancela tardiamente) pode estar falhando sem log visivel, pois o catch block do `create-invoice` retorna HTTP 500 (ponta #72).

**Acao**: O `create-invoice` precisa de um modo alternativo de autenticacao para chamadas server-to-server. Opcoes:
1. Aceitar `teacher_id` no body quando chamada com service_role_key (validando que o role e `service_role`)
2. Criar um supabaseClient com service_role no `process-cancellation` e inserir a fatura diretamente (sem invocar `create-invoice`)
3. Adicionar deteccao de service_role no `create-invoice`: se o token e service_role, usar `teacher_id` do body

### 81. process-cancellation hard-coded `chargeAmount >= 5` ignora PIX (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linha 434)

Ja documentado como ponta #30, mas com uma nuance adicional nao capturada: quando `chargeAmount < 5`, o codigo faz `console.log` e **pula completamente** a criacao da fatura (linha 472). Nao tenta PIX (minimo R$ 1,00), nao cria fatura sem pagamento para rastreamento, e nao seta `charge_applied = false` no participante. Isso resulta em:
1. Participante com `charge_applied = true` mas sem fatura correspondente
2. `automated-billing` pode capturar esse participante no proximo ciclo e cobrar novamente (duplicacao)
3. Professor ve "cobranca aplicada" mas nao encontra fatura

**Acao critica**: Alem de aplicar a hierarquia PIX (ponta #30), quando o valor esta abaixo de TODOS os minimos, o sistema deve setar `charge_applied = false` no participante para evitar inconsistencia de dados.

### 82. check-overdue-invoices usa `class_notifications` com `class_id = invoice.id` -- colisao de IDs (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 47-51)

A verificacao de idempotencia armazena o **invoice ID** no campo `class_id` da tabela `class_notifications`:
```javascript
.eq("class_id", invoice.id)
.eq("notification_type", "invoice_overdue")
```

Isso cria dois problemas:
1. **Colisao de namespace**: Se um UUID de fatura coincidir com um UUID de aula (estatisticamente improvavel mas semanticamente incorreto), o sistema pode pular notificacoes reais de aula.
2. **FK constraint potencial**: Se `class_notifications.class_id` tiver uma foreign key para `classes.id`, inserir um `invoice.id` nesse campo causara erro de constraint. Verificando o schema, `class_notifications` nao tem FK explicita, mas a semantica esta errada.

Isso complementa a ponta #47/#71 (falta de INSERT) e #41 (uso semantico incorreto). O INSERT que sera adicionado para resolver #71 perpetuara essa colisao se nao for corrigido primeiro.

**Acao**: Implementar a coluna `overdue_notification_sent` em `invoices` (conforme M15 e a memoria `database/invoice-overdue-notification-tracking`) ANTES de resolver #71. Isso elimina a necessidade de usar `class_notifications` para faturas.

### 83. automated-billing nao envia notificacao para faturamento tradicional (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 560-566)

Ja documentado como ponta #67, mas verificacao do codigo confirma: o bloco de faturamento tradicional (linhas 510-566) termina com `processedCount++` sem chamar `send-invoice-notification`. Em contraste:
- Faturamento de mensalidade (linha 884): chama `send-invoice-notification`
- Faturamento fora do ciclo (linha 998): chama `send-invoice-notification`
- `create-invoice` (linha 532): chama `send-invoice-notification`

**Impacto**: Alunos sem mensalidade que sao faturados automaticamente nunca recebem email de cobranca. Eles so descobrem a fatura se acessarem o app ou receberem o lembrete de vencimento (que tambem esta bugado pela ponta #71).

**Acao**: Adicionar chamada a `send-invoice-notification` apos a geracao de pagamento (apos linha 558), usando o padrao fire-and-forget ja usado nos outros fluxos.

### 84. process-cancellation catch block retorna HTTP 500 -- viola constraint (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 493-499)

O catch block generico retorna `status: 500`. Quando chamado pelo frontend (`CancellationModal.tsx`), o SDK do Supabase lanca excecao generica e a mensagem amigavel (ex: "Esta aula ja foi cancelada anteriormente", "Voce nao tem permissao") e perdida.

Isso e o mesmo problema da ponta #72 (`create-invoice`) e #76 (`automated-billing`), mas no `process-cancellation`.

**Acao**: Alterar para `status: 200` com `success: false` e manter a mensagem de erro no body.

### 85. send-invoice-notification `monthly_subscriptions` lookup usa `.single()` (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 157-161)

```javascript
const { data: subscription, error: subError } = await supabase
  .from("monthly_subscriptions")
  .select("name, price, max_classes, overage_price")
  .eq("id", invoice.monthly_subscription_id)
  .single();
```

Se a mensalidade foi deletada entre a criacao da fatura e o envio da notificacao (cenario raro mas possivel via desativacao de plano), o `.single()` lanca excecao e impede o envio do email. Como o `monthly_subscription_id` na fatura e apenas referencia informativa (nao FK com cascade), a exclusao do plano nao limpa a referencia.

**Acao**: Substituir por `.maybeSingle()`. Se `subscription` for null, usar fallback com dados da descricao da fatura (que ja contem o nome do plano).

---

## Novas Melhorias v5.3 (M32-M34)

### M32. process-cancellation deveria criar fatura diretamente em vez de invocar create-invoice (Fase 6)

Relacionada a ponta #80. A invocacao de `create-invoice` via `functions.invoke` com service_role_key e fragil e adiciona latencia (chamada HTTP interna). Como `process-cancellation` ja tem acesso ao `supabaseClient` com service_role, a criacao da fatura e dos itens de `invoice_classes` pode ser feita diretamente, reutilizando a logica de resolucao de dependentes e a hierarquia de pagamento.

Beneficios:
1. Elimina o bug de autenticacao (#80)
2. Remove dependencia circular entre edge functions
3. Permite controle mais granular do `invoice_type` e dos campos
4. Reduz latencia do cancelamento (1 round-trip a menos)

### M33. check-overdue-invoices deveria filtrar por `teacher_id` nas queries (Seguranca)

As queries de faturas vencidas (linhas 27-31) e proximas ao vencimento (linhas 79-84) nao filtram por `teacher_id`. Embora a funcao use service_role (acesso total), ela processa **todos** os professores de uma vez. Se a funcao falhar no meio do loop, faturas de alguns professores podem ficar como "overdue" sem notificacao enquanto outros ja foram notificados. 

**Acao**: Embora nao seja um bug funcional, adicionar paginacao (LIMIT 100 + loop) para evitar timeouts em escala com muitas faturas vencidas simultaneamente.

### M34. automated-billing `invoiceData` nao inclui `payment_method` -- confirmacao e extensao de #48 (Fase 5)

Confirmacao por inspecao direta do codigo: o `invoiceData` em tres pontos (linhas 472-481, 801-812, 932-941) nao inclui `payment_method`. Isso foi documentado como ponta #48, mas a extensao e que o fluxo de outside-cycle (linhas 932-941) tambem nao inclui `payment_method`, elevando o impacto para 3 faturas potencialmente sem metodo de pagamento ate o webhook processar.

---

## Indice Atualizado (apenas novos itens)

| # | Descricao | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 80 | process-cancellation invoca create-invoice com service_role_key como JWT | 6 | process-cancellation/index.ts |
| 81 | process-cancellation chargeAmount < 5 deixa charge_applied = true sem fatura | 6 | process-cancellation/index.ts |
| 82 | check-overdue-invoices armazena invoice.id em class_notifications.class_id | 8 | check-overdue-invoices/index.ts |
| 83 | automated-billing tradicional nao envia notificacao de fatura | 5 | automated-billing/index.ts |
| 84 | process-cancellation catch block retorna HTTP 500 | 6 | process-cancellation/index.ts |
| 85 | send-invoice-notification monthly_subscriptions lookup usa .single() | 8 | send-invoice-notification/index.ts |

| # | Descricao | Fase |
|---|-----------|------|
| M32 | process-cancellation criar fatura diretamente (sem invocar create-invoice) | 6 |
| M33 | check-overdue-invoices adicionar paginacao para escala | 8 |
| M34 | automated-billing outside-cycle invoiceData sem payment_method | 5 |

---

## Historico de Versoes (atualizado)

| Versao | Data | Mudancas |
|--------|------|----------|
| v5.3 | 2026-02-13 | +6 pontas soltas (#80-#85), +3 melhorias (M32-M34): process-cancellation auth bug com service_role, charge_applied inconsistente sem fatura, check-overdue colisao de IDs, automated-billing sem notificacao no fluxo tradicional, process-cancellation HTTP 500, send-invoice-notification .single() em monthly_subscriptions |

---

## Secao Tecnica: Resumo de Severidade

**CRITICOS (bloqueiam funcionalidade):**
- #80: Faturas de cancelamento provavelmente falhando silenciosamente
- #81: charge_applied = true sem fatura = dados inconsistentes e risco de duplicacao
- #83: Alunos tradicionais nao recebem email de cobranca

**ALTOS (dados incorretos ou UX degradada):**
- #82: Colisao semantica de IDs em class_notifications
- #84: Mensagens de erro perdidas no cancelamento
- #85: Notificacao de mensalidade falha se plano deletado

