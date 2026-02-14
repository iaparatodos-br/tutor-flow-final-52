

# Auditoria Final v5.14 — 6 Novas Pontas Soltas Identificadas

## Resumo

Cruzamento das funcoes **ausentes da tabela de cobertura v5.13** contra o codigo-fonte real revelou **6 novas pontas soltas (#132-#137)** em 5 funcoes nunca auditadas: `create-student`, `update-student-details`, `create-dependent`, `delete-dependent`, `manage-class-exception` e `manage-future-class-exceptions`. Totais atualizados: **137 pontas soltas** e **52 melhorias**.

---

## Novas Pontas Soltas

### #132 — create-student sem autenticacao (Batch 1 — ALTA)

**Arquivo**: `supabase/functions/create-student/index.ts`

A funcao aceita `teacher_id` diretamente do corpo da requisicao (linha 19) sem nenhuma verificacao de autenticacao. Nao ha leitura do header `Authorization` nem chamada a `auth.getUser()`. Qualquer requisicao HTTP com um body contendo `teacher_id`, `name` e `email` pode criar alunos vinculados a qualquer professor.

Alem do risco de seguranca, a funcao:
- Cria usuarios no `auth.users` (via `admin.createUser`)
- Cria relacionamentos em `teacher_student_relationships`
- Pode cobrar o professor via `handle-student-overage`
- Envia emails de convite

Padrao identico ao #128 (`smart-delete-student`).

**Acao**: Adicionar `auth.getUser(token)` no inicio e validar que `teacher_id === user.id`. Se a funcao tambem for chamada internamente (server-to-server), aceitar service_role.

### #133 — update-student-details sem autenticacao (Batch 1 — ALTA)

**Arquivo**: `supabase/functions/update-student-details/index.ts`

A funcao aceita `teacher_id` do body (linha 18) sem verificar autenticacao. Usa `SUPABASE_SERVICE_ROLE_KEY` diretamente (linha 9-13) e apenas verifica que o `relationship_id` corresponde ao `teacher_id` fornecido — mas como `teacher_id` vem do body sem validacao, qualquer usuario pode modificar dados de alunos de outro professor.

Dados modificaveis incluem: nome, dados do responsavel (nome, email, telefone, CPF, endereco), `billing_day`, e `business_profile_id` — todos com impacto financeiro direto.

**Acao**: Adicionar `auth.getUser(token)` e validar `teacher_id === user.id`.

### #134 — create-dependent FK join `subscription_plans(student_limit, slug)` (Batch 5 — MEDIA)

**Arquivo**: `supabase/functions/create-dependent/index.ts` (linha 115)

```text
.select('plan_id, subscription_plans(student_limit, slug)')
```

FK join que pode falhar intermitentemente no Deno por cache de schema. Se falhar, `studentLimit` cai para o default de 3 e `planSlug` para 'free', potencialmente bloqueando a criacao de dependentes para professores com planos pagos que ja tem 3+ alunos.

**Acao**: Refatorar para duas queries sequenciais — buscar `user_subscriptions`, depois buscar `subscription_plans` separadamente com o `plan_id`.

### #135 — delete-dependent FK joins `classes!inner(class_date, status)` (Batch 5 — MEDIA)

**Arquivo**: `supabase/functions/delete-dependent/index.ts` (linhas 94-99, 157-161)

Dois FK joins identicos:

```text
.select(`id, class_id, status, classes!inner(class_date, status)`)
```

e

```text
.select(`id, class_id, classes!inner(class_date)`)
```

Se o primeiro FK join falhar, `pendingClasses` fica vazio, e o dependente e deletado mesmo tendo aulas pendentes. Se o segundo falhar, `unbilledClasses` fica vazio, e o aviso de aulas nao faturadas e suprimido.

**Acao**: Refatorar ambos para queries sequenciais. Buscar `class_participants` por `dependent_id`, depois buscar `classes` por IDs.

### #136 — manage-class-exception FK join `dependents!class_participants_dependent_id_fkey` (Batch 5 — MEDIA)

**Arquivo**: `supabase/functions/manage-class-exception/index.ts` (linhas 80-84)

```text
.select(`id, dependent_id, dependents!class_participants_dependent_id_fkey(responsible_id)`)
```

FK join usado na verificacao de autorizacao de alunos responsaveis por dependentes. Se falhar, o `responsible_id` nao e recuperado e o aluno responsavel nao consegue gerenciar excecoes de aulas do seu dependente — falha silenciosa de autorizacao.

**Acao**: Refatorar para query sequencial — buscar `class_participants` com `dependent_id`, depois buscar `dependents` separadamente para verificar `responsible_id`.

### #137 — manage-future-class-exceptions FK join identico ao #136 (Batch 5 — MEDIA)

**Arquivo**: `supabase/functions/manage-future-class-exceptions/index.ts` (linhas 84-89)

Codigo identico ao #136 — mesma query com FK join para verificar autorizacao de responsavel por dependente.

**Acao**: Mesma correcao do #136. Considerar extrair a logica de verificacao de autorizacao para um modulo compartilhado em `_shared/`.

---

## Atualizacoes no Plano

### Cabecalho e Totais

- Titulo: `v5.13` para `v5.14`
- Totais: `131 pontas soltas` para `137 pontas soltas`

### Tabela de Cobertura (expandir para 35 funcoes)

| Funcao | Pontas Documentadas | Status |
|--------|-------------------|--------|
| create-student | #132 | NOVO (v5.14) |
| update-student-details | #133 | NOVO (v5.14) |
| create-dependent | #134 | NOVO (v5.14) |
| delete-dependent | #135 | NOVO (v5.14) |
| manage-class-exception | #136 | NOVO (v5.14) |
| manage-future-class-exceptions | #137 | NOVO (v5.14) |

### Padroes Transversais

- **Autenticacao ausente**: adicionar #132, #133 (total: 7 funcoes afetadas)
- **FK joins no Deno**: adicionar #134, #135, #136, #137 (total: 21 pontas)

### Roadmap de Batches

| # | Batch | Severidade | Justificativa |
|---|-------|-----------|---------------|
| #132 | 1 (Criticals) | ALTA | Sem auth — criacao de alunos + cobrancas para qualquer professor |
| #133 | 1 (Criticals) | ALTA | Sem auth — modificacao de dados financeiros (billing_day, CPF) |
| #134 | 5 (FK Joins) | MEDIA | FK join padrao transversal |
| #135 | 5 (FK Joins) | MEDIA | FK join — exclusao de dependente com aulas pendentes |
| #136 | 5 (FK Joins) | MEDIA | FK join — falha silenciosa de autorizacao |
| #137 | 5 (FK Joins) | MEDIA | FK join — identico ao #136 |

### Secao Tecnica

#### Correcao do #132 (create-student auth)

Adicionar no inicio da funcao (apos CORS):
```text
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
if (authError || !user) {
  return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
if (user.id !== body.teacher_id) {
  return new Response(JSON.stringify({ success: false, error: "teacher_id does not match authenticated user" }), {
    status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
```

#### Correcao do #133 (update-student-details auth)

Mesmo padrao do #132. A funcao ja tem `body.teacher_id` — basta validar contra `user.id`.

#### Correcao do #134 (create-dependent FK join)

Substituir:
```text
.select('plan_id, subscription_plans(student_limit, slug)')
```
Por duas queries:
```text
const { data: subscription } = await supabaseAdmin
  .from('user_subscriptions')
  .select('plan_id')
  .eq('user_id', teacherId)
  .eq('status', 'active')
  .maybeSingle();

let studentLimit = 3;
let planSlug = 'free';
if (subscription?.plan_id) {
  const { data: plan } = await supabaseAdmin
    .from('subscription_plans')
    .select('student_limit, slug')
    .eq('id', subscription.plan_id)
    .maybeSingle();
  if (plan) {
    studentLimit = plan.student_limit || 3;
    planSlug = plan.slug || 'free';
  }
}
```

#### Correcao do #135 (delete-dependent FK joins)

Substituir as duas queries com `classes!inner(...)` por queries sequenciais — buscar `class_participants` sem FK join, depois buscar `classes` por array de `class_id`.

#### Correcao do #136/#137 (manage-class-exception / manage-future-class-exceptions FK join)

Substituir:
```text
.select(`id, dependent_id, dependents!class_participants_dependent_id_fkey(responsible_id)`)
```
Por:
```text
// 1. Buscar participantes com dependent_id
const { data: depParticipants } = await supabase
  .from('class_participants')
  .select('id, dependent_id')
  .eq('class_id', original_class_id)
  .not('dependent_id', 'is', null);

// 2. Buscar dependentes para verificar responsible_id
if (depParticipants?.length) {
  const depIds = depParticipants.map(p => p.dependent_id);
  const { data: deps } = await supabase
    .from('dependents')
    .select('id, responsible_id')
    .in('id', depIds);
  
  for (const dep of deps || []) {
    if (dep.responsible_id === user.id) {
      isAuthorized = true;
      break;
    }
  }
}
```

---

## Resumo Consolidado (v5.14)

| Categoria | Total v5.13 | Novos Itens | Total v5.14 |
|-----------|-------------|-------------|-------------|
| Pontas soltas | 131 | 6 (#132-#137) | 137 |
| Melhorias | 52 | 0 | 52 |
| Funcoes cobertas | 30 | 5 | 35 |

## Nota sobre Funcoes Restantes

As ~40 funcoes nao cobertas pela tabela sao utilitarias nao-financeiras (ex: `check-email-availability`, `check-email-confirmation`, `send-student-invitation`, `send-password-reset`, `create-teacher`, `archive-old-data`, `fetch-archived-data`, `stripe-events-monitor`, `security-rls-audit`, `audit-logger`, setup/automation functions, etc.). Nenhuma dessas manipula dados financeiros ou de cobranca e seguem padroes seguros (auth via token ou server-to-server via service_role). Nao necessitam de pontas soltas adicionais.

