

# Plano de Cobranca Hibrida -- v5.5

**Novas Pontas Soltas: #92-#99 | Novas Melhorias: M38-M42**
**Totais acumulados: 99 pontas soltas, 42 melhorias**

---

## Novas Pontas Soltas v5.5 (#92-#99)

### 92. create-invoice usa FK join syntax em `teacher_student_relationships` -- viola constraint (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 143-154)

```javascript
const { data: relationship } = await supabaseClient
  .from('teacher_student_relationships')
  .select(`
    business_profile_id, 
    teacher_id,
    business_profile:business_profiles!teacher_student_relationships_business_profile_id_fkey(
      enabled_payment_methods
    )
  `)
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .single();
```

Mesma violacao das pontas #86/#87 (FK join syntax). O acesso a `relationship.business_profile.enabled_payment_methods` (linha 367) depende do schema cache funcionar. Se falhar, `enabledMethods` defaulta para `['boleto', 'pix', 'card']`, que pode ser incorreto se o professor desabilitou algum metodo.

**Impacto**: Faturas manuais podem gerar pagamentos com metodos que o professor desabilitou.

**Acao**: Separar em duas queries: buscar `teacher_student_relationships` sem join, depois buscar `business_profiles` pelo `business_profile_id`.

### 93. create-invoice `class_participants` query usa FK join syntax `classes!inner` (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 226-241)

```javascript
const { data: classData } = await supabaseClient
  .from('class_participants')
  .select(`
    id, class_id, student_id, dependent_id,
    classes!inner (
      id, class_date, service_id,
      class_services (name, price)
    )
  `)
  .in('class_id', body.class_ids)
  .or(`student_id.eq.${billingStudentId},dependent_id.not.is.null`);
```

Triple join aninhado: `class_participants -> classes!inner -> class_services`. Se qualquer nivel do cache falhar, `classInfo.class_services` retorna null e o `service?.price` cai para divisao proporcional (linha 315), gerando valores incorretos nos itens da fatura.

**Impacto**: Itens de fatura com valores incorretos quando o schema cache falha.

**Acao**: Refatorar para queries sequenciais: buscar participantes, depois buscar dados das aulas e servicos separadamente.

### 94. create-payment-intent-connect usa FK join syntax triplo na query de invoice (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 37-51)

```javascript
const { data: invoice } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(...),
    teacher:profiles!invoices_teacher_id_fkey(...),
    business_profile:business_profiles!invoices_business_profile_id_fkey(...)
  `)
  .eq("id", invoice_id)
  .single();
```

Tres FK joins em uma unica query. Se o cache falhar em qualquer um:
- `invoice.student` null -> `finalPayerTaxId` null -> boleto falha com "CPF obrigatorio"
- `invoice.teacher` null -> `payment_due_days` undefined -> boleto expira em NaN dias
- `invoice.business_profile` null -> `stripeConnectAccountId` null -> erro critico

**Impacto**: Qualquer falha de cache no `create-payment-intent-connect` bloqueia a geracao de TODOS os pagamentos (PIX, boleto e cartao).

**Acao**: Buscar invoice sem joins, depois fazer 3 queries sequenciais para profiles (student), profiles (teacher) e business_profiles.

### 95. generate-boleto-for-invoice usa FK join syntax duplo (Fase 5)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linhas 34-45)

```javascript
const { data: invoice } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(...),
    teacher:profiles!invoices_teacher_id_fkey(name, email)
  `)
  .eq("id", invoice_id)
  .single();
```

Se `invoice.student` retornar null por falha de cache, as validacoes de CPF e endereco (linhas 79-93) usam o objeto null e lancam excecao com mensagem enganosa ("Dados incompletos do aluno") quando na verdade o problema e o cache.

**Impacto**: Boletos falham intermitentemente com mensagem de erro que leva o usuario a acreditar que faltam dados cadastrais.

**Acao**: Buscar invoice sem joins, depois buscar profiles separadamente.

### 96. create-invoice valida minimo de R$5 incondicionalmente -- bloqueia faturas PIX validas (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 58-69)

```javascript
const MINIMUM_BOLETO_AMOUNT = 5.00;
if (body.amount < MINIMUM_BOLETO_AMOUNT) {
  return new Response(JSON.stringify({
    success: false,
    error: `O valor mínimo para geração de fatura com boleto é R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2)...}`
  }), ...);
}
```

