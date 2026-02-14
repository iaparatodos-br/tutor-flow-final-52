


# Auditoria Profunda v5.21 — 6 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva do codigo atual de todas as Edge Functions financeiras contra as 162 pontas soltas existentes revelou **6 novas pontas soltas (#163-#168)** em 6 funcoes. Totais atualizados: **168 pontas soltas** (8 implementadas, 160 pendentes) e **52 melhorias**.

---

## Novas Pontas Soltas (v5.21)

### #163 -- automated-billing usa FK joins na query principal (Batch 2 -- ALTA)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 71-90)

```text
const { data: relationshipsToBill, error: relationshipsError } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select(`
    id, student_id, teacher_id, billing_day, business_profile_id,
    teacher:profiles!teacher_id ( id, name, email, payment_due_days ),
    student:profiles!student_id ( id, name, email )
  `)
  .eq('billing_day', today);
```

A funcao principal de faturamento automatizado usa FK joins para buscar dados de professor e aluno. Conforme documentado na memoria de constraints do projeto, FK joins em Edge Functions podem falhar silenciosamente por cache de schema no Deno runtime. Se `teacher` ou `student` retornarem `null` devido a cache, o processamento falha em `teacher?.name` (linha 116) com `undefined`, e a fatura e criada sem nome/email do professor ou aluno.

**Impacto**: ALTO — Esta funcao roda diariamente via cron e processa TODAS as faturas automatizadas. Uma falha de cache afeta todos os professores cujo `billing_day` coincide com o dia.

**Acao**: Substituir FK joins por queries sequenciais independentes:
```text
// 1. Buscar relacionamentos
const { data: relationships } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select('id, student_id, teacher_id, billing_day, business_profile_id')
  .eq('billing_day', today);

// 2. Para cada relacionamento, buscar teacher e student separadamente
for (const rel of relationships) {
  const { data: teacher } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, payment_due_days')
    .eq('id', rel.teacher_id)
    .maybeSingle();

  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email')
    .eq('id', rel.student_id)
    .maybeSingle();
  ...
}
```

---

### #164 -- create-invoice usa FK join para relationship + business_profile (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 143-154)

```text
const { data: relationship } = await supabaseClient
  .from('teacher_student_relationships')
  .select(`
    business_profile_id, teacher_id,
    business_profile:business_profiles!teacher_student_relationships_business_profile_id_fkey(
      enabled_payment_methods
    )
  `)
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .single();
```

Usa FK join para buscar `enabled_payment_methods` do business_profile. Se o cache de schema falhar, `relationship.business_profile` retorna `null`, e a linha 367 faz fallback para `['boleto', 'pix', 'card']`. O fallback mascara o erro — faturas podem ser geradas com metodos de pagamento incorretos (ex: professor desabilitou PIX mas o fallback inclui PIX).

Adicionalmente, `.single()` esta documentado na #162 mas o FK join nao estava.

**Acao**: Separar em duas queries sequenciais:
```text
// 1. Buscar relationship
const { data: relationship } = await supabaseClient
  .from('teacher_student_relationships')
  .select('business_profile_id, teacher_id')
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .maybeSingle();

// 2. Buscar enabled_payment_methods separadamente
let enabledMethods = ['boleto', 'pix', 'card']; // Default
if (relationship?.business_profile_id) {
  const { data: bp } = await supabaseClient
    .from('business_profiles')
    .select('enabled_payment_methods')
    .eq('id', relationship.business_profile_id)
    .maybeSingle();
  if (bp?.enabled_payment_methods) enabledMethods = bp.enabled_payment_methods;
}
```

---

### #165 -- create-invoice usa FK joins para class_participants + classes (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 226-241)

```text
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

Usa FK joins aninhados (`classes!inner` → `class_services`). Se cache falhar, `classInfo.class_services` retorna `null`, e o calculo de valor na linha 310 usa `body.amount / filteredClassData.length` como fallback — distribuindo igualmente em vez de usar preco real do servico.

**Acao**: Separar em queries sequenciais: buscar participantes, depois classes, depois servicos.

---

### #166 -- process-cancellation chama create-invoice com service_role key como auth token (Batch 1 -- ALTA)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 451-457)

```text
const { data: invoiceResult, error: invoiceError } = await supabaseClient
  .functions.invoke('create-invoice', {
    body: invoicePayload,
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
    }
  });
