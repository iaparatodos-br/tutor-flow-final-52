# Plano de Cobrança Híbrida — v4.4

**Data**: 2026-02-13
**Status Fase 1 (Migração SQL)**: ✅ Concluída

---

## Contexto

O plano anterior (v3.10, 228 gaps, ~2939 linhas) foi substituído por regras de negócio simplificadas na v4.0. A v4.1 incorporou 16 pontas soltas, a v4.2 adicionou 7 (#17-#23) e 4 melhorias (M1-M4). A v4.3 adicionou 6 pontas soltas (#24-#29) e 3 melhorias (M5-M7). Esta v4.4 adiciona 6 novas pontas soltas (#30-#35) e 3 melhorias (M8-M10) identificadas em revisão cruzada dos fluxos de notificação, cálculo de taxas e consistência de payment methods.

Principais mudanças desde v3.10:

1. A escolha "paga antes" ou "paga depois" é uma configuração global do professor (`charge_timing` em `business_profiles`), enquanto "aula paga ou não" é definida por aula (`is_paid_class` em `classes`).
2. Pré-pago gera fatura local imediata — sem Invoice Items no Stripe Connect.
3. Cancelamento simplificado: sem reembolsos, sem void de faturas Stripe.
4. Recorrência bloqueada apenas para aulas pagas + prepaid.

---

## Novas Regras de Negócio (4 Casos de Uso)

### Caso 1: Mensalidade + Avulsa Depois
- Aluno **tem** mensalidade ativa
- Professor configura cobrança **depois**
- Professor agenda aula e seleciona "aula paga":
  - Aula **pode** ser recorrente
  - Aulas concluídas até o dia de geração da próxima fatura da mensalidade são somadas e adicionadas à fatura da mensalidade seguinte
- Se "aula não paga": recorrência liberada normalmente

### Caso 2: Mensalidade + Avulsa Antes
- Aluno **tem** mensalidade ativa
- Professor configura cobrança **antes**
- Professor agenda aula e seleciona "aula paga":
  - Aula **não pode** ser recorrente
  - Fatura individual gerada imediatamente
- Se "aula não paga": recorrência liberada normalmente

### Caso 3: Avulsa Depois (sem mensalidade)
- Aluno **não tem** mensalidade
- Professor configura cobrança **depois**
- Sistema mostra opção "aula paga ou não"
- Aula **pode** ser recorrente
- Aulas concluídas até o dia de fechamento do aluno são somadas em única fatura

### Caso 4: Avulsa Antes (sem mensalidade)
- Aluno **não tem** mensalidade
- Professor configura cobrança **antes**
- Sistema mostra opção "aula paga ou não"
- Aula **não pode** ser recorrente (quando paga)

### Cancelamento (todos os casos)
- **Aula não paga**: cancelamento normal, sem impacto financeiro
- **Aula paga antes**: cancelamento normal, sem reembolso/crédito/anistia. Tratamento combinado entre professor e aluno fora do sistema
- **Aula paga depois e cancelada com cobrança**:
  - Se aula **ainda não foi faturada**: botão de anistia aparece no modal da aula (já existe)
  - Se aula **já foi faturada**: label de aviso substitui o botão dizendo "não é mais possível oferecer anistia pois a aula já foi faturada"
  - Se professor concede anistia: aula não é incluída na próxima fatura

### Card Informativo
- No local onde o professor escolhe "paga antes" ou "paga depois", exibir card explicativo detalhando cada modelo

### Aulas em grupo + prepaid
- Para aulas em grupo com `charge_timing = 'prepaid'` e `is_paid_class = true`, gerar **uma fatura por participante** (student_id). Cada participante recebe sua própria fatura individual no momento do agendamento.

### Invariante de segurança: faturas de cancelamento + prepaid
- **Faturas de cancelamento (`invoice_type = 'cancellation'`) NUNCA devem existir para aulas pré-pagas.** O `process-cancellation` força `shouldCharge = false` quando `charge_timing = 'prepaid'`, impedindo a criação dessas faturas. Se por bug uma fatura de cancelamento for criada para aula prepaid, a anistia a cancelaria normalmente — mas esse cenário não deve ocorrer.

---

## Detalhamento Técnico

### 1. Banco de Dados

#### 1.1 business_profiles — charge_timing ✅
```sql
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS charge_timing TEXT NOT NULL DEFAULT 'postpaid'
  CHECK (charge_timing IN ('prepaid', 'postpaid'));
```

#### 1.2 classes — is_paid_class ✅
```sql
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_paid_class BOOLEAN NOT NULL DEFAULT true;
```

#### 1.3 invoices — CHECK constraint para invoice_type (PENDENTE — Ponta #16)
Tipos suportados: `regular`, `manual`, `automated`, `monthly_subscription`, `prepaid_class`, `cancellation`, `orphan_charges`

### 2. Frontend — ClassForm.tsx

#### 2.1 Novo campo "Aula Paga"
- Switch/checkbox "Esta aula será cobrada?" entre Tipo de Aula e Seleção de Serviço
- Visível apenas quando `is_experimental = false`
- Default: `true`

#### 2.2 Bloqueio de recorrência
- Quando `charge_timing = 'prepaid'` E `is_paid_class = true`: desabilitar recorrência + tooltip
- Quando `is_paid_class = false`: recorrência sempre liberada

#### 2.3 Dados necessários (Pontas #2.3, #17, M1)
- **ClassFormData** deve incluir `is_paid_class: boolean`
- **charge_timing**: ClassForm busca diretamente via `useEffect` ao abrir o dialog (query a `business_profiles` do professor autenticado), sem necessidade de props

#### 2.4 Persistência — 3 pontos de inserção (Pontas #2.4, #17)
1. `handleClassSubmit` (Agenda.tsx, ~linha 1419) — criação de aula nova
2. `materializeVirtualClass` frontend (Agenda.tsx, ~linha 1288) — materialização via frontend
3. Edge function `materialize-virtual-class` (~linha 252) — materialização via backend

Todos devem incluir `is_paid_class` no payload de inserção.

### 3. Frontend — Settings/BillingSettings.tsx (Ponta #22)

**Arquivo**: `src/components/Settings/BillingSettings.tsx` (configurações do professor)
**NÃO** confundir com `src/components/BillingSettings.tsx` (dados de cobrança do aluno)

#### 3.1 Card "Modelo de Cobrança"
- Dois cards selecionáveis: "Cobrar Antes" e "Cobrar Depois"
- Card informativo com texto definido (ver M4 abaixo)

#### 3.2 Carregamento e salvamento (Ponta #3.2)
- Query atual `select('id, enabled_payment_methods')` deve incluir `charge_timing`
- Novo estado para `charge_timing` + `UPDATE business_profiles SET charge_timing = ...`

### 4. Backend — Geração de fatura pré-paga

#### 4.1 Quando gerar (Ponta #18)
- No `handleClassSubmit` (Agenda.tsx), após criar a aula com sucesso
- Condições: `charge_timing = 'prepaid'` E `is_paid_class = true` E `is_experimental = false` E professor tem `business_profile`
- Pseudo-código:
  ```
  const classInsertResult = await supabase.from('classes').insert(...)
  if (chargeTiming === 'prepaid' && formData.is_paid_class && !formData.is_experimental) {
    for (const participant of participantsToInsert) {
      const { error } = await supabase.functions.invoke('create-invoice', {
        body: { student_id: participant.student_id, class_id, invoice_type: 'prepaid_class', amount: servicePrice, ... }
      })
      if (error) toast({ title: t('...'), variant: 'destructive' })
    }
  }
  ```

#### 4.2 Como gerar
- Reutilizar lógica do `create-invoice`
- `invoice_type = 'prepaid_class'`, status `pendente`
- Método de pagamento segue hierarquia existente (Boleto > PIX > Nenhum)

#### 4.3 Aulas em grupo (Ponta #4.3)
- Para aulas em grupo prepaid, gerar uma fatura **por participante**

#### 4.4 Autenticação do create-invoice (Ponta #23)
- `create-invoice` usa `getUser(token)` — funciona com token do usuário autenticado no frontend
- Confirmar que aceita `invoice_type = 'prepaid_class'` sem validação que rejeite esse tipo

#### 4.5 Validação de valor mínimo no create-invoice (Ponta #24)
- `create-invoice` (linha 58-69) **rejeita faturas com valor < R$ 5,00** assumindo boleto
- Para faturas pré-pagas de serviços baratos (ex: R$ 3,00), a rejeição é incorreta se PIX (mínimo R$ 1,00) estiver habilitado
- **Ação**: A validação de valor mínimo deve ser condicional ao método de pagamento efetivo, não um hard-block universal. Verificar `enabled_payment_methods` antes de rejeitar:
  - Se boleto habilitado e >= R$ 5,00: OK
  - Se PIX habilitado e >= R$ 1,00: OK
  - Se apenas cartão: sem mínimo
  - Se nenhum método suporta o valor: rejeitar com mensagem específica

#### 4.6 FK join syntax no create-invoice (Ponta #25)
- `create-invoice` (linha 148) usa `business_profile:business_profiles!teacher_student_relationships_business_profile_id_fkey(...)` — FK join syntax
- Isso viola a constraint `edge-functions-pattern-sequential-queries` (evitar FK joins no Deno para prevenir schema cache issues)
- **Ação**: Refatorar para queries sequenciais independentes (buscar relationship, depois business_profile separadamente)

### 5. Backend — Cancelamento

#### 5.1 Aula não paga (Pontas #5.1, #19)
- `process-cancellation` deve buscar `is_paid_class` na query da aula (linha 45: adicionar `is_paid_class` ao select)
- Quando `is_paid_class = false`: forçar `shouldCharge = false`

#### 5.2 Aula pré-paga (Pontas #5.2, #19)
- `process-cancellation` deve buscar `charge_timing` do `business_profiles` do professor (query sequencial)
- Quando `charge_timing = 'prepaid'` E `is_paid_class = true`: forçar `shouldCharge = false`
- Mensagem: "Esta aula já foi cobrada antecipadamente. Eventuais ajustes devem ser combinados diretamente com o aluno."

#### 5.3 CancellationModal (Pontas #19, #20, #29)
- Query da aula (~linha 113) deve incluir `is_paid_class`
- Buscar `charge_timing` do `business_profiles` do professor
- Interface `VirtualClassData` (linhas 14-24) **não inclui `is_paid_class`** — adicionar campo opcional
- Lógica de `willBeCharged` (~linha 179):
  - Se `is_paid_class = false`: `willBeCharged = false` (igual a experimental)
  - Se `charge_timing = 'prepaid'` e `is_paid_class = true`: `willBeCharged = false` com mensagem distinta

#### 5.4 Guard clause no bloco de criação de fatura (M6)
- `process-cancellation` (linhas 375-473): o bloco que cria faturas de cancelamento está dentro de `if (shouldCharge)`
- Com as alterações em #5.1 e #5.2, `shouldCharge` já será `false` para aulas gratuitas e pré-pagas
- **Verificação**: a guard clause `if (shouldCharge)` na linha 375 é **suficiente** — não é necessário duplicar a validação dentro do bloco. Documentar essa invariante.

#### 5.5 Aula pós-paga
- Cancelamento com política de cobrança (já funciona)
- Anistia disponível via AmnestyButton com nova validação

### 6. Frontend — AmnestyButton.tsx

#### 6.1 Verificação de faturamento (Pontas #6.1, #28)
- Antes de exibir o botão, consultar `invoice_classes WHERE class_id = :classId`
- **Não faturada**: mostrar botão de anistia
- **Já faturada**: mostrar label "Não é possível conceder anistia. Esta aula já foi incluída em uma fatura."
- **Aula pré-paga cancelada**: NÃO mostrar botão (precisa de `is_paid_class` e `charge_timing`)
- **Invariante**: Faturas `invoice_type = 'cancellation'` nunca devem existir para aulas prepaid (garantido pelo `shouldCharge = false` no `process-cancellation`)

### 7. Backend — automated-billing + materialize-virtual-class

#### 7.1 Filtrar aulas gratuitas (Ponta #7.1)
- RPC `get_unbilled_participants_v2`: adicionar `AND c.is_paid_class = true` ao lado de `AND c.is_experimental = false`

#### 7.2 Propagar is_paid_class na materialização (Pontas #8.1, #17, #27)
- Edge function `materialize-virtual-class` (~linha 252): adicionar `is_paid_class: template.is_paid_class`
  - **Nota**: A query do template já usa `select('*')` (linha 88), portanto `template.is_paid_class` já está disponível no resultado. Não é necessário alterar a query, apenas o objeto de inserção.
- Frontend `materializeVirtualClass` (Agenda.tsx, ~linha 1288): adicionar `is_paid_class` ao `realClassData`
  - **Nota**: O `virtualClass` no frontend pode não ter `is_paid_class` se foi construído antes da migração. Usar fallback: `is_paid_class: virtualClass.is_paid_class ?? true`

#### 7.3 Decisão sobre automated-billing e charge_timing (Ponta #26, M5)
- O `automated-billing` processa **todos** os relacionamentos cujo `billing_day = today` (linha 90), independente do `charge_timing`
- Com a cobrança híbrida, professores prepaid já terão suas aulas faturadas no agendamento. No ciclo automatizado, essas aulas já estarão em `invoice_classes` e serão filtradas naturalmente pela RPC (`ic.id IS NULL`)
- **Decisão**: O `automated-billing` continua processando todos os professores. A proteção contra duplicação é garantida pela RPC + `invoice_classes`. Isso é mais seguro que filtrar por `charge_timing`, pois:
  - Professores podem mudar de timing entre ciclos
  - Mensalidades são processadas independente do timing
  - A RPC já é a fonte única de verdade para aulas não faturadas
- **Ação na Fase 5**: O `automated-billing` deve buscar `charge_timing` do `business_profiles` (atualmente `select('id, business_name')` na linha 133) para **logging** e métricas, mas não para filtrar

#### 7.4 Teste de regressão (M3)
- Após alterar a RPC, executar `automated-billing` para professor existente
- Verificar que nenhuma aula existente (todas com `is_paid_class = true` por default) é perdida

### 8. Frontend — InvoiceTypeBadge + i18n

#### 8.1 Consolidar InvoiceTypeBadge (Ponta #21)
- `InvoiceTypeBadge.tsx` (componente compartilhado) suporta apenas 3 tipos: `monthly_subscription`, `automated`, `manual`
- `Financeiro.tsx` (inline `getInvoiceTypeBadge`, linhas 30-44) já suporta 5 tipos: inclui `cancellation` e `orphan_charges`
- **Decisão**: migrar `Financeiro.tsx` para usar `InvoiceTypeBadge` como fonte única de verdade
- Adicionar ao `InvoiceTypeBadge`: `prepaid_class`, `cancellation`, `orphan_charges`

#### 8.2 Type safety do handleClassSubmit (M7)
- `Agenda.tsx` linha 1392: `handleClassSubmit` tipifica parâmetro como `any`
- Quando `is_paid_class` for adicionado ao `ClassFormData`, a tipagem `any` ocultará erros
- **Ação**: Alterar `(formData: any)` para `(formData: ClassFormData)` e importar a interface do ClassForm

#### 8.3 Chaves i18n necessárias (Ponta #10.1)
**billing.json (PT e EN)**:
- `billing.chargeTiming.title` — "Modelo de Cobrança" / "Billing Model"
- `billing.chargeTiming.prepaid` — "Cobrar Antes" / "Charge Before"
- `billing.chargeTiming.postpaid` — "Cobrar Depois" / "Charge After"
- `billing.chargeTiming.prepaidDescription` — ver M4
- `billing.chargeTiming.postpaidDescription` — ver M4
- `billing.chargeTiming.infoCard` — ver M4

**classes.json (PT e EN)**:
- `classes.isPaidClass` — "Aula Cobrada" / "Paid Class"
- `classes.isPaidClassDescription` — "Esta aula será cobrada do aluno" / "This class will be charged to the student"
- `classes.recurrenceBlockedPrepaid` — "Recorrência não disponível para aulas pagas no modelo pré-pago" / "Recurrence not available for paid classes in prepaid model"

**cancellation.json (PT e EN)**:
- `cancellation.prepaidWarning` — "Esta aula já foi cobrada antecipadamente..." / "This class was already charged in advance..."

**amnesty (common.json ou novo namespace)**:
- `amnesty.alreadyInvoiced` — "Não é possível conceder anistia. Esta aula já foi incluída em uma fatura." / "Cannot grant amnesty. This class was already included in an invoice."

**financial.json (PT e EN)**:
- `financial.invoiceTypes.prepaidClass` — "Pré-paga" / "Prepaid"
- `financial.invoiceTypes.cancellation` — "Cancelamento" / "Cancellation"
- `financial.invoiceTypes.orphanCharges` — "Cobranças Pendentes" / "Pending Charges"

---

## Conteúdo do Card Informativo (M4)

**Pré-pago**:
> "A fatura é gerada imediatamente ao agendar a aula. Aulas pagas não podem ser recorrentes. Em caso de cancelamento, não há reembolso automático."

**Pós-pago**:
> "As aulas são acumuladas e cobradas no dia de fechamento do ciclo. Aulas podem ser recorrentes. Em caso de cancelamento tardio, uma taxa pode ser aplicada conforme sua política."

---

## Fases de Implementação (reordenadas — M2)

| Fase | Descrição | Pontas Soltas | Status |
|------|-----------|---------------|--------|
| 1 | Migração SQL: `charge_timing` + `is_paid_class` | — | ✅ Concluída |
| 2 | Settings/BillingSettings: card charge_timing + card informativo | #3.2, #22, M4 | Pendente |
| 3 | ClassForm: campo `is_paid_class` + bloqueio recorrência | #2.3, M1, M8 | Pendente |
| 4 | automated-billing RPC + materialize (filtro `is_paid_class`) | #7.1, #8.1, #17, #27, #35, M3 | Pendente |
| 5 | Agenda.tsx: persistir `is_paid_class` + gerar fatura pré-paga | #2.4, #17, #18, #4.3, #23, #24, #25, #26, #31, #33, M5, M7, M9 | Pendente |
| 6 | Cancelamento: process-cancellation + CancellationModal | #5.1, #5.2, #19, #20, #28, #29, #30, M6 | Pendente |
| 7 | AmnestyButton: verificação de faturamento + label | #6.1, #28 | Pendente |
| 8 | InvoiceTypeBadge consolidação + i18n + testes + notificações | #9.1, #21, #10.1, #16, #32, #34, M10 | Pendente |

---

## Novas Pontas Soltas v4.4 (#30-#35)

### 30. process-cancellation — hard-coded minimum `chargeAmount >= 5` (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linha 434)

O `process-cancellation` possui seu próprio hard-coded minimum de R$ 5,00 para criação de faturas de cancelamento, independente do `create-invoice`. Com o modelo híbrido e PIX habilitado (mínimo R$ 1,00), multas de cancelamento entre R$ 1,00 e R$ 4,99 serão silenciosamente ignoradas.

**Ação**: Alinhar com a solução da ponta #24 — verificar `enabled_payment_methods` antes de rejeitar. Se PIX estiver habilitado, o mínimo deve ser R$ 1,00. Se apenas cartão, sem mínimo.

### 31. automated-billing — hard-coded `payment_method: 'boleto'` (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linha 527)

O `automated-billing` sempre gera pagamento com `payment_method: 'boleto'`, ignorando a configuração `enabled_payment_methods` do `business_profiles` do professor. Se o professor desabilitou boleto e habilitou apenas PIX, o sistema tentará gerar boleto e falhará silenciosamente.

**Ação**: Antes de gerar o payment intent, buscar `enabled_payment_methods` do `business_profiles` e aplicar a mesma hierarquia do `create-invoice`: Boleto (se habilitado e >= R$5) → PIX (se habilitado e >= R$1) → Nenhum.

### 32. send-invoice-notification — sem tratamento para `prepaid_class` (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 223-287)

A função de notificação por email trata `monthly_subscription` e faturas genéricas, mas **não tem caso específico para `invoice_type = 'prepaid_class'`**. Faturas pré-pagas precisam de:
- Subject diferenciado: "💳 Fatura da sua aula com [Professor]"
- CTA apontando para `stripe_hosted_invoice_url` (não para `/faturas` genérico)
- Mensagem contextual: "A fatura da sua aula agendada para [data] foi gerada"

**Ação**: Adicionar case `prepaid_class` no switch de `notification_type` e na lógica de construção do CTA. Reutilizar `stripe_hosted_invoice_url` como link primário quando disponível (conforme memória `notificacoes-pre-pago-cta-logic`).

### 33. create-invoice — não dispara notificação por email (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts`

O `create-invoice` cria a fatura e gera o payment intent, mas **não chama `send-invoice-notification`**. No fluxo pós-pago, a notificação é disparada pelo `automated-billing` após criar a fatura atomicamente. No fluxo pré-pago (Agenda.tsx → create-invoice), o aluno **não recebe email** sobre a nova fatura.

**Ação**: Ao final do `create-invoice`, invocar `send-invoice-notification` com `notification_type: 'invoice_created'`. Isso garante que faturas manuais e pré-pagas também gerem notificação. Verificar se o `automated-billing` não duplica a notificação (ele chama separadamente).

### 34. Financeiro.tsx — cálculo de taxa Stripe hard-coded R$ 3,49 (Fase 8)

**Arquivo**: `src/pages/Financeiro.tsx` (linha 398)

O cálculo `stripeFees = paidInvoices.length * 3.49` assume que todas as faturas pagas usaram boleto (R$ 3,49 por transação). Com a introdução de PIX (taxa de ~1,19%) e faturas pré-pagas, o cálculo e o alerta de transparência (linhas 422-449) ficam imprecisos.

**Ação**: Na Fase 8 (ou posterior), substituir o cálculo fixo por um baseado no `payment_method` real de cada fatura. Alternativamente, exibir aviso genérico sobre taxas variáveis em vez de valor fixo. Esta é uma melhoria de UX, não um bloqueador funcional.

### 35. automated-billing — FK join syntax nas queries de relacionamento (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 70-89)

A query principal usa FK join syntax: `teacher:profiles!teacher_id(...)` e `student:profiles!student_id(...)`. Isso viola a constraint `edge-functions-pattern-sequential-queries` e pode causar falhas intermitentes por schema cache issues no Deno.

**Ação**: Refatorar para queries sequenciais: primeiro buscar relationships, depois buscar perfis em batch com `.in('id', teacherIds)` e `.in('id', studentIds)`.

---

## Novas Melhorias v4.4 (M8-M10)

### M8. ClassWithParticipants interface deve incluir `is_paid_class` (Fase 3)

**Arquivo**: `src/pages/Agenda.tsx` (linhas 25-59)

A interface `ClassWithParticipants` não inclui `is_paid_class`. Embora o spread `...templateClass` em `generateVirtualInstances` propague campos extras, a tipagem explícita é necessária para:
- Exibir indicador visual no calendário (ícone de pagamento pendente/confirmado)
- Passar dado ao `CancellationModal` e ao `AmnestyButton`
- A RPC `get_classes_with_participants` precisará retornar `is_paid_class`

### M9. create-invoice deve chamar send-invoice-notification (Fase 5)

Relacionada à ponta #33. Ao adicionar a chamada, usar `fire-and-forget` (`.then()`) para não bloquear a resposta ao frontend. Verificar que o `automated-billing` não chame `send-invoice-notification` em duplicata — atualmente ele já chama separadamente após criar a fatura via RPC atômica.

### M10. Financeiro.tsx — taxa dinâmica por método de pagamento (Fase 8)

Relacionada à ponta #34. Opções de implementação:
1. **Simples**: Remover cálculo de taxa do frontend e exibir apenas receitas brutas/líquidas
2. **Preciso**: Buscar `payment_method` de cada fatura paga e calcular: Boleto = R$ 3,49, PIX = 1,19% do valor, Cartão = 3,49% + R$ 0,39
3. **Intermediário**: Manter alerta genérico sobre taxas variáveis sem valor específico

A opção 2 é a mais precisa mas requer alterar a query de faturas para incluir `payment_method`.

---

## Índice de Pontas Soltas

| # | Descrição | Fase | Arquivo(s) |
|---|-----------|------|------------|
| 2.3 | ClassFormData sem `is_paid_class` | 3 | ClassForm.tsx |
| 2.4 | Agenda.tsx handleClassSubmit sem `is_paid_class` no insert | 5 | Agenda.tsx |
| 3.2 | BillingSettings não lê `charge_timing` | 2 | Settings/BillingSettings.tsx |
| 4.3 | Grupo prepaid: 1 fatura por participante | 5 | Agenda.tsx |
| 5.1 | process-cancellation não busca `is_paid_class` | 6 | process-cancellation/index.ts |
| 5.2 | process-cancellation não busca `charge_timing` | 6 | process-cancellation/index.ts |
| 6.1 | AmnestyButton sem consulta a `invoice_classes` | 7 | AmnestyButton.tsx |
| 7.1 | RPC sem filtro `is_paid_class` | 4 | migration SQL |
| 8.1 | materialize-virtual-class não propaga `is_paid_class` | 4 | materialize-virtual-class/index.ts |
| 9.1 | InvoiceTypeBadge faltam 3 tipos | 8 | InvoiceTypeBadge.tsx |
| 10.1 | Chaves i18n faltantes | 8 | billing.json, classes.json, etc. |
| 16 | CHECK constraint em `invoices.invoice_type` | 8 | migration SQL |
| 17 | Frontend materializeVirtualClass sem `is_paid_class` | 4,5 | Agenda.tsx |
| 18 | handleClassSubmit sem lógica de fatura pré-paga | 5 | Agenda.tsx |
| 19 | CancellationModal não busca `is_paid_class` | 6 | CancellationModal.tsx |
| 20 | willBeCharged ignora `is_paid_class` e `charge_timing` | 6 | CancellationModal.tsx |
| 21 | InvoiceTypeBadge vs getInvoiceTypeBadge inconsistência | 8 | InvoiceTypeBadge.tsx, Financeiro.tsx |
| 22 | Dois BillingSettings — qual recebe charge_timing | 2 | Settings/BillingSettings.tsx |
| 23 | create-invoice aceita `prepaid_class` como invoice_type | 5 | create-invoice/index.ts |
| 24 | create-invoice rejeita valor < R$5 mesmo com PIX habilitado | 5 | create-invoice/index.ts |
| 25 | create-invoice usa FK join syntax (schema cache risk) | 5 | create-invoice/index.ts |
| 26 | automated-billing não filtra por charge_timing | 4 | automated-billing/index.ts |
| 27 | materialize template query já tem `is_paid_class` via `select('*')` | 4 | materialize-virtual-class/index.ts |
| 28 | AmnestyButton não valida invariante prepaid + cancellation | 7 | AmnestyButton.tsx |
| 29 | VirtualClassData interface sem `is_paid_class` | 6 | CancellationModal.tsx |
| 30 | process-cancellation hard-coded minimum R$5 ignora PIX | 6 | process-cancellation/index.ts |
| 31 | automated-billing hard-coded `payment_method: 'boleto'` | 5 | automated-billing/index.ts |
| 32 | send-invoice-notification sem tratamento para `prepaid_class` | 8 | send-invoice-notification/index.ts |
| 33 | create-invoice não dispara notificação por email | 5 | create-invoice/index.ts |
| 34 | Financeiro.tsx taxa Stripe hard-coded R$3,49 | 8 | Financeiro.tsx |
| 35 | automated-billing usa FK join syntax | 4 | automated-billing/index.ts |

## Índice de Melhorias

| # | Descrição | Fase |
|---|-----------|------|
| M1 | ClassForm busca `charge_timing` diretamente (sem props) | 3 |
| M2 | Reordenação de fases (RPC antes de prepaid) | — |
| M3 | Teste de regressão do automated-billing | 4 |
| M4 | Conteúdo do card informativo definido | 2 |
| M5 | automated-billing buscar `charge_timing` para logging | 5 |
| M6 | Guard clause suficiente no process-cancellation | 6 |
| M7 | Type safety: handleClassSubmit `any` → `ClassFormData` | 5 |
| M8 | ClassWithParticipants interface incluir `is_paid_class` | 3 |
| M9 | create-invoice chamar send-invoice-notification | 5 |
| M10 | Financeiro.tsx taxa dinâmica por método de pagamento | 8 |

---

## O que foi REMOVIDO do plano v3.10

1. Edge function `process-class-billing` (nunca existiu no código)
2. Lógica de Invoice Items + Invoice + Finalize no Stripe Connect para pré-pago
3. Lógica de void/cancel de faturas Stripe no cancelamento
4. Lógica de reembolso (pending_refunds para pré-pago)
5. Complexidade de materialização com billing no frontend
6. ~60% dos 228 gaps originais
7. Fase 0 com referência inválida a "Gaps 82-115"

## Histórico de Versões

| Versão | Data | Mudanças |
|--------|------|----------|
| v4.0 | 2026-02-12 | Simplificação radical: charge_timing + is_paid_class |
| v4.1 | 2026-02-13 | 16 pontas soltas identificadas e incorporadas |
| v4.2 | 2026-02-13 | +7 pontas soltas (#17-#23), +4 melhorias (M1-M4), reordenação de fases |
| v4.3 | 2026-02-13 | +6 pontas soltas (#24-#29), +3 melhorias (M5-M7), decisão sobre automated-billing + charge_timing, invariante prepaid+cancellation, índices consolidados |
| v4.4 | 2026-02-13 | +6 pontas soltas (#30-#35), +3 melhorias (M8-M10): notificações prepaid, payment_method dinâmico no automated-billing, taxa Stripe variável, FK joins no automated-billing |

## Memórias do Projeto a Atualizar

Após implementação, atualizar:
1. `constraints/concorrencia-faturamento-pre-post-pago` — referencia `process-class-billing`
2. `features/billing/arquitetura-implementacao-hibrida` — referencia `process-class-billing` como "roteador central"
3. `features/billing/prepaid-cancellation-refund-policy` — menciona "void automático no Stripe"
4. `payment/stripe-pix-configuration-logic` — menciona taxa fixa de R$3,49 por boleto (atualizar para taxas variáveis)
