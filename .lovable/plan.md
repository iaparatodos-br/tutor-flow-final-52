

# Auditoria Profunda v5.23 — 6 Novas Pontas Soltas Identificadas

## Resumo

Revisao exaustiva do codigo atual de todas as Edge Functions financeiras contra as 174 pontas soltas existentes revelou **6 novas pontas soltas (#175-#180)** em 5 funcoes. Totais atualizados: **180 pontas soltas** (8 implementadas, 172 pendentes) e **52 melhorias**.

---

## Novas Pontas Soltas (v5.23)

### #175 -- create-payment-intent-connect: SEM autenticacao/autorizacao — qualquer chamador pode gerar Payment Intents (Batch 1 -- CRITICO)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 20-32)

```text
// A funcao usa service_role key diretamente (linhas 26-30):
const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

// Nenhuma verificacao de auth.getUser() ou getClaims()
// Nenhuma validacao de quem esta chamando
const { invoice_id, payment_method } = await req.json();
```

A funcao `create-payment-intent-connect` nao possui NENHUMA verificacao de autenticacao ou autorizacao. Qualquer requisicao HTTP com um `invoice_id` valido pode gerar um Payment Intent no Stripe. Nao ha verificacao de que o chamador e:
- O aluno dono da fatura
- O responsavel/guardian
- O professor dono da aula
- Outra Edge Function autorizada

**Cenario de ataque**: Um atacante com acesso a um `invoice_id` (ex: interceptando requests ou enumerando UUIDs) pode gerar Payment Intents no Stripe para faturas de outros usuarios, potencialmente redirecionando pagamentos ou criando cobranças fraudulentas.

**Impacto**: CRITICO — Vulnerabilidade de seguranca. Payment Intents podem ser criados por qualquer pessoa sem autenticacao.

**Acao**: Adicionar validacao de autenticacao E ownership:
```text
// 1. Verificar auth header
const authHeader = req.headers.get("Authorization");
if (!authHeader) throw new Error("Unauthorized");

// 2. Validar usuario (ou aceitar service_role de chamadas server-to-server)
const token = authHeader.replace("Bearer ", "");
const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

// 3. Se nao for service_role, validar que o usuario e o student_id da fatura ou seu teacher
if (userData?.user) {
  const userId = userData.user.id;
  if (userId !== invoice.student_id && userId !== invoice.teacher_id) {
    // Verificar se e responsavel
    const { data: guardian } = await supabaseClient
      .from('teacher_student_relationships')
      .select('id')
      .eq('student_id', invoice.student_id)
      .maybeSingle();
    // ... validar
  }
}
```

**NOTA**: Esta funcao e chamada por `automated-billing`, `create-invoice` e `generate-boleto-for-invoice` via `functions.invoke()` com service_role. A correcao deve aceitar ambos os fluxos (user auth E server-to-server).

---

### #176 -- create-payment-intent-connect: FK joins para student, teacher e business_profile (Batch 2 -- ALTA)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 37-51)

```text
const { data: invoice, error: invoiceError } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(
      name, email, cpf,
      address_street, address_city, address_state, address_postal_code, address_complete
    ),
    teacher:profiles!invoices_teacher_id_fkey(name, email, payment_due_days),
    business_profile:business_profiles!invoices_business_profile_id_fkey(
      id, business_name, stripe_connect_id, enabled_payment_methods
    )
  `)
  .eq("id", invoice_id)
  .single();