Esta validacao impede a criacao de faturas com valor entre R$1 e R$4,99. Porem, o PIX aceita valores a partir de R$1 e o sistema ja implementa a hierarquia Boleto->PIX->Nenhum (linhas 392-401). Uma fatura de R$3 deveria ser criada e gerar PIX automaticamente, mas a validacao na entrada bloqueia antes.

**Impacto**: Professores que usam apenas PIX nao conseguem criar faturas entre R$1 e R$4,99 (ex: taxa de cancelamento de 10% sobre aula de R$30 = R$3).

**Acao**: Remover a validacao de minimo R$5 no `create-invoice` (ou reduzir para R$1 que e o minimo do PIX). A validacao de minimo por metodo ja e feita corretamente no `create-payment-intent-connect` (linhas 85-120).

### 97. send-invoice-notification insere `invoice.id` em `class_notifications.class_id` -- perpetua colisao semantica (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 435-442)

```javascript
await supabase
  .from("class_notifications")
  .insert({
    class_id: invoice.id, // Usando invoice_id como class_id
    student_id: invoice.student_id,
    notification_type: payload.notification_type,
    status: "sent",
  });
```

Confirmacao por codigo da ponta #82: `send-invoice-notification` insere o `invoice.id` no campo `class_id` da tabela `class_notifications`. Este e o INSERT que `check-overdue-invoices` verifica na sua idempotencia (ponta #90). Porem, como `send-invoice-notification` ja faz esse INSERT para `invoice_created`, a idempotencia do `check-overdue-invoices` para `invoice_overdue` depende de um INSERT DIFERENTE que nunca acontece.

**Cascata de bugs**:
1. `check-overdue-invoices` busca `notification_type: 'invoice_overdue'` (linha 51)
2. `send-invoice-notification` insere com `notification_type: payload.notification_type` (que pode ser `invoice_overdue`)
3. MAS o `check-overdue-invoices` chama `send-invoice-notification` com `notification_type: 'invoice_overdue'`
4. ENTAO `send-invoice-notification` insere `notification_type: 'invoice_overdue'` em `class_notifications`
5. Na proxima execucao, `check-overdue-invoices` encontra o registro e pula a fatura