```

`create-invoice` autentica o usuario via `supabaseClient.auth.getUser(token)` (linha 45-49). O `SUPABASE_SERVICE_ROLE_KEY` e um JWT com `role: "service_role"` e sem `sub` claim — `getUser()` falha com erro de autenticacao. O erro e capturado silenciosamente no catch (linhas 467-470), e a fatura de cancelamento **nunca e criada**.

**Cenario concreto**: Aluno cancela aula fora do prazo → `process-cancellation` calcula multa → tenta criar fatura via `create-invoice` → autenticacao falha → `invoiceError` e capturado e logado → cancelamento retorna `success: true` → **multa nunca e cobrada**.

**Impacto**: CRITICO — Todas as cobranças de cancelamento via `process-cancellation` estao falhando silenciosamente. O professor perde receita de multas.

**Acao**: Refatorar `process-cancellation` para criar faturas diretamente (como `automated-billing` faz com RPC `create_invoice_and_mark_classes_billed`), OU adicionar fallback de auth em `create-invoice` para aceitar chamadas com service_role key:
```text
// No create-invoice, antes do getUser:
const token = authHeader.replace("Bearer ", "");

// Verificar se e service_role key (chamada server-to-server)
const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
let userId: string;

if (isServiceRole) {
  // Chamada server-to-server — teacher_id deve vir no body
  const { teacher_id } = body;
  if (!teacher_id) throw new Error("teacher_id required for service role calls");
  userId = teacher_id;
} else {
  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError) throw new Error(`Authentication error: ${userError.message}`);
  userId = userData.user.id;
}
```

---

### #167 -- handle-student-overage usa `.single()` para subscription lookup (Batch 5 -- MEDIA)

**Arquivo**: `supabase/functions/handle-student-overage/index.ts` (linha 79)

```text
const { data: subscriptionData, error: subError } = await supabaseClient
  .from('user_subscriptions')
  .select('stripe_subscription_id, stripe_customer_id, plan_id')
  .eq('user_id', userId)
  .eq('status', 'active')
  .single();
```

Se nao houver assinatura ativa (ex: professor cancelou assinatura entre iniciar e concluir a adicao de aluno), `.single()` lanca excecao ANTES do check gracioso na linha 81 (`if (subError || !subscriptionData?.stripe_subscription_id)`). O usuario recebe HTTP 500 em vez da mensagem amigavel "No active subscription".

**Acao**: Trocar `.single()` por `.maybeSingle()`. O check na linha 81 ja trata o caso de ausencia corretamente.

---

### #168 -- send-cancellation-notification usa `.single()` em 4 lookups de dependentes (Batch 8 -- BAIXA)

**Arquivo**: `supabase/functions/send-cancellation-notification/index.ts` (linhas 117, 147, 277, 374)

```text
// Linha 117 (dentro de loop de participantes)
const { data: dependent } = await supabaseClient
  .from('dependents')
  .select('name')
  .eq('id', p.dependent_id)
  .single();

// Linha 147 (dependente removido)
const { data: removedDependent } = await supabaseClient
  .from('dependents')
  .select('name')
  .eq('id', removed_dependent_id)
  .single();

// Linha 277 (cancelamento por aluno com dependente)
// Linha 374 (notificacao a aluno sobre dependente)
```

Se o dependente foi removido apos o cancelamento ser processado, a notificacao inteira falha silenciosamente (catch generico no caller). A notificacao de cancelamento nao e enviada para ninguem.

**Acao**: Trocar todos por `.maybeSingle()`. Se `!dependent`, usar nome generico "Dependente removido" na notificacao.

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.20` para `v5.21`
- Totais: `162 pontas soltas` para `168 pontas soltas` (8 implementadas, 160 pendentes)