```

**3 problemas simultaneos**:
1. FK join `profiles!invoices_student_id_fkey` para dados do aluno (CPF, endereco)
2. FK join `profiles!invoices_teacher_id_fkey` para dados do professor
3. FK join `business_profiles!invoices_business_profile_id_fkey` para dados do negocio (stripe_connect_id)

Se o cache de schema do Deno falhar em qualquer um deles:
- `invoice.student` retorna null → boleto nao pode ser gerado (sem CPF/endereco)
- `invoice.teacher` retorna null → calculo de dias de vencimento falha
- `invoice.business_profile` retorna null → roteamento de pagamento falha (sem stripe_connect_id)

**Impacto**: ALTO — Funcao mais critica do sistema de pagamentos. Falha de cache impede TODOS os pagamentos (boleto, PIX, cartao).

**Acao**: Separar em 4 queries sequenciais:
```text
// 1. Buscar fatura
const { data: invoice } = await supabaseClient.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
// 2. Buscar student profile
const { data: student } = await supabaseClient.from("profiles").select("name, email, cpf, ...").eq("id", invoice.student_id).maybeSingle();
// 3. Buscar teacher profile
const { data: teacher } = await supabaseClient.from("profiles").select("name, email, payment_due_days").eq("id", invoice.teacher_id).maybeSingle();
// 4. Buscar business profile
const { data: businessProfile } = await supabaseClient.from("business_profiles").select("id, business_name, stripe_connect_id, enabled_payment_methods").eq("id", invoice.business_profile_id).maybeSingle();
```

Tambem corrigir `.single()` para `.maybeSingle()` (resolve #153 simultaneamente).

---

### #177 -- create-payment-intent-connect: `.single()` pode causar falha em cascata no automated-billing (Batch 2 -- ALTA)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linha 51)

```text
.eq("id", invoice_id)
.single();  // ← Lanca 500 se fatura nao encontrada
```

**Contexto de cascata**: `automated-billing` (linha 522-530) e `create-invoice` (linha 412-423) chamam `create-payment-intent-connect` via `functions.invoke()`. Se a fatura for deletada entre a criacao e a chamada de pagamento (race condition), `.single()` lanca excecao HTTP 500. O `automated-billing` captura isso no try/catch e continua, mas o log registra um erro generico "Invoice not found" sem contexto suficiente para diagnostico.

Este item complementa #153 (ja documentado) com o impacto em cascata.

**Impacto**: ALTO — Falha silenciosa no faturamento automatizado. A fatura e criada mas o pagamento nao e gerado, e o aluno nao recebe boleto/PIX.

**Acao**: Trocar `.single()` por `.maybeSingle()` com retorno HTTP 404 semantico em vez de 500.

---

### #178 -- check-overdue-invoices: usa tabela `class_notifications` para rastrear notificacoes de FATURAS (Batch 4 -- MEDIA)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 47-53, 100-105)

```text
// Linha 47-53: Verificacao de duplicidade de notificacao de fatura vencida
const { data: existingNotification } = await supabase
  .from("class_notifications")
  .select("id")
  .eq("class_id", invoice.id)  // ← invoice.id armazenado em coluna "class_id"!
  .eq("notification_type", "invoice_overdue")
  .maybeSingle();

// Linha 100-105: Verificacao de duplicidade de lembrete de pagamento
const { data: existingReminder } = await supabase
  .from("class_notifications")
  .select("id")
  .eq("class_id", invoice.id)  // ← Mesmo problema
  .eq("notification_type", "invoice_payment_reminder")
  .maybeSingle();
```

A funcao armazena IDs de FATURAS (invoices) na coluna `class_id` da tabela `class_notifications`, que possui FK constraint para a tabela `classes`. Isso e semanticamente incorreto e pode causar:
1. Falha de FK constraint se `invoice.id` nao existir na tabela `classes` (UUIDs diferentes)
2. Confusao de dados — notificacoes de aulas e de faturas misturadas na mesma tabela
3. Queries incorretas ao filtrar por tipo

**Impacto**: MEDIO — Potencial falha de FK constraint ao inserir notificacao. Se funcionar, os dados ficam semanticamente poluidos.

**Acao**: Criar tabela dedicada `invoice_notifications` ou adicionar coluna `invoice_id` nullable na tabela `class_notifications`.

---

### #179 -- change-payment-method: FK joins para student e teacher profiles (Batch 3 -- MEDIA)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 47-53)

```text
const { data: invoice, error: invoiceError } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(id, name, email),
    teacher:profiles!invoices_teacher_id_fkey(id, name)
  `)
  .eq("id", invoice_id)
  .single();
```

**2 problemas simultaneos**:
1. FK joins proibidos para profiles (student e teacher) — falha de cache do Deno
2. `.single()` em vez de `.maybeSingle()` — lanca 500 se fatura nao existir

Se `invoice.student` retornar null por cache miss, o audit log (linha 224) registra dados incompletos. Se `.single()` lancar, o usuario recebe erro generico em vez de "Fatura nao encontrada".

**Impacto**: MEDIO — Funcao de UX critica para o aluno. Falha impede alteracao de metodo de pagamento.

**Acao**: Separar em queries sequenciais e trocar `.single()` por `.maybeSingle()`.

---

### #180 -- automated-billing: FK joins na query principal de relacionamentos (Batch 2 -- ALTA)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 70-90)

```text
const { data: relationshipsToBill, error: relationshipsError } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select(`
    id,
    student_id,
    teacher_id,
    billing_day,
    business_profile_id,
    teacher:profiles!teacher_id (
      id, name, email, payment_due_days
    ),
    student:profiles!student_id (
      id, name, email
    )
  `)
  .eq('billing_day', today);
```

