

# Plano de Cobranca Hibrida -- v5.7

**Novas Pontas Soltas: #108-#118 | Novas Melhorias: M48-M52**
**Totais acumulados: 118 pontas soltas, 52 melhorias**

---

## Novas Pontas Soltas v5.7 (#108-#118)

### 108. create-invoice NAO implementa validacao de whitelist de invoice_type (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 197)

A memoria `features/billing/create-invoice-type-validation-whitelist` documenta que a funcao DEVE implementar uma whitelist `VALID_INVOICE_TYPES` com os tipos: 'regular', 'manual', 'automated', 'monthly_subscription', 'prepaid_class', 'cancellation', 'orphan_charges'. Porem, inspecao direta do codigo confirma que **nenhuma validacao existe** -- a linha 197 aceita qualquer valor:

```javascript
invoice_type: body.invoice_type || 'manual',
```

Qualquer chamada com `invoice_type: 'xyz_invalido'` sera aceita e inserida no banco, quebrando o `InvoiceTypeBadge` no frontend e os filtros financeiros.

**Impacto**: Dados inconsistentes no banco e badges quebrados no Financeiro.

**Acao**: Adicionar validacao de whitelist antes da insercao, retornando `success: false` para tipos invalidos.

### 109. create-invoice NAO implementa verificacao de idempotencia por participant_id + class_id (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 190-208)

A memoria `features/billing/create-invoice-idempotency-constraint` documenta que a funcao DEVE realizar "verificacao previa de faturas existentes para a combinacao especifica de participant_id e class_id antes da insercao". Inspecao direta confirma que **nenhuma verificacao de duplicidade existe** -- a funcao insere a fatura diretamente sem checar se ja existe uma para o mesmo class_id.

**Impacto**: Retentativas de rede ou cliques multiplos podem gerar faturas duplicadas.

**Acao**: Antes de inserir, verificar se ja existe fatura com `class_id = body.class_id` AND `student_id = billingStudentId` AND `status != 'cancelada'`. Se existir, retornar a fatura existente com `success: true, already_exists: true`.

### 110. create-invoice catch block retorna HTTP 500 -- viola constraint (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 564-574)

```javascript
} catch (error) {
    ...
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
}
```

Erros de validacao como "student_id and amount are required" (linha 56) e "Relacionamento professor-aluno nao encontrado" (linha 158) sao lancados via `throw` e capturados pelo catch geral, retornando HTTP 500. Quando chamado pelo `process-cancellation` (#80), o error.message e perdido.

Ja documentado parcialmente na ponta #72, mas confirmacao direta mostra que TODOS os throws internos (linhas 42, 46, 55, 158, 212, 247, 276, 356) sao capturados pelo mesmo catch com HTTP 500.

**Acao**: Alterar catch geral para HTTP 200 com `success: false`.

### 111. create-payment-intent-connect usa `invoice.student?.guardian_name` que NAO existe no schema (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 308, 433)

```javascript
name: invoice.student?.guardian_name || invoice.student?.name,
```

O campo `guardian_name` NAO existe na tabela `profiles` (conforme schema e memoria `database/responsible-party-contact-teacher-student-relationships`). O select da fatura (linhas 41-44) busca `name, email, cpf, address_*` de `profiles` -- nenhum `guardian_name`. O resultado e que `invoice.student?.guardian_name` e sempre `undefined`, e o fallback `invoice.student?.name` e usado.

Isso nao causa erro funcional (fallback funciona), mas gera confusao semantica e viola a constraint de que dados de responsaveis devem vir de `teacher_student_relationships`.

**Impacto**: Baixo (fallback funciona). Mas o Stripe customer sera criado com o nome do aluno em vez do responsavel quando o guardian data nao vem da request.

**Acao**: Substituir `invoice.student?.guardian_name` por `finalPayerName` (que ja resolve guardian vs student corretamente nas linhas 267-269).

### 112. automated-billing fluxo tradicional NAO envia notificacao de fatura criada (Fase 5) -- CONFIRMACAO DIRETA

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 559-566)