### Tabela de Cobertura (expandir/adicionar entradas)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| automated-billing | **#163** (NOVA) |
| create-invoice | #61, #62, #162, **#164, #165** |
| process-cancellation | #5.1, #5.2, #107, #161, **#166** |
| handle-student-overage | **#167** (NOVA) |
| send-cancellation-notification | **#168** (NOVA) |
| verify-payment-status | #157, #158 |
| send-invoice-notification | #159 |
| webhook-stripe-connect | #86, #160 |
| process-orphan-cancellation-charges | #105, #106, #123, #149, #150, #152 |
| create-payment-intent-connect | #119, #153 |
| change-payment-method | #114, #115, #154 |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126, #155 |
| auto-verify-pending-invoices | M52, #156 |
| generate-boleto-for-invoice | #103, #121, #148, #151 |
| cancel-payment-intent | (cobertura OK) |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #167, #168 (total: **22 funcoes afetadas**)
- **FK joins proibidos**: adicionar #163, #164, #165 (total: funcoes com FK joins conhecidos agora incluem automated-billing, create-invoice, create-payment-intent-connect)
- **Autenticacao server-to-server ausente**: #166 (NOVO padrao — chamadas entre edge functions com service_role key falham em funcoes que exigem auth de usuario)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #163 | 2 (FK Joins) | ALTA | Core billing function — cache failures affect ALL daily billing |
| #164 | 5 (FK/Query) | MEDIA | FK join mascara enabled_payment_methods incorretos |
| #165 | 5 (FK/Query) | MEDIA | FK join aninhado — fallback distribui valor incorretamente |
| #166 | 1 (Critico) | ALTA | Cobranças de cancelamento NUNCA sao criadas — PERDA FINANCEIRA ATIVA |
| #167 | 5 (FK/Query) | MEDIA | `.single()` impede fallback gracioso |
| #168 | 8 (Polish) | BAIXA | `.single()` em notificacao — notificacao silenciosamente perdida |

---

## Secao Tecnica

### Correcao do #163

Substituir linhas 70-90 por queries sequenciais:
```text
// 1. Buscar relacionamentos sem FK joins
const { data: relationshipsToBill, error: relationshipsError } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select('id, student_id, teacher_id, billing_day, business_profile_id')
  .eq('billing_day', today);

// ... dentro do loop:
// 2. Buscar teacher separadamente
const { data: teacher } = await supabaseAdmin
  .from('profiles')
  .select('id, name, email, payment_due_days')
  .eq('id', relationship.teacher_id)
  .maybeSingle();

// 3. Buscar student separadamente
const { data: student } = await supabaseAdmin
  .from('profiles')
  .select('id, name, email')
  .eq('id', relationship.student_id)
  .maybeSingle();

if (!teacher || !student) {
  logStep(`Skipping - teacher or student profile not found`, {
    teacherId: relationship.teacher_id,
    studentId: relationship.student_id
  });
  continue;
}
```

### Correcao do #164

Separar FK join em duas queries:
```text
// 1. Buscar relationship sem FK join
const { data: relationship } = await supabaseClient
  .from('teacher_student_relationships')
  .select('business_profile_id, teacher_id')
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .maybeSingle();

// 2. Buscar enabled_payment_methods se tiver business_profile
let enabledMethods = ['boleto', 'pix', 'card'];
if (relationship?.business_profile_id) {
  const { data: bp } = await supabaseClient
    .from('business_profiles')
    .select('enabled_payment_methods')
    .eq('id', relationship.business_profile_id)
    .maybeSingle();
  if (bp?.enabled_payment_methods) enabledMethods = bp.enabled_payment_methods;
}
```

### Correcao do #165

Separar FK joins aninhados em queries sequenciais:
```text
// 1. Buscar participantes
const { data: participants } = await supabaseClient
  .from('class_participants')
  .select('id, class_id, student_id, dependent_id')
  .in('class_id', body.class_ids)
  .or(`student_id.eq.${billingStudentId},dependent_id.not.is.null`);

// 2. Buscar dados das classes
const classIds = [...new Set(participants?.map(p => p.class_id) || [])];
const { data: classes } = await supabaseClient
  .from('classes')
  .select('id, class_date, service_id')
  .in('id', classIds);

// 3. Buscar servicos
const serviceIds = [...new Set(classes?.filter(c => c.service_id).map(c => c.service_id) || [])];
const { data: services } = serviceIds.length > 0
  ? await supabaseClient.from('class_services').select('id, name, price').in('id', serviceIds)
  : { data: [] };
```

### Correcao do #166