Esta e a query PRINCIPAL do faturamento automatizado — busca TODOS os relacionamentos a serem cobrados no dia. Se o cache de schema falhar:
- `relationship.teacher` retorna null → `teacher?.name` e undefined, `teacher?.payment_due_days` usa default de 15 (incorreto para quem configurou outro valor)
- `relationship.student` retorna null → `student?.name` fica vazio, logs ficam sem identificacao

Este item complementa #163 (ja documentado), mas com enfase especifica na query principal (linhas 70-90) que afeta TODOS os relacionamentos do dia, nao apenas os diagnosticos.

**Impacto**: ALTO — Se o cache falhar neste ponto, NENHUM faturamento automatizado funciona corretamente naquele dia. O `payment_due_days` incorreto gera boletos com prazo errado.

**Acao**: Separar em queries sequenciais dentro do loop:
```text
// Query principal simplificada (sem FK):
const { data: relationshipsToBill } = await supabaseAdmin
  .from('teacher_student_relationships')
  .select('id, student_id, teacher_id, billing_day, business_profile_id')
  .eq('billing_day', today);

// Dentro do loop:
for (const relationship of relationshipsToBill) {
  const { data: teacher } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, payment_due_days')
    .eq('id', relationship.teacher_id)
    .maybeSingle();
  
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email')
    .eq('id', relationship.student_id)
    .maybeSingle();
  // ...
}
```

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.22` para `v5.23`
- Totais: `174 pontas soltas` para `180 pontas soltas` (8 implementadas, 172 pendentes)

### Tabela de Cobertura (expandir/adicionar entradas)

| Funcao | Pontas Documentadas (atualizado) |
|--------|--------------------------------|
| automated-billing | #163, #172, **#180** |
| create-invoice | #61, #62, #162, #164, #165 |
| process-cancellation | #5.1, #5.2, #107, #161, #166 |
| handle-student-overage | #167 |
| send-cancellation-notification | #168 |
| verify-payment-status | #157, #158 |
| send-invoice-notification | #159 |
| webhook-stripe-connect | #86, #160, #169, #173 |
| cancel-payment-intent | #169, #174 |
| change-payment-method | #114, #115, #154, #170, **#179** |
| generate-boleto-for-invoice | #103, #121, #148, #151, #171 |
| process-orphan-cancellation-charges | #105, #106, #123, #149, #150, #152 |
| create-payment-intent-connect | #119, #153, **#175, #176, #177** |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126, #155, **#178** |
| auto-verify-pending-invoices | M52, #156 |

### Padroes Transversais (atualizar contagens)

- **`.single()` vs `.maybeSingle()`**: adicionar #177, #179 (total: **26 funcoes afetadas**)
- **FK joins proibidos**: adicionar #176, #179, #180 (total: funcoes com FK joins conhecidos agora incluem automated-billing x3, create-invoice x2, generate-boleto-for-invoice, create-payment-intent-connect, change-payment-method)
- **Status inconsistente 'paid' vs 'paga'**: #169 (5 ocorrencias em 2 funcoes)
- **Filtro `.eq()` duplicado na mesma coluna**: #170 (change-payment-method)
- **NOVO: Funcao sem autenticacao/autorizacao**: #175 (create-payment-intent-connect)
- **NOVO: Uso semanticamente incorreto de tabela**: #178 (check-overdue-invoices usa class_notifications para faturas)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #175 | 1 (Critico) | CRITICO | Funcao de pagamento sem autenticacao — qualquer pessoa pode gerar Payment Intents |
| #176 | 2 (FK Joins) | ALTA | FK joins triplos na funcao mais critica de pagamentos |
| #177 | 2 (Cascata) | ALTA | `.single()` causa falha silenciosa em cascata no faturamento automatizado |
| #178 | 4 (Schema) | MEDIA | Notificacoes de faturas armazenadas em tabela de notificacoes de aulas |
| #179 | 3 (FK+Single) | MEDIA | FK joins + `.single()` na funcao de alteracao de metodo de pagamento |
| #180 | 2 (FK Critico) | ALTA | FK joins na query principal do faturamento automatizado |

---

## Prioridade de Implementacao Atualizada (Batch 1 — Criticos)

Os seguintes bugs podem causar **perda financeira, falha de seguranca ou vulnerabilidade ativa** e devem ser implementados PRIMEIRO:

1. **#175** — create-payment-intent-connect: SEM AUTENTICACAO — **QUALQUER PESSOA PODE GERAR PAYMENT INTENTS** (VULNERABILIDADE CRITICA)
2. **#166** — process-cancellation → create-invoice: auth failure silenciosa — **COBRANÇAS DE CANCELAMENTO NUNCA CRIADAS** (PERDA ATIVA)
3. **#169** — webhook-stripe-connect + cancel-payment-intent: status 'paid' em vez de 'paga' — **INCONSISTENCIA DE DADOS EM 5 LOCAIS**
4. **#170** — change-payment-method: bypass de autorizacao por filtro `.eq()` duplicado — **FALHA DE SEGURANCA**
5. **#155** — check-overdue-invoices: guard clause `.eq("status", "pendente")` no UPDATE
6. **#158** — verify-payment-status: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE
7. **#160** — webhook-stripe-connect: verificacao de `payment_origin` nos 3 handlers de falha
8. **#156** — auto-verify-pending-invoices: guard clause `.in("status", ["pendente", "falha_pagamento"])` no UPDATE

**#175 e o bug mais critico desta auditoria** — e uma vulnerabilidade de seguranca ativa que permite a criacao nao autenticada de Payment Intents no Stripe.

---

## Pontas Soltas da v5.22 (Ainda Nao Implementadas)

- **#152**: process-orphan-cancellation-charges — verificacao de erro APOS filtragem
- **#153**: create-payment-intent-connect — `.single()` na linha 51 (subsumido por #177)
- **#154**: change-payment-method — `.single()` na linha 53 (subsumido por #179)
- **#155**: check-overdue-invoices — guard clause ausente no UPDATE (CRITICO)
- **#156**: auto-verify-pending-invoices — guard clause ausente no UPDATE (CRITICO)
- **#157**: verify-payment-status — `.single()` na linha 40
- **#158**: verify-payment-status — guard clause ausente no UPDATE (CRITICO)
- **#159**: send-invoice-notification — `.single()` em 3 lookups
- **#160**: webhook-stripe-connect — verificacao de payment_origin ausente (CRITICO)
- **#161**: process-cancellation — `.single()` na linha 107
- **#162**: create-invoice — `.single()` nas linhas 154, 382
- **#163**: automated-billing — FK joins na query principal (ALTA)
- **#164**: create-invoice — FK join para relationship (MEDIA)
- **#165**: create-invoice — FK joins aninhados para classes (MEDIA)
- **#166**: process-cancellation — auth failure com service_role key (CRITICO)
- **#167**: handle-student-overage — `.single()` (MEDIA)
- **#168**: send-cancellation-notification — `.single()` em 4 lookups (BAIXA)
- **#169**: webhook-stripe-connect + cancel-payment-intent — status 'paid' vs 'paga' (CRITICO)
- **#170**: change-payment-method — bypass autorizacao `.eq()` duplicado (CRITICO)
- **#171**: generate-boleto-for-invoice — FK joins (ALTA)
- **#172**: automated-billing — FK join diagnostico (MEDIA)
- **#173**: webhook-stripe-connect — `.single()` em 3 handlers (MEDIA)
- **#174**: cancel-payment-intent — `.single()` (MEDIA)

---

## Resumo Consolidado (v5.23)

| Categoria | Total v5.22 | Novos Itens | Total v5.23 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 174 | 6 (#175-#180) | 180 |
| Implementadas | 8 | 0 | 8 |
| Pendentes | 166 | +6 | 172 |
| Melhorias | 52 | 0 | 52 |
| Funcoes auditadas | 54 | +1 | 55 |

### Novos Padroes Identificados nesta Auditoria

1. **Funcao de pagamento sem autenticacao**: `create-payment-intent-connect` aceita qualquer requisicao HTTP com um `invoice_id` sem verificar identidade do chamador. E a funcao mais critica do sistema (gera boletos, PIX e checkout de cartao). Correcao deve suportar tanto auth de usuario quanto chamadas server-to-server.

2. **FK joins triplos em funcao critica**: `create-payment-intent-connect` faz 3 FK joins simultaneos (student, teacher, business_profile). Se qualquer um falhar por cache, o pagamento inteiro nao e gerado.

3. **Uso incorreto de tabela**: `check-overdue-invoices` armazena IDs de faturas na coluna `class_id` de `class_notifications`, violando a semantica do schema e arriscando FK constraint failures.

4. **Cascata de `.single()`**: Quando funcoes internas (como `create-payment-intent-connect`) usam `.single()`, funcoes que as chamam (como `automated-billing`) sofrem falhas silenciosas — a fatura e criada mas o pagamento nao e gerado.