Confirmacao definitiva por inspecao do codigo: o bloco do fluxo tradicional (linhas 499-566) termina com:
```javascript
logStep(`Invoice ${invoiceId} created successfully for ${studentInfo.student_name}`, {...});
processedCount++;
```

Nenhuma chamada a `send-invoice-notification` existe neste bloco. Em contraste:
- Fluxo de mensalidade (linha 884): chama `send-invoice-notification`
- Fluxo outside-cycle (linha 998): chama `send-invoice-notification`

Isso e a confirmacao definitiva das pontas #67 e #83.

**Acao**: Adicionar chamada fire-and-forget a `send-invoice-notification` apos linha 566, antes do `processedCount++`.

### 113. send-invoice-notification insere `invoice.id` em `class_notifications.class_id` -- colisao semantica ATIVA (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 435-442)

```javascript
const { error: notificationError } = await supabase
  .from("class_notifications")
  .insert({
    class_id: invoice.id, // Usando invoice_id como class_id para aproveitar a estrutura
    student_id: invoice.student_id,
    notification_type: payload.notification_type,
    status: "sent",
  });
```

O comentario "Usando invoice_id como class_id" confirma que esta e uma decisao intencional mas problematica. Diferente de `check-overdue-invoices` (#82/#90) que NAO faz o INSERT (e portanto nao causa colisao real), o `send-invoice-notification` ATIVAMENTE insere invoice IDs no campo `class_id`.

**Impacto**: Toda notificacao de fatura (criacao, pagamento, vencimento, lembrete) cria um registro em `class_notifications` com um `invoice.id` no campo `class_id`. Se uma query futura listar notificacoes "de aulas", faturas aparecerao como aulas inexistentes.

**Acao**: Migrar para tabela dedicada ou usar a coluna `overdue_notification_sent` em `invoices` (conforme M15). Alternativamente, adicionar um campo `reference_type` em `class_notifications` para distinguir 'class' de 'invoice'.

### 114. process-cancellation NAO verifica `is_paid_class` -- CONFIRMACAO DIRETA (Fase 6)

Confirmacao definitiva: busca por `is_paid_class` no arquivo `process-cancellation/index.ts` retorna zero resultados. A query da aula (linha 45) nao inclui `is_paid_class` no SELECT. A logica `shouldCharge` (linhas 216-225) nao consulta esse campo.

Resultado: Aulas gratuitas (`is_paid_class = false`) canceladas tardiamente por alunos geram cobranca de cancelamento indevida.

Isso confirma definitivamente a ponta #88.

### 115. process-cancellation NAO verifica `charge_timing` -- CONFIRMACAO DIRETA (Fase 6)

Confirmacao definitiva: busca por `charge_timing` em todas as edge functions retorna zero resultados. Nenhuma funcao do sistema consulta o campo `charge_timing` de `business_profiles`.

Resultado: O sistema foi planejado para diferenciar comportamento prepaid vs postpaid, mas nenhuma logica runtime implementa essa diferenciacao. Especificamente:
- `process-cancellation`: nao verifica se a aula ja foi paga antecipadamente
- `automated-billing`: nao filtra aulas prepaid (que ja teriam fatura individual)
- `ClassForm`: nao bloqueia recorrencia para aulas prepaid pagas

**Impacto CRITICO**: Aulas prepaid podem ser duplamente cobradas -- uma vez pela fatura individual gerada na criacao e novamente pelo faturamento automatizado no final do ciclo.

**Acao**: Implementar verificacao de `charge_timing` em:
1. `process-cancellation`: nao cobrar cancelamento para aulas prepaid
2. `automated-billing`: filtrar aulas que ja possuem fatura prepaid (via `invoice_classes.class_id`)
3. Frontend (ClassForm): consultar `charge_timing` para decidir recorrencia

### 116. automated-billing usa R$100 como fallback de preco de servico sem alerta critico (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 337, 348, 387, 410)

```javascript
const amount = service?.price || defaultServicePrice || 100; // Usar serviço padrão ou R$100 como último recurso
```

Este fallback aparece em 4 locais. Se uma aula nao tem servico associado E nao ha servico padrao, o sistema cobra R$100 silenciosamente. Nao ha log de warning, nao ha alerta ao professor, nao ha marcacao na fatura indicando que o valor foi estimado.

Ja documentado como M41 no plano anterior, mas a confirmacao mostra que o problema existe em 4 locais (nao apenas 2) e que nenhum deles gera log de warning.

**Acao**: Em todos os 4 locais, adicionar `logStep("WARNING: Using fallback price R$100")`. Considerar rejeitar a cobranca em vez de usar fallback, ou notificar o professor.

### 117. check-overdue-invoices marca fatura como 'overdue' mas send-invoice-notification exibe status original da fatura no email (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59) e `send-invoice-notification/index.ts` (linha 393)

O fluxo e:
1. `check-overdue-invoices` atualiza status para 'overdue' (linha 57)
2. `check-overdue-invoices` invoca `send-invoice-notification` com `notification_type: 'invoice_overdue'` (linha 62)
3. `send-invoice-notification` busca a fatura APOS o update (linha 39-57)
4. `send-invoice-notification` exibe `invoice.status` no email (linha 393): `<p><strong>Status:</strong> ${invoice.status}</p>`

O problema: como o update e feito ANTES da invocacao, o email mostrara "Status: overdue". Porem, o campo `status` no banco e 'overdue' em ingles, enquanto o resto da interface usa termos em portugues ('pendente', 'paga', 'cancelada'). O email exibira "Status: overdue" em vez de "Status: Vencida".

**Impacto**: Inconsistencia linguistica no email enviado ao aluno.

**Acao**: Adicionar mapeamento de status para portugues no `send-invoice-notification` antes de exibir no email.

### 118. verify-payment-status NAO atualiza `payment_method` nem limpa campos temporarios ao reconciliar (Fase 7)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 89-93)

```javascript
const { error: updateError } = await supabaseClient
  .from("invoices")
  .update({ status: newStatus })
  .eq("id", invoice_id);
```

Quando `verify-payment-status` detecta que o `PaymentIntent` foi pago (`succeeded`), atualiza APENAS o `status` para 'paga'. Nao atualiza:
- `payment_method` (permanece como o metodo original, ok)
- `payment_origin` (deveria ser 'automatic' para indicar pagamento via Stripe)
- Campos temporarios (pix_qr_code, boleto_url, etc.) nao sao limpos
- Nenhuma notificacao e enviada (#103)

Em contraste, o webhook `payment_intent.succeeded` (linhas 466-485) faz tudo isso corretamente.

**Acao**: Alinhar o update do `verify-payment-status` com o do webhook: incluir `payment_origin: 'automatic'`, limpar campos temporarios, e enviar notificacao.

---

## Novas Melhorias v5.7 (M48-M52)

### M48. create-invoice aceita `class_id` no body mas usa FK join syntax no SELECT de participants (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 226-241)

```javascript
const { data: classData, error: classDataError } = await supabaseClient
  .from('class_participants')
  .select(`
    id, class_id, student_id, dependent_id,
    classes!inner (
      id, class_date, service_id,
      class_services (name, price)
    )
  `)
```

Este e o FK join #93 ja documentado, mas a confirmacao mostra que o join e **triplo**: `class_participants -> classes!inner -> class_services`. Se o cache falhar em qualquer nivel, o preco do servico sera `undefined` e o fallback `body.amount / filteredClassData.length` sera usado, potencialmente gerando valores incorretos por item.

### M49. create-payment-intent-connect cria Stripe Customer com dados potencialmente desatualizados (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 297-315)

O fluxo de criacao de customer (linhas 297-315) busca por email e cria se nao existir. Porem:
1. Usa `invoice.student?.guardian_name` (que nao existe no schema -- ponta #111)
2. Nao atualiza o customer existente se os dados mudaram (nome, email)
3. Nao armazena o `customerId` no banco para reuso futuro

Cada geracao de boleto/PIX faz uma chamada `stripe.customers.list` + potencialmente `stripe.customers.create`. Para professores com muitos alunos, isso gera dezenas de chamadas ao Stripe por execucao do billing.

**Acao**: Armazenar `stripe_customer_id` em `profiles` ou `teacher_student_relationships` apos criacao e reutilizar em chamadas futuras (confirma M42 do plano anterior).

### M50. automated-billing nao inclui `payment_method` no invoiceData em nenhum dos 3 fluxos (Fase 5)

Confirmacao final e consolidacao das pontas #48 e M34:

| Fluxo | Linhas | Inclui payment_method? |
|-------|--------|----------------------|
| Tradicional | 472-481 | NAO |
| Mensalidade | 801-812 | NAO |
| Outside-cycle | 932-941 | NAO |

Alem disso, os 3 fluxos hardcodam `payment_method: 'boleto'` na chamada ao `create-payment-intent-connect` (linhas 527, 855, 969), ignorando `enabled_payment_methods` do business profile.

### M51. send-invoice-notification catch block retorna HTTP 500 (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 455-463)

```javascript
} catch (error) {
    ...
    return new Response(
      JSON.stringify({ error: ... }),
      { ..., status: 500 }
    );
}
```

Quando chamado pelo `check-overdue-invoices` ou `automated-billing` em modo fire-and-forget, o HTTP 500 e ignorado. Mas quando chamado sincronamente, pode interromper o fluxo do caller.

### M52. process-cancellation nao busca `business_profile_id` para associar a fatura de cancelamento (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 437-446)

O `invoicePayload` enviado ao `create-invoice` nao inclui `business_profile_id`. O `create-invoice` resolve isso via `teacher_student_relationships`, mas como a chamada usa `service_role_key` como Bearer (#80), o `user.id` do `create-invoice` nao sera o teacher. Resultado: a query de `teacher_student_relationships` (linha 143-154) usara um `teacher_id` incorreto (o da service_role) e nao encontrara o relacionamento.

Isso amplifica o impacto da ponta #80: nao apenas a autenticacao falha, mas o roteamento de pagamento tambem seria incorreto mesmo se a autenticacao fosse contornada.

---

## Indice Atualizado (apenas novos itens)

| # | Descricao | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 108 | create-invoice sem validacao de whitelist de invoice_type | 5 | create-invoice/index.ts |
| 109 | create-invoice sem verificacao de idempotencia por participant+class | 5 | create-invoice/index.ts |
| 110 | create-invoice catch block HTTP 500 | 5 | create-invoice/index.ts |
| 111 | create-payment-intent-connect usa guardian_name inexistente no schema | 5 | create-payment-intent-connect/index.ts |
| 112 | automated-billing fluxo tradicional sem notificacao (confirmacao #83) | 5 | automated-billing/index.ts |
| 113 | send-invoice-notification insere invoice.id em class_notifications.class_id | 8 | send-invoice-notification/index.ts |
| 114 | process-cancellation nao verifica is_paid_class (confirmacao #88) | 6 | process-cancellation/index.ts |
| 115 | charge_timing NAO implementado em nenhuma funcao runtime | 6 | Todas |
| 116 | automated-billing fallback R$100 sem warning em 4 locais | 5 | automated-billing/index.ts |
| 117 | send-invoice-notification exibe status em ingles no email | 8 | send-invoice-notification/index.ts |
| 118 | verify-payment-status reconciliacao incompleta vs webhook | 7 | verify-payment-status/index.ts |

| # | Descricao | Fase |
|---|-----------|------|
| M48 | create-invoice FK join triplo em class_participants | 5 |
| M49 | create-payment-intent-connect nao reutiliza stripe_customer_id | 5 |
| M50 | automated-billing 3 fluxos sem payment_method + hardcoded boleto (consolidacao) | 5 |
| M51 | send-invoice-notification catch HTTP 500 | 8 |
| M52 | process-cancellation fatura de cancelamento sem business_profile_id amplifica #80 | 6 |

---

## Historico de Versoes (atualizado)

| Versao | Data | Mudancas |
|--------|------|----------|
| v5.7 | 2026-02-13 | +11 pontas soltas (#108-#118), +5 melhorias (M48-M52): create-invoice sem whitelist invoice_type e sem idempotencia, create-payment-intent-connect guardian_name inexistente, confirmacao direta de is_paid_class e charge_timing nao implementados, automated-billing fallback R$100 em 4 locais, send-invoice-notification colisao ativa de IDs e status em ingles, verify-payment-status reconciliacao incompleta, process-cancellation sem business_profile_id |

---

## Secao Tecnica: Resumo de Severidade v5.7

**CRITICOS (bloqueiam funcionalidade ou causam dano financeiro):**
- #109: Faturas duplicadas possiveis por retentativa de rede
- #115: `charge_timing` NUNCA implementado -- aulas prepaid podem ser cobradas 2x (billing automatico + fatura individual)
- #114: Aulas gratuitas cobram taxa de cancelamento (confirmacao #88)
- #112: Alunos tradicionais nunca recebem email de cobranca (confirmacao #83)
- M52: Fatura de cancelamento sem business_profile_id (amplifica #80)

**ALTOS (dados incorretos ou UX degradada):**
- #108: invoice_type sem validacao permite dados invalidos
- #110: HTTP 500 no create-invoice perde mensagens de erro
- #113: Colisao ativa de invoice.id em class_notifications.class_id
- #116: Fallback R$100 silencioso pode cobrar valor errado
- #117: Status em ingles no email de fatura
- #118: verify-payment-status incompleto vs webhook

**MEDIOS (inconsistencias e otimizacoes):**
- #111: guardian_name inexistente (fallback funciona)
- M48: FK join triplo no create-invoice
- M49: Stripe customer nao reutilizado
- M50: Consolidacao de payment_method hardcoded
- M51: send-invoice-notification HTTP 500

---

## Panorama Consolidado: Pontas Soltas NAO Implementadas (Planejadas mas Ausentes)

Verificacao cruzada entre o que foi planejado no documento e o que existe no codigo:

| Feature Planejada | Status no Codigo | Ponta(s) |
|---|---|---|
| Whitelist de `invoice_type` em `create-invoice` | NAO implementada | #108 |
| Idempotencia por `participant_id + class_id` em `create-invoice` | NAO implementada | #109 |
| Coluna `overdue_notification_sent` em `invoices` | NAO existe no schema | #82, #90, #113 |
| Coluna `reminder_notification_sent` em `invoices` | NAO existe no schema | #90 |
| Verificacao de `charge_timing` em runtime | NAO implementada em NENHUMA funcao | #115 |
| Verificacao de `is_paid_class` em `process-cancellation` | NAO implementada | #114 |
| Hierarquia de metodos de pagamento em `automated-billing` | NAO implementada (hardcoded boleto) | #89, M50 |
| Notificacao no fluxo tradicional do `automated-billing` | NAO implementada | #112 |
| Limpeza de campos temporarios em `payment_intent.payment_failed` | NAO implementada | #104 |
| Notificacao em `verify-payment-status` ao reconciliar | NAO implementada | #103, #118 |

---

## Panorama Consolidado: HTTP Status Violations (atualizado)

| Funcao | Linhas | Status Retornado | Deveria Ser | Ponta |
|--------|--------|-----------------|-------------|-------|
| create-invoice | 564-574 | 500 | 200 + success:false | #110 |
| process-cancellation | 493-499 | 500 | 200 + success:false | #84 |
| automated-billing | 588-596 | 500 | 200 + success:false | #76 |
| create-payment-intent-connect | 74-81 | 400 | 200 + success:false | #106 |
| create-payment-intent-connect | 647-658 | 500 | 200 + success:false | M44 |
| generate-boleto-for-invoice | 146-155 | 500 | 200 + success:false | #107 |
| verify-payment-status | 117-122 | 500 | 200 + success:false | #118 |
| send-invoice-notification | 455-463 | 500 | 200 + success:false | M51 |
| webhook-stripe-connect (invoice.paid) | 328-332 | 500 (return) | break + log | #91 |
| webhook-stripe-connect (marked_uncollectible) | 410-415 | 500 (return) | break + log | #91 |

**Total: 10 locais com HTTP status incorreto.**