Opcao A (Preferida): Adicionar suporte a service_role em create-invoice:
```text
// No inicio de create-invoice, apos extrair o token:
const token = authHeader.replace("Bearer ", "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const isServiceRole = token === serviceRoleKey;

let teacherId: string;

if (isServiceRole) {
  // Chamada server-to-server (ex: process-cancellation)
  const { teacher_id } = body;
  if (!teacher_id) throw new Error("teacher_id is required for service-to-service calls");
  teacherId = teacher_id;
  logStep("Service role authentication", { teacherId });
} else {
  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError) throw new Error(`Authentication error: ${userError.message}`);
  teacherId = userData.user.id;
  logStep("User authenticated", { userId: teacherId });
}
```

E em process-cancellation, adicionar `teacher_id` ao payload:
```text
const invoicePayload = {
  teacher_id: classData.teacher_id, // NOVO: necessario para auth service-role
  student_id: billingStudentId,
  ...
};
```

### Correcao do #167

Substituir `.single()` por `.maybeSingle()` na linha 79:
```text
const { data: subscriptionData, error: subError } = await supabaseClient
  .from('user_subscriptions')
  .select('stripe_subscription_id, stripe_customer_id, plan_id')
  .eq('user_id', userId)
  .eq('status', 'active')
  .maybeSingle();
```

### Correcao do #168

Substituir `.single()` por `.maybeSingle()` nas linhas 117, 147, 277, 374:
```text
const { data: dependent } = await supabaseClient
  .from('dependents')
  .select('name')
  .eq('id', p.dependent_id)
  .maybeSingle();

// Usar nome fallback
const depName = dependent?.name || 'Dependente';
```

---

## Pontas Soltas da v5.20 (Ainda Nao Implementadas)

- **#152**: process-orphan-cancellation-charges — verificacao de erro APOS filtragem
- **#153**: create-payment-intent-connect — `.single()` na linha 51
- **#154**: change-payment-method — `.single()` na linha 53
- **#155**: check-overdue-invoices — guard clause ausente no UPDATE (CRITICO)
- **#156**: auto-verify-pending-invoices — guard clause ausente no UPDATE (CRITICO)
- **#157**: verify-payment-status — `.single()` na linha 40
- **#158**: verify-payment-status — guard clause ausente no UPDATE (CRITICO)
- **#159**: send-invoice-notification — `.single()` em 3 lookups
- **#160**: webhook-stripe-connect — verificacao de payment_origin ausente (CRITICO)
- **#161**: process-cancellation — `.single()` na linha 107
- **#162**: create-invoice — `.single()` nas linhas 154, 382

---

## Prioridade de Implementacao (Batch 1 — Criticos)

Os seguintes bugs podem causar **perda financeira** e devem ser implementados PRIMEIRO:

1. **#166** — process-cancellation → create-invoice: auth failure silenciosa — **COBRANÇAS DE CANCELAMENTO NUNCA CRIADAS** (PERDA ATIVA)
2. **#155** — check-overdue-invoices: guard clause `.eq("status", "pendente")` no UPDATE
3. **#158** — verify-payment-status: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE
4. **#160** — webhook-stripe-connect: verificacao de `payment_origin` nos 3 handlers de falha
5. **#156** — auto-verify-pending-invoices: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE

**#166 e o bug mais grave**: ao contrario dos #155/#158/#160/#156 que sao race conditions (raras, dependem de timing), #166 e um **bug sistematico** — NENHUMA cobranca de cancelamento via process-cancellation funciona. Todo professor que depende de multas de cancelamento esta perdendo receita.

---

## Resumo Consolidado (v5.21)

| Categoria | Total v5.20 | Novos Itens | Total v5.21 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 162 | 6 (#163-#168) | 168 |
| Implementadas | 8 | 0 | 8 |
| Pendentes | 154 | +6 | 160 |
| Melhorias | 52 | 0 | 52 |
| Funcoes cobertas | 51 | +3 (automated-billing, handle-student-overage, send-cancellation-notification) | 54 |

## Nota sobre Completude

As 6 novas pontas foram encontradas em 6 funcoes: 3 novas na cobertura (automated-billing, handle-student-overage, send-cancellation-notification) e 3 ja parcialmente cobertas (create-invoice, process-cancellation). O destaque e a **#166** — um bug sistematico que impede a criacao de TODAS as cobranças de cancelamento, identificado pela analise do fluxo de autenticacao entre edge functions. O total de funcoes cobertas sobe para 54 de 75 (72%). As 21 funcoes restantes sao utilitarias/infraestrutura sem impacto direto no fluxo financeiro.