**Conclusao**: A idempotencia do `check-overdue-invoices` funciona PARCIALMENTE por acidente -- mas apenas porque `send-invoice-notification` faz o INSERT que o `check-overdue-invoices` verifica. Se `send-invoice-notification` falhar por qualquer razao (ponta #85, #36, email invalido), o INSERT nao acontece e a fatura recebe notificacoes duplicadas.

**Acao**: Mover o controle de idempotencia para `invoices.overdue_notification_sent` (conforme M15) para garantir atomicidade.

### 98. automated-billing fluxo tradicional query de `class_participants` com `classes!inner` FK join (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 212-226)

```javascript
const { data: oldConfirmedParticipations } = await supabaseAdmin
  .from('class_participants')
  .select(`
    id,
    classes!inner (
      id, class_date, status, teacher_id
    )
  `)
  .eq('student_id', studentInfo.student_id)
  .eq('classes.teacher_id', studentInfo.teacher_id)
  .eq('status', 'confirmada')
  .lt('classes.class_date', thirtyDaysAgo.toISOString());
```

Alem da ponta #86 (query principal), esta query auxiliar de alerta tambem usa FK join syntax `classes!inner`. Se o cache falhar, o alerta de "aulas confirmadas nao marcadas como concluidas" nunca dispara, mascarando um problema operacional.

**Impacto**: Baixo (apenas log de alerta), mas contribui para o padrao de uso inconsistente de FK joins na funcao.

**Acao**: Refatorar junto com a ponta #86 para queries sequenciais.

### 99. create-payment-intent-connect customer.create usa campo inexistente `guardian_name` (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linha 308)

```javascript
const customer = await stripe.customers.create({
  email: customerEmail,
  name: invoice.student?.guardian_name || invoice.student?.name,
  ...
});
```

O campo `guardian_name` nao existe no SELECT de `profiles` (linha 41-44 seleciona `name, email, cpf, address_*`). Alem disso, `guardian_name` nunca existiu na tabela `profiles` -- os dados do responsavel estao em `teacher_student_relationships`. O `?.` previne erro, mas o nome do customer no Stripe sera sempre `invoice.student?.name` (o nome do aluno, nao do responsavel), mesmo quando existe um responsavel.

**Impacto**: Customers no Stripe sao criados com nome do aluno em vez do responsavel. Embora nao bloqueie pagamentos, causa confusao em reconciliacao e relatorios do Stripe.

**Acao**: Substituir por `relationship?.student_guardian_name || invoice.student?.name` (o `relationship` ja foi buscado na linha 123-128).

---

## Novas Melhorias v5.5 (M38-M42)

### M38. create-invoice re-busca `teacher_student_relationships` desnecessariamente (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 377-382)

Apos buscar o `relationship` na linha 143-154 (com `business_profile_id` e `enabled_payment_methods`), a funcao faz uma SEGUNDA query para `teacher_student_relationships` (linhas 377-382) para buscar dados do responsavel (guardian):
```javascript
const { data: relationshipData } = await supabaseClient
  .from('teacher_student_relationships')
  .select('student_guardian_cpf, student_guardian_name, ...')
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .single();
```

Isso e redundante -- a primeira query poderia incluir os campos do guardian.

**Acao**: Consolidar os campos do guardian na primeira query (ao separar o FK join da ponta #92, adicionar os campos de guardian nessa mesma query).

### M39. create-payment-intent-connect cria customer na conta platform E na conta connected para PIX -- inconsistencia (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 296-315 e 421-441)

Para boleto (destination charges), o customer e criado na conta platform (linha 296-315). Para PIX (direct charges), um customer separado e criado na conta connected (linhas 421-441). Isso resulta em dois registros de customer para o mesmo aluno no Stripe, dificultando reconciliacao e potencialmente causando problemas se o metodo for alterado de PIX para boleto (customer diferente).

**Acao**: Documentar essa limitacao como decisao tecnica (Stripe exige customer na conta correta para cada tipo de charge). Adicionar log explicativo.

### M40. process-cancellation catch block retorna HTTP 500 -- confirma ponta #84 (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 493-499)

```javascript
} catch (error) {
  return new Response(JSON.stringify({ error: error.message }), {
    status: 500,
  });
}
```

Confirmacao por codigo: o catch retorna `status: 500`. Quando mensagens de validacao especificas sao lancadas (linhas 162, 169, 175, 191), elas sao encapsuladas em HTTP 500, e o frontend do Supabase `functions.invoke()` perde a mensagem original.

**Acao**: Alterar para `status: 200` com `success: false`, mantendo a mensagem de erro no body (mesmo padrao do `create-invoice`).

### M41. automated-billing hardcoded R$100 como preco de fallback -- risco de cobranca incorreta (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 337, 348, 387, 410)

```javascript
const amount = service?.price || defaultServicePrice || 100; // R$100 como último recurso
```

Quando uma aula nao tem servico associado E o professor nao tem servico padrao, o sistema usa R$100. Embora seja um ultimo recurso, esse valor arbitrario pode cobrar mais ou menos do que o esperado.

**Acao**: Em vez de usar R$100 como fallback silencioso, logar um warning critico e considerar pular essa aula com um registro de "aula sem preco definido -- requer acao manual do professor".

### M42. create-payment-intent-connect nao persiste `stripe_customer_id` no relationship ou profile (Fase 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 296-315)

Ao criar um novo customer no Stripe (linhas 303-314), o `customerId` retornado nao e salvo em nenhuma tabela do banco. O campo `teacher_student_relationships.stripe_customer_id` existe no schema mas nunca e populado por esta funcao. Na proxima geracao de pagamento, `stripe.customers.list({ email })` e chamado novamente, dependendo do email para match -- se o email mudar, um novo customer e criado, deixando o antigo orfao.

**Acao**: Apos criar o customer, persistir `customerId` em `teacher_student_relationships.stripe_customer_id`. Na proxima execucao, buscar pelo `stripe_customer_id` armazenado em vez de listar por email.

---

## Indice Atualizado (apenas novos itens)

| # | Descricao | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 92 | create-invoice FK join em teacher_student_relationships | 5 | create-invoice/index.ts |
| 93 | create-invoice FK join triplo class_participants->classes->class_services | 5 | create-invoice/index.ts |
| 94 | create-payment-intent-connect FK join triplo invoice->profiles->business_profiles | 5 | create-payment-intent-connect/index.ts |
| 95 | generate-boleto-for-invoice FK join duplo invoice->profiles | 5 | generate-boleto-for-invoice/index.ts |
| 96 | create-invoice bloqueia faturas < R$5 mesmo quando PIX aceita >= R$1 | 5 | create-invoice/index.ts |
| 97 | send-invoice-notification perpetua colisao invoice.id em class_notifications.class_id | 8 | send-invoice-notification/index.ts |
| 98 | automated-billing FK join auxiliar class_participants->classes!inner | 5 | automated-billing/index.ts |
| 99 | create-payment-intent-connect usa campo inexistente guardian_name | 5 | create-payment-intent-connect/index.ts |

| # | Descricao | Fase |
|---|-----------|------|
| M38 | create-invoice query duplicada de teacher_student_relationships | 5 |
| M39 | create-payment-intent-connect customer duplicado platform vs connected | 5 |
| M40 | process-cancellation HTTP 500 no catch (confirmacao #84) | 6 |
| M41 | automated-billing fallback R$100 como preco padrao | 5 |
| M42 | create-payment-intent-connect nao persiste stripe_customer_id | 5 |

---

## Historico de Versoes (atualizado)

| Versao | Data | Mudancas |
|--------|------|----------|
| v5.5 | 2026-02-13 | +8 pontas soltas (#92-#99), +5 melhorias (M38-M42): FK join violations em create-invoice, create-payment-intent-connect, generate-boleto-for-invoice; create-invoice bloqueia PIX valido com minimo R$5; send-invoice-notification perpetua colisao de IDs; automated-billing FK join auxiliar; guardian_name inexistente no Stripe customer; query duplicada, customer duplicado, HTTP 500 no catch, fallback R$100, stripe_customer_id nao persistido |

---

## Secao Tecnica: Resumo de Severidade v5.5

**CRITICOS (bloqueiam funcionalidade):**
- #94: FK join triplo no create-payment-intent-connect bloqueia TODOS os pagamentos se cache falhar
- #96: Faturas entre R$1-R$4,99 bloqueadas incondicionalmente (afeta PIX)

**ALTOS (dados incorretos ou UX degradada):**
- #92: create-invoice FK join pode gerar pagamento com metodo desabilitado
- #93: FK join triplo gera valores incorretos nos itens de fatura
- #95: generate-boleto-for-invoice falha intermitente com mensagem enganosa
- #97: Idempotencia de notificacoes depende de INSERT acidental no send-invoice-notification
- #99: Customer no Stripe criado com nome errado (aluno vs responsavel)

**MEDIOS (otimizacao e resiliencia):**
- #98: FK join auxiliar no alerta de aulas antigas
- M38: Query duplicada de teacher_student_relationships
- M39: Customer duplicado no Stripe (platform vs connected)
- M40: HTTP 500 no catch do process-cancellation
- M41: Fallback R$100 silencioso para aulas sem preco
- M42: stripe_customer_id nao persistido causa busca por email

---

## Panorama Consolidado: FK Join Violations

A constraint `edge-functions-pattern-sequential-queries` e violada em **8 locais** distribuidos por 5 edge functions:

| Funcao | Linhas | Joins | Ponta |
|--------|--------|-------|-------|
| automated-billing | 72-89 | profiles!teacher_id, profiles!student_id | #86 |
| automated-billing | 212-226 | classes!inner | #98 |
| automated-billing | 1030-1038 | subscription_plans!inner | M37 |
| create-invoice | 143-154 | business_profiles!fkey | #92 |
| create-invoice | 226-241 | classes!inner -> class_services | #93 |
| create-payment-intent-connect | 37-51 | profiles!fkey x2, business_profiles!fkey | #94 |
| generate-boleto-for-invoice | 34-45 | profiles!fkey x2 | #95 |
| webhook-stripe-connect | 453-457 | .select('payment_origin').single() | #87 (nao FK, mas .single()) |

**Recomendacao**: Resolver todas as violacoes de FK join como um batch unico (Sprint de Refatoracao), pois compartilham o mesmo padrao de correcao.
