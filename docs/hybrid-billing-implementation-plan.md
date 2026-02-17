# Plano de Cobrança Híbrida — v5.58 (Consolidado)

**Data**: 2026-02-17
**Status Fase 0 (Batch Crítico)**: 🔴 Pendente — 94 vulnerabilidades ativas
**Status Fase 1 (Migração SQL)**: ✅ Concluída

---

## Contexto

O plano anterior (v3.10, 228 gaps, ~2939 linhas) foi substituído por regras de negócio simplificadas na v4.0. Versões subsequentes adicionaram pontas soltas e melhorias incrementais. A v5.58 consolida todas as auditorias com 21 passagens completas. Totais finais: **451 pontas soltas** (10 implementadas, 18 duplicatas, 2 subsumidas, 12 confirmações = **421 únicas**, **409 pendentes**) e **52 melhorias**. Cobertura: 75 funções auditadas (100% cobertura, 21ª passagem — análise cruzada profunda: status mismatch sistêmico, destruição de dados de pagamento, webhook resilience, FK joins em funções core). A 21ª passagem revelou 18 novas pontas soltas (#434-#451): `webhook-stripe-connect` usa status em INGLÊS 'paid'/'overdue' em vez de Português 'paga'/'vencida' (#434 CATASTRÓFICO — pagamentos confirmados ficam INVISÍVEIS no dashboard), `cancel-payment-intent` idem (#435 CRÍTICO), `check-overdue-invoices` idem (#436 CRÍTICO), `webhook-stripe-connect` destrói dados de comprovante após pagamento (#437 CRÍTICO), `webhook-stripe-connect` HTTP 500 no catch block (#438 RESILIÊNCIA), FK joins proibidos em `create-payment-intent-connect` (#439), `automated-billing` (#440/#441), `create-invoice` (#442/#443), `.single()` em webhook/notification/cancellation (#444/#445/#446), persistSession ausente (#447/#448), guard clause ausente em payment_failed/uncollectible (#449), boleto_url→stripe_hosted_invoice_url CTA enganoso (#450), `automated-billing` sem idempotência de mensalidade (#451 CRÍTICO).

Principais mudanças na v5.17: Identificadas 3 funções completamente ausentes de ambas as listas (cobertura e fora de escopo) na v5.16, invalidando a claim de "100% cobertura". `create-business-profile` apresenta risco MÉDIO de criação de contas Stripe Connect órfãs por falta de verificação de duplicatas. Tabela de cobertura expandida para 47 funções. 27 funções fora de escopo. Contagem verificada: 47 + 27 + 1 (_shared) = 75 diretórios.

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
| **0** | **Batch Crítico: segurança, race conditions, reconciliação, status** | **#87, #155, #156, #158, #160, #169, #170, #175, #187, #195, #196** | 🔴 Pendente |
| 1 | Migração SQL: `charge_timing` + `is_paid_class` | — | ✅ Concluída |
| 2 | Settings/BillingSettings: card charge_timing + card informativo | #3.2, #22, M4, M37 | Pendente |
| 3 | ClassForm: campo `is_paid_class` + bloqueio recorrência + request-class | #2.3, #138, M1, M8 | Pendente |
| 4 | automated-billing RPC + materialize (filtro `is_paid_class`) | #7.1, #8.1, #17, #27, #35, #45, #52, #163, #172, #180, M3, M18 | Pendente |
| 5 | Agenda.tsx: persistir `is_paid_class` + gerar fatura pré-paga | #2.4, #17, #18, #4.3, #23, #24, #25, #31, #36, #38, #40, #42, #55, #162, #164, #165, #171, #176, #177, M5, M7, M9, M13, M35 | Pendente |
| 6 | Cancelamento: process-cancellation + CancellationModal | #5.1, #5.2, #19, #20, #28, #29, #30, #43, #80, #83, #84, #161, M6, M14, M33 | Pendente |
| 7 | AmnestyButton: verificação de faturamento + label | #6.1, #28, #37, #82, #100, M11 | Pendente |
| 8 | InvoiceTypeBadge consolidação + i18n + testes + notificações + bugs | #9.1, #16, #21, #10.1, #32, #34, #39, #46, #47, #48, #49, #50, #51, #53, #54, #56, #64, #68, #70, #71, #72, #73, #74, #75, #76, #77, #78, #79, #85, #86, #88, #89, #91, #139, #140, #141, #142, #143, #144, #145, #146, #147, #152, #157, #159, #167, #168, #173, #174, #178, #179, #181, #182, #183, #184, #185, #186, #188, #189, #190, #191, #192, #193, #194, #197, #198, #200, #201, #204, #205, #206, #207, #208, #210, #211, #212, #213, #214, #215, #217, #218, #219, #220, #221, #222, #223, #225, #227, #228, #229, #230, #232, #233, #235, #236, #239, #240, #241, #242, M10, M12, M15, M16, M17, M18, M19, M26, M27, M28, M29, M30, M31, M32, M34, M36, M37, M38 | Pendente |

**⚠️ NOTA CRÍTICA**: A **Fase 0** deve ser implementada ANTES de qualquer outra fase, pois contém vulnerabilidades de segurança ativas e race conditions que causam perda financeira.

---

## Fase 0 — Batch Crítico (86 itens)

Estes itens devem ser implementados ANTES de qualquer outra fase por conterem vulnerabilidades ativas.

### #87. webhook-stripe-connect — handlers `invoice.*` nunca encontram faturas internas (Reconciliação)
**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 306-310, 343-346, 380-386, 401-407, 425-430)
Os handlers `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.marked_uncollectible` e `invoice.voided` buscam faturas por `.eq('stripe_invoice_id', invoice.id)`. Porém, `create-invoice` e `automated-billing` nunca preenchem `stripe_invoice_id` nas faturas internas — apenas `stripe_payment_intent_id` é preenchido.
**Resultado**: Todos os eventos `invoice.*` do Stripe são silenciosamente ignorados para faturas internas, quebrando a reconciliação de pagamentos.
**Ação**: Adicionar fallback de busca por `stripe_payment_intent_id` quando a busca por `stripe_invoice_id` não retornar resultados. Usar `invoice.payment_intent` (disponível no objeto Invoice do Stripe) como chave de fallback.

### #155. check-overdue-invoices — guard clause no UPDATE (Race Condition)
**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linha 57)
O UPDATE para `status: 'overdue'` não filtra por `status = 'pendente'`, permitindo que uma fatura já paga seja revertida para 'overdue'.
**Ação**: Adicionar `.in('status', ['pendente'])` ao UPDATE.

### #156. auto-verify-pending-invoices — guard clause no UPDATE (Race Condition)
**Arquivo**: `supabase/functions/auto-verify-pending-invoices/index.ts`
Mesmo problema do #155 — UPDATE sem guard clause pode reverter status terminal.
**Ação**: Adicionar `.in('status', ['pendente', 'falha_pagamento'])` ao UPDATE.

### #158. verify-payment-status — guard clause no UPDATE (Race Condition)
**Arquivo**: `supabase/functions/verify-payment-status/index.ts`
Mesmo padrão — UPDATE de status sem filtrar estado atual.
**Ação**: Adicionar guard clause para não sobrescrever status 'paga' ou 'cancelada'.

### #160. webhook-stripe-connect — verificação payment_origin nos handlers de falha
**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`
Handlers de `payment_intent.payment_failed`, `invoice.payment_failed` e `invoice.marked_uncollectible` atualizam status para 'falha_pagamento' sem verificar se `payment_origin = 'manual'`. Confirmações manuais do professor podem ser invalidadas por eventos de falha do Stripe.
**Ação**: Antes de atualizar status para falha, verificar se `payment_origin !== 'manual'`.

### #169. webhook + cancel-payment-intent — status 'paid' vs 'paga' (5 locais)
**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`, `supabase/functions/cancel-payment-intent/index.ts`
5 ocorrências de `status: 'paid'` em vez do padrão `status: 'paga'`. Causa: faturas pagas ficam invisíveis no Financeiro.
**Ação**: Substituir todas as ocorrências de `'paid'` por `'paga'`.

### #170. change-payment-method — bypass de autorização
**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 81-86)
Dois `.eq('responsible_id', ...)` consecutivos se sobrescrevem, fazendo com que a query de dependentes seja ineficaz. Qualquer guardião pode alterar métodos de pagamento de faturas alheias.
**Ação**: Corrigir a lógica de verificação de parentesco para usar uma query que realmente valide a relação entre o guardião e o aluno da fatura.

### #175. create-payment-intent-connect — SEM autenticação
**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts`
A função usa `SUPABASE_SERVICE_ROLE_KEY` e não valida a identidade do caller. Qualquer pessoa com o `invoice_id` pode gerar pagamentos.
**Ação**: Adicionar autenticação via `auth.getUser(token)` e validar que o caller é o aluno da fatura, seu responsável, ou o professor.

### #187. check-overdue-invoices — sem guard de status terminal (Sobrescrita de Dados)
**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59)
O UPDATE para `status: 'overdue'` (linha 58) não verifica se a fatura já foi paga manualmente (`payment_origin: 'manual'`). Complementa #155 com um vetor de ataque concreto: faturas pagas pelo professor são revertidas automaticamente pelo cron job.
**Ação**: Adicionar `.not('payment_origin', 'eq', 'manual').not('status', 'in', '("paga","cancelada")')` ao UPDATE. Também alinhar status com #169 (`vencida` em vez de `overdue`).

### #195. verify-payment-status — sem autenticação/autorização (Segurança)
**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 15-123)
A função não possui NENHUMA verificação de autenticação. Qualquer requisição pode consultar e forçar atualização de status de qualquer fatura, expondo dados financeiros. Também usa `.single()` (linha 40) e não possui guard de status terminal.
**Ação**: Adicionar `auth.getUser(token)`. Verificar que o caller é `teacher_id` ou `student_id` da fatura. Trocar `.single()` por `.maybeSingle()`. Adicionar guard contra sobrescrita de status terminal.

### #196. change-payment-method — autorização de guardian SEMPRE falsa por sobreposição de `.eq()` (Bug Funcional)
**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 83-86)
Dois `.eq('responsible_id', ...)` consecutivos na mesma coluna — PostgREST aplica apenas o último. A verificação de guardian é **sempre falsa**, impedindo responsáveis financeiros de alterar métodos de pagamento de faturas de seus dependentes. Complementa #170 com evidência concreta do bug de sobreposição documentado em memória `constraints/sobreposicao-filtros-query-supabase`.
**Ação**: Refatorar para verificação independente: buscar se o `invoice.student_id` possui dependentes cujo `responsible_id === user.id`, usando query separada ou `.or()`.

### #199. cancel-payment-intent — status 'paid' em inglês em vez de 'paga' (Corrupção de Dados)
**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 111 e 172)
A função marca faturas como `status: 'paid'` (inglês) em vez de `'paga'` (português). Isso significa que TODAS as confirmações manuais de pagamento ficam invisíveis no Financeiro, dashboard e cron jobs que filtram por `'paga'`. Complementa #169 com locais adicionais confirmados.
**Ação**: Substituir `'paid'` por `'paga'` nas linhas 111 e 172.

### #202. process-payment-failure-downgrade — parâmetros errados na chamada a smart-delete-student (Bug Funcional)
**Arquivo**: `supabase/functions/process-payment-failure-downgrade/index.ts` (linhas 144-152)
A função invoca `smart-delete-student` com `{ studentId, reason }` mas a função espera `{ student_id, teacher_id, relationship_id }`. Resultado: **nenhum aluno excedente é removido** quando há falha de pagamento no plano do professor. A validação de campos obrigatórios em `smart-delete-student` (linha 290) retorna HTTP 400.
**Ação**: Corrigir para `{ student_id: student.student_id, teacher_id: user.id, relationship_id: student.id, force: true }`.

### #203. webhook-stripe-connect — status em inglês 'paid' e 'overdue' (Corrupção de Dados)
**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 320, 359, 404, 469)
Múltiplos handlers usam status em inglês: `'paid'` (linhas 320, 359, 469) e `'overdue'` (linha 404) em vez de `'paga'` e `'vencida'`. Estes são os handlers PRIMÁRIOS para confirmações de pagamento do Stripe Connect. Todo pagamento confirmado via webhook fica invisível no dashboard financeiro.
**Ação**: Substituir `'paid'` por `'paga'` e `'overdue'` por `'vencida'` em todos os handlers.

### #209. check-overdue-invoices — status 'overdue' em inglês em vez de 'vencida' (Corrupção de Dados)
**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linha 58)
O cron job de verificação de faturas vencidas marca faturas como `status: "overdue"` (inglês) em vez de `"vencida"` (português). TODAS as faturas vencidas ficam com status incorreto, invisíveis nos filtros do Financeiro e não processadas por outros cron jobs que buscam `'vencida'`. Complementa #169, #199 e #203 como quarta fonte de corrupção de status.
**Ação**: Substituir `"overdue"` por `"vencida"` na linha 58.
## Itens Implementados (10 total)

| # | Descrição | Versão |
|---|-----------|--------|
| #132 | create-student: autenticação adicionada | v5.14 |
| #133 | update-student-details: autenticação adicionada | v5.14 |
| #134 | create-dependent: FK join → queries sequenciais | v5.14 |
| #135 | delete-dependent: FK joins → queries sequenciais | v5.14 |
| #136 | manage-class-exception: FK join → query sequencial | v5.14 |
| #137 | manage-future-class-exceptions: FK join → query sequencial | v5.14 |
| #148 | generate-boleto-for-invoice: `.single()` → `.maybeSingle()` | v5.24 |
| #149 | process-orphan-cancellation-charges: `.single()` → `.maybeSingle()` (2 lookups) | v5.24 |
| #150 | process-orphan-cancellation-charges: filtro `is_paid_class` adicionado | v5.24 |
| #151 | generate-boleto-for-invoice: guard clause de status adicionada | v5.24 |

---

## Descrições das Pontas Soltas v5.18-v5.23 (#152-#180)

Os itens abaixo foram identificados nas auditorias v5.18 a v5.23 e estão atribuídos a fases no índice acima. Agrupados por padrão:

### FK Joins (Fase 4/5/8)

- **#163**: `automated-billing` query principal usa FK joins `teacher:profiles!teacher_id` (refinamento de #58, na query de `billing_day`). Refatorar para queries sequenciais.
- **#164**: `create-invoice` FK join para `teacher_student_relationships` (refinamento de #57). Refatorar para query sequencial.
- **#165**: `create-invoice` FK joins aninhados para `classes` → `class_services` (refinamento de #38). Refatorar para 3 queries sequenciais.
- ~~**#171**~~: **DUPLICATA de #103** — `generate-boleto-for-invoice` FK joins para student/teacher profiles.
- **#172**: `automated-billing` FK join diagnóstico em old confirmed classes `classes!inner` (refinamento de #69). Refatorar para query sequencial.
- **#176**: `create-payment-intent-connect` FK joins triplos (student, teacher, business_profile). Refatorar para 3 queries sequenciais.
- **#179**: `change-payment-method` FK joins + `.single()` em invoice lookup (refinamento de #114). Refatorar para queries sequenciais + `.maybeSingle()`.
- **#180**: `automated-billing` FK joins na query principal (duplicata parcial de #163, mas em ponto diferente do código). Refatorar junto com #163.

### `.single()` para `.maybeSingle()` (Fase 5/6/8)

- **#152**: `process-orphan-cancellation-charges` — verificação de `orphanError` ocorre **após** a filtragem por `billedIds`, permitindo que o código processe dados inválidos se a query original falhou. Mover a verificação de erro para imediatamente após a query.
- **#157**: `verify-payment-status` usa `.single()` em lookup de fatura — pode falhar se a fatura não existir. Trocar por `.maybeSingle()`.
- **#159**: `send-invoice-notification` usa `.single()` em 3 lookups (fatura, aluno, professor) — refinamento de #53 e #73. Trocar por `.maybeSingle()` nos 3 locais.
- **#161**: `process-cancellation` usa `.single()` na linha 107 (lookup de dependente) — refinamento de #84. Trocar por `.maybeSingle()`.
- **#162**: `create-invoice` usa `.single()` nas linhas 154 e 382 (lookups de guardian e relationship) — refinamento de #78. Trocar por `.maybeSingle()`.
- **#167**: `handle-student-overage` usa `.single()` em lookup de perfil. Trocar por `.maybeSingle()`.
- **#168**: `send-cancellation-notification` usa `.single()` em 4 lookups (aula, professor, aluno, dependente). Trocar por `.maybeSingle()` nos 4 locais.
- **#173**: `webhook-stripe-connect` usa `.single()` em 3 handlers (invoice.paid, invoice.payment_succeeded, payment_intent.succeeded) — refinamento de #49 e #64. Trocar por `.maybeSingle()`.
- **#174**: `cancel-payment-intent` usa `.single()` em lookup de fatura. Trocar por `.maybeSingle()`.
- **#177**: `create-payment-intent-connect` usa `.single()` em cascata (invoice → student → teacher → business_profile). Subsume #153. Trocar por `.maybeSingle()` em todos os lookups.

### Semântico (Fase 8)

- ~~**#178**~~: **DUPLICATA de #41** — `check-overdue-invoices` usa coluna `class_id` em `class_notifications` para armazenar `invoice_id`, violando integridade referencial.

### Duplicatas Identificadas (v5.26 + v5.27)

| Duplicata | Original | Descrição |
|-----------|----------|-----------|
| #59 | #5.1 | process-cancellation sem `is_paid_class` (Fase 6 via #5.1) |
| #61 | #8.1 | materialize-virtual-class backend não propaga `is_paid_class` — mesma correção |
| #62 | #2.4 | handleClassSubmit sem `is_paid_class` no insert — mesma correção |
| #63 | #17 | materializeVirtualClass frontend sem `is_paid_class` — mesma correção |
| #65 | #7.1 | RPC sem filtro `is_paid_class` — mesma correção SQL |
| #66 | #2.3 | ClassFormData sem `is_paid_class` — mesma interface |
| #81 | #155 | check-overdue-invoices guard clause (Fase 0 via #155) |
| #92 | #60 | automated-billing hardcoded boleto (Fase 4 via #60) |
| #93 | #85 | automated-billing sem `payment_method` (Fase 8 via #85) |
| #95 | #155 | check-overdue-invoices race condition (Fase 0 via #155) |
| #96 | #80 | process-cancellation SERVICE_ROLE_KEY (Fase 6 via #80) |
| #104 | #169 | webhook status inglês — subsumido por #169 (Fase 0) |
| #107 | #5.1 | process-cancellation sem `is_paid_class` (Fase 6 via #5.1) |
| #108 | #67 | automated-billing tradicional sem notificação — mesmo bug |
| #166 | #80 | process-cancellation SERVICE_ROLE_KEY (Fase 6 via #80) |
| #171 | #103 | generate-boleto FK joins (já coberta por #103) |
| #178 | #41 | check-overdue `class_notifications` semântica (já coberta por #41) |

### Totais Atualizados (v5.28)

```text
Pontas Soltas Totais:       183
  Duplicatas anteriores:     10 (#59, #81, #92, #93, #95, #96, #107, #166, #171, #178)
  Novas duplicatas v5.27:     7 (#61, #62, #63, #65, #66, #104, #108)
  Nova duplicata v5.28:       1 (#98⊂#169)
  Total duplicatas:          18
  Subsumidas:                 2 (#153→#177, #154→#179)
  Únicas:                   163 (183 - 18 - 2)
  Implementadas:             10
  Pendentes:               153

Fase 0 (Crítico):            8 itens (inalterado)
```

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

### ~~33. create-invoice — não dispara notificação por email~~ ✅ RESOLVIDO

**Status**: Já implementado no código. O `create-invoice` (linhas 531-548) já chama `send-invoice-notification` de forma não-bloqueante com `fire-and-forget` pattern. A ponta #33 e a melhoria M9 estão resolvidas.

~~**Arquivo**: `supabase/functions/create-invoice/index.ts`~~

~~O `create-invoice` cria a fatura e gera o payment intent, mas **não chama `send-invoice-notification`**.~~

**Verificação no código** (linhas 531-548): O `create-invoice` **já chama** `send-invoice-notification` de forma não-bloqueante com `fire-and-forget`. A notificação já é enviada tanto para faturas manuais quanto automáticas. Esta ponta e a melhoria M9 estão **resolvidas**.

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
| 31 | automated-billing hard-coded `payment_method: 'boleto'` (fluxo tradicional) | 5 | automated-billing/index.ts |
| 32 | send-invoice-notification sem tratamento para `prepaid_class` | 8 | send-invoice-notification/index.ts |
| ~~33~~ | ~~create-invoice não dispara notificação por email~~ | ~~5~~ | ~~✅ Já resolvido no código (linhas 531-548)~~ |
| 34 | Financeiro.tsx taxa Stripe hard-coded R$3,49 | 8 | Financeiro.tsx |
| 35 | automated-billing usa FK join syntax | 4 | automated-billing/index.ts |
| 36 | automated-billing monthly subscription hard-coded boleto (linha 854) | 5 | automated-billing/index.ts |
| 37 | AmnestyButton busca fatura por `class_id` — incompatível com pós-pago consolidado | 7 | AmnestyButton.tsx |
| 38 | create-invoice FK joins em class_participants query (linhas 233-238) | 5 | create-invoice/index.ts |
| 39 | send-invoice-notification label "Pagar com Cartão" para hosted URL genérica | 8 | send-invoice-notification/index.ts |
| 40 | automated-billing outside-cycle invoice hard-coded boleto (linha 969) | 5 | automated-billing/index.ts |
| 41 | check-overdue-invoices usa `class_notifications` para idempotência de faturas | 8 | check-overdue-invoices/index.ts |
| 42 | handleClassSubmit — rollback incompleto se fatura pré-paga falhar | 5 | Agenda.tsx |
| 43 | send-cancellation-notification não recebe `is_paid_class` / `charge_timing` | 6 | process-cancellation/index.ts |
| 44 | create-invoice — `due_date` fallback 15 dias não considera `payment_due_days` do professor | 5 | create-invoice/index.ts |
| 45 | get_classes_with_participants RPC não retorna `is_paid_class` | 4 | migration SQL / Agenda.tsx |
| 46 | Financeiro.tsx `getInvoiceTypeBadge` falta tipo `prepaid_class` | 8 | Financeiro.tsx |
| **47** | **check-overdue-invoices — sem INSERT de idempotência após enviar notificação** | **8** | **check-overdue-invoices/index.ts** |
| **48** | **automated-billing não salva `payment_method` na fatura** | **5** | **automated-billing/index.ts** |
| **49** | **webhook-stripe-connect usa `.single()` em 3 lookups (deveria ser `.maybeSingle()`)** | **8** | **webhook-stripe-connect/index.ts** |
| **50** | **CORS headers incompletos em 4 edge functions invocadas pelo frontend** | **8** | **create-invoice, process-cancellation, etc.** |
| **51** | **webhook `payment_intent.succeeded` não atualiza status de participantes para aulas prepaid** | **8** | **webhook-stripe-connect/index.ts** |
| **52** | **automated-billing `validateTeacherCanBill` usa FK join `subscription_plans!inner`** | **4** | **automated-billing/index.ts** |
| **53** | **send-invoice-notification usa `.single()` em lookup de fatura** | **8** | **send-invoice-notification/index.ts** |
| **54** | **send-invoice-notification SELECT não inclui `payment_method` — bloqueia M12** | **8** | **send-invoice-notification/index.ts** |
| **55** | **materializeVirtualClass frontend: group participants sem `dependent_id`** | **5** | **Agenda.tsx** |
| **56** | **check-overdue-invoices atualiza status antes de confirmar envio de notificação** | **8** | **check-overdue-invoices/index.ts** |
| 57 | create-invoice FK join `business_profiles!...` | 4 | create-invoice/index.ts |
| 58 | automated-billing FK joins `teacher:profiles!teacher_id` e `student:profiles!student_id` | 4 | automated-billing/index.ts |
| ~~59~~ | ~~DUPLICATA de #5.1 — process-cancellation não busca `is_paid_class` nem `charge_timing`~~ | **—** | **—** |
| 60 | automated-billing hardcoded `payment_method: 'boleto'` | 4 | automated-billing/index.ts |
| ~~61~~ | ~~DUPLICATA de #8.1 — materialize-virtual-class backend não propaga `is_paid_class`~~ | **—** | **—** |
| ~~62~~ | ~~DUPLICATA de #2.4 — handleClassSubmit não inclui `is_paid_class` no insert~~ | **—** | **—** |
| ~~63~~ | ~~DUPLICATA de #17 — materializeVirtualClass frontend não inclui `is_paid_class`~~ | **—** | **—** |
| 64 | webhook `payment_intent.succeeded` usa `.single()` em lookup | 8 | webhook-stripe-connect/index.ts |
| ~~65~~ | ~~DUPLICATA de #7.1 — RPC `get_unbilled_participants_v2` não filtra `is_paid_class`~~ | **—** | **—** |
| ~~66~~ | ~~DUPLICATA de #2.3 — ClassFormData interface sem `is_paid_class`~~ | **—** | **—** |
| 67 | automated-billing tradicional não envia notificação | 4 | automated-billing/index.ts |
| **68** | **processMonthlySubscriptionBilling não processa cancelamentos com cobrança** | **4** | **automated-billing/index.ts** |
| **69** | **automated-billing old confirmed classes check usa FK join `classes!inner`** | **4** | **automated-billing/index.ts** |
| **70** | **materialize-virtual-class SDK version inconsistente (v2.57.4 vs v2.45.0)** | **8** | **materialize-virtual-class/index.ts** |
| **71** | **check-overdue-invoices bug #47 confirmado — falta INSERT de tracking** | **8** | **check-overdue-invoices/index.ts** |
| **72** | **create-invoice catch block retorna HTTP 500 em vez de 200+success:false** | **5** | **create-invoice/index.ts** |
| **73** | **send-invoice-notification usa `.single()` em lookup de aluno e professor** | **8** | **send-invoice-notification/index.ts** |
| **74** | **webhook-stripe-connect `invoice.paid` e `invoice.payment_succeeded` dupla atualização sobrescreve `payment_method`** | **8** | **webhook-stripe-connect/index.ts** |
| **75** | **automated-billing `skipBoletoGeneration` não tenta PIX como fallback** | **5** | **automated-billing/index.ts** |
| **76** | **automated-billing catch geral retorna HTTP 500** | **8** | **automated-billing/index.ts** |
| **77** | **webhook-stripe-connect retorna HTTP 500 para falhas de update não-críticas** | **8** | **webhook-stripe-connect/index.ts** |
| **78** | **create-invoice guardian lookup usa `.single()` em query não garantida** | **5** | **create-invoice/index.ts** |
| **79** | **processMonthlySubscriptionBilling `outsideCycleInvoiceId` não logado pelo caller** | **4** | **automated-billing/index.ts** |
| **80** | **process-cancellation usa SERVICE_ROLE_KEY como Bearer token para create-invoice — viola constraint** | **6** | **process-cancellation/index.ts** |
| ~~**81**~~ | ~~**DUPLICATA de #155 — check-overdue-invoices guard clause (mesmo bug)**~~ | **—** | **—** |
| **82** | **AmnestyButton não verifica `is_paid_class` — permite anistia em aulas pré-pagas** | **7** | **AmnestyButton.tsx** |
| **83** | **process-cancellation catch geral retorna HTTP 500 — viola constraint** | **6** | **process-cancellation/index.ts** |
| **84** | **process-cancellation usa `.single()` para buscar dependente — pode falhar** | **6** | **process-cancellation/index.ts** |
| **85** | **automated-billing não salva `payment_method` nos 3 updates de pagamento** | **8** | **automated-billing/index.ts** |
| **86** | **webhook-stripe-connect `payment_intent.succeeded` apaga dados de boleto/PIX da fatura paga** | **8** | **webhook-stripe-connect/index.ts** |
| **87** | **webhook-stripe-connect handlers `invoice.*` nunca encontram faturas internas (busca por `stripe_invoice_id` inexistente)** | **0** | **webhook-stripe-connect/index.ts** |
| **88** | **automated-billing mensalidade sem filtro de datas na RPC — performance** | **4** | **automated-billing/index.ts** |
| **89** | **create-invoice não verifica `charges_enabled` do Stripe Connect antes de gerar pagamento** | **5** | **create-invoice/index.ts** |
| **90** | **Documentação: decisão sobre cobrança de mensalidade sem aulas não documentada** | **—** | **Documentação** |
| **91** | **send-invoice-notification label "Pagar com Cartão" quando link é de boleto** | **8** | **send-invoice-notification/index.ts** |
| ~~**92**~~ | ~~**DUPLICATA de #60 — automated-billing hardcoded `payment_method: 'boleto'`**~~ | **—** | **—** |
| ~~**93**~~ | ~~**DUPLICATA de #85 — automated-billing não salva `payment_method`**~~ | **—** | **—** |
| ~~**107**~~ | ~~**DUPLICATA de #5.1 — process-cancellation não verifica `is_paid_class`**~~ | **—** | **—** |
| ~~**108**~~ | ~~**DUPLICATA de #67 — automated-billing tradicional sem notificação**~~ | **—** | **—** |
| **94** | **automated-billing mensalidade não gera pagamento via Stripe** | **4** | **automated-billing/index.ts** |
| ~~**95**~~ | ~~**DUPLICATA de #155 — check-overdue-invoices race condition**~~ | **—** | **—** |
| ~~**96**~~ | ~~**DUPLICATA de #80 — process-cancellation SERVICE_ROLE_KEY**~~ | **—** | **—** |
| **97** | **Clientes Stripe duplicados: platform vs connected account** | **6** | **create-payment-intent-connect/index.ts** |
| ~~**98**~~ | ~~**DUPLICATA / Subsumido por #169 — cancel-payment-intent status 'paid' em inglês**~~ | **—** | **—** |
| **99** | **send-invoice-notification armazena invoice.id em class_notifications.class_id** | **8** | **send-invoice-notification/index.ts** |
| **100** | **AmnestyButton cancela faturas de todos participantes em grupo** | **7** | **AmnestyButton.tsx** |
| **101** | **Financeiro.tsx taxas Stripe valor fixo para todos métodos** | **8** | **Financeiro.tsx** |
| **102** | **verify-payment-status e auto-verify sem autenticação** | **8** | **verify-payment-status, auto-verify/index.ts** |
| **103** | **generate-boleto-for-invoice FK joins** | **5** | **generate-boleto-for-invoice/index.ts** |
| ~~**104**~~ | ~~**Subsumido por #169 — webhook status inglês**~~ | **—** | **—** |
| **105** | **process-orphan-cancellation-charges assinatura RPC** | **8** | **process-orphan-cancellation-charges/index.ts** |
| **106** | **process-orphan-cancellation-charges FK joins** | **8** | **process-orphan-cancellation-charges/index.ts** |
| **109** | **process-payment-failure-downgrade chama smart-delete-student com parâmetros incorretos** | **8** | **process-payment-failure-downgrade/index.ts** |
| **110** | **handle-teacher-subscription-cancellation RESEND_API_KEY inexistente** | **8** | **handle-teacher-subscription-cancellation/index.ts** |
| **111** | **process-expired-subscriptions FK joins** | **8** | **process-expired-subscriptions/index.ts** |
| **112** | **handle-teacher-subscription-cancellation não cancela Payment Intents** | **8** | **handle-teacher-subscription-cancellation/index.ts** |
| **113** | **check-pending-boletos FK join + fallback "Premium" hardcoded** | **8** | **check-pending-boletos/index.ts** |
| **114** | **change-payment-method FK joins** | **8** | **change-payment-method/index.ts** |
| **115** | **change-payment-method autorização guardian/responsible quebrada** | **8** | **change-payment-method/index.ts** |
| **116** | **check-subscription-status FK join em checkNeedsStudentSelection** | **8** | **check-subscription-status/index.ts** |
| **117** | **create-subscription-checkout não cancela Payment Intents** | **8** | **create-subscription-checkout/index.ts** |
| **118** | **validate-business-profile-deletion sem autenticação** | **8** | **validate-business-profile-deletion/index.ts** |
| **119** | **create-payment-intent-connect 3 FK joins simultâneos** | **5** | **create-payment-intent-connect/index.ts** |
| **120** | **send-class-reminders FK joins** | **8** | **send-class-reminders/index.ts** |
| **121** | **generate-boleto-for-invoice FK joins + sem autenticação** | **8** | **generate-boleto-for-invoice/index.ts** |
| **122** | **cancel-payment-intent não verifica status PI antes de cancelar** | **8** | **cancel-payment-intent/index.ts** |
| **123** | **process-orphan-cancellation-charges FK joins em class_participants** | **8** | **process-orphan-cancellation-charges/index.ts** |
| **124** | **automated-billing copia boleto_url para stripe_hosted_invoice_url (3 locais)** | **8** | **automated-billing/index.ts** |
| **125** | **create-payment-intent-connect guardian_name inexistente em profiles** | **8** | **create-payment-intent-connect/index.ts** |
| **126** | **check-overdue-invoices status 'overdue' em inglês** | **8** | **check-overdue-invoices/index.ts** |
| **127** | **smart-delete-student FK joins** | **8** | **smart-delete-student/index.ts** |
| **128** | **smart-delete-student sem autenticação** | **8** | **smart-delete-student/index.ts** |
| **129** | **handle-plan-downgrade-selection audit_logs schema incorreto** | **8** | **handle-plan-downgrade-selection/index.ts** |
| **130** | **validate-payment-routing cria faturas reais no banco** | **8** | **validate-payment-routing/index.ts** |
| **131** | **cancel-subscription `.single()` em lookup de assinatura** | **8** | **cancel-subscription/index.ts** |
| **132** | **create-student: autenticação adicionada** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **133** | **update-student-details: autenticação adicionada** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **134** | **create-dependent: FK join → queries sequenciais** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **135** | **delete-dependent: FK joins → queries sequenciais** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **136** | **manage-class-exception: FK join → query sequencial** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **137** | **manage-future-class-exceptions: FK join → query sequencial** | **—** | **✅ IMPLEMENTADO (v5.14)** |
| **138** | **request-class não persiste `is_paid_class`** | **3** | **request-class/index.ts** |
| **139** | **update-dependent `.single()` após update** | **8** | **update-dependent/index.ts** |
| **140** | **create-connect-onboarding-link HTTP 500 genérico** | **8** | **create-connect-onboarding-link/index.ts** |
| **141** | **list-subscription-invoices HTTP 500 genérico** | **8** | **list-subscription-invoices/index.ts** |
| **142** | **check-business-profile-status ownership validation tardia** | **8** | **check-business-profile-status/index.ts** |
| **143** | **create-connect-account `.single()` incorreto** | **8** | **create-connect-account/index.ts** |
| **144** | **send-class-confirmation-notification `.single()` em 3 lookups** | **8** | **send-class-confirmation-notification/index.ts** |
| **145** | **check-stripe-account-status `.single()` + HTTP 500** | **8** | **check-stripe-account-status/index.ts** |
| **146** | **create-business-profile sem verificação de duplicatas** | **8** | **create-business-profile/index.ts** |
| **147** | **customer-portal busca por email frágil + HTTP 500** | **8** | **customer-portal/index.ts** |
| **148** | **generate-boleto-for-invoice: `.single()` trocado por `.maybeSingle()`** | **—** | **✅ IMPLEMENTADO (v5.24)** |
| **149** | **process-orphan-cancellation-charges: `.single()` em 2 lookups internos** | **—** | **✅ IMPLEMENTADO (v5.24)** |
| **150** | **process-orphan-cancellation-charges: filtro `is_paid_class` adicionado** | **—** | **✅ IMPLEMENTADO (v5.24)** |
| **151** | **generate-boleto-for-invoice: guard clause de status adicionada** | **—** | **✅ IMPLEMENTADO (v5.24)** |
| **152** | **process-orphan: verificação de erro após filtragem** | **8** | **process-orphan-cancellation-charges/index.ts** |
| **153** | **Subsumido por #177** | **—** | **—** |
| **154** | **Subsumido por #179** | **—** | **—** |
| **155** | **check-overdue-invoices: guard clause `status = 'pendente'` no UPDATE — race condition paid→overdue** | **0** | **check-overdue-invoices/index.ts** |
| **156** | **auto-verify-pending-invoices: guard clause no UPDATE — race condition** | **0** | **auto-verify-pending-invoices/index.ts** |
| **157** | **verify-payment-status: `.single()` em lookup** | **8** | **verify-payment-status/index.ts** |
| **158** | **verify-payment-status: guard clause no UPDATE — race condition** | **0** | **verify-payment-status/index.ts** |
| **159** | **send-invoice-notification: `.single()` em 3 lookups** | **8** | **send-invoice-notification/index.ts** |
| **160** | **webhook-stripe-connect: verificação `payment_origin` nos handlers de falha** | **0** | **webhook-stripe-connect/index.ts** |
| **161** | **process-cancellation: `.single()` na linha 107** | **6** | **process-cancellation/index.ts** |
| **162** | **create-invoice: `.single()` nas linhas 154, 382** | **5** | **create-invoice/index.ts** |
| **163** | **automated-billing: FK joins na query principal** | **4** | **automated-billing/index.ts** |
| **164** | **create-invoice: FK join para relationship** | **5** | **create-invoice/index.ts** |
| **165** | **create-invoice: FK joins aninhados para classes** | **5** | **create-invoice/index.ts** |
| ~~**166**~~ | ~~**DUPLICATA de #80 — process-cancellation SERVICE_ROLE_KEY como Bearer**~~ | **—** | **—** |
| **167** | **handle-student-overage: `.single()` em lookup** | **8** | **handle-student-overage/index.ts** |
| **168** | **send-cancellation-notification: `.single()` em 4 lookups** | **8** | **send-cancellation-notification/index.ts** |
| **169** | **webhook-stripe-connect + cancel-payment-intent: status 'paid' vs 'paga' em 5 locais** | **0** | **webhook-stripe-connect/index.ts, cancel-payment-intent/index.ts** |
| **170** | **change-payment-method: bypass de autorização — `.eq()` consecutivos se sobrescrevem** | **0** | **change-payment-method/index.ts** |
| ~~**171**~~ | ~~**DUPLICATA de #103 — generate-boleto-for-invoice: FK joins para student/teacher profiles**~~ | **—** | **—** |
| **172** | **automated-billing: FK join diagnóstico `classes!inner`** | **4** | **automated-billing/index.ts** |
| **173** | **webhook-stripe-connect: `.single()` em 3 handlers — causa retries do Stripe** | **8** | **webhook-stripe-connect/index.ts** |
| **174** | **cancel-payment-intent: `.single()` em lookup de fatura** | **8** | **cancel-payment-intent/index.ts** |
| **175** | **create-payment-intent-connect: SEM autenticação/autorização — qualquer pessoa pode gerar pagamentos** | **0** | **create-payment-intent-connect/index.ts** |
| **176** | **create-payment-intent-connect: FK joins triplos (student, teacher, business_profile)** | **5** | **create-payment-intent-connect/index.ts** |
| **177** | **create-payment-intent-connect: `.single()` em cascata** | **5** | **create-payment-intent-connect/index.ts** |
| ~~**178**~~ | ~~**DUPLICATA de #41 — check-overdue-invoices: usa `class_notifications` para faturas — violação semântica**~~ | **—** | **—** |
| **179** | **change-payment-method: FK joins + `.single()` em invoice lookup** | **8** | **change-payment-method/index.ts** |
| **180** | **automated-billing: FK joins na query principal (duplicata parcial de #163)** | **4** | **automated-billing/index.ts** |
| **181** | **end-recurrence: não deleta class_participants antes de classes — FK constraint bloqueia deleção** | **8** | **end-recurrence/index.ts** |
| **182** | **invoice.voided webhook handler sem guard clause no UPDATE — pode sobrescrever status terminal** | **8** | **webhook-stripe-connect/index.ts** |
| **183** | **process-cancellation e cancel-payment-intent: createClient sem `{ auth: { persistSession: false } }`** | **8** | **process-cancellation/index.ts, cancel-payment-intent/index.ts** |
| **184** | **webhook-stripe-connect: handler `payment_intent.payment_failed` ausente — falhas de boleto/PIX não processadas** | **8** | **webhook-stripe-connect/index.ts** |
| **185** | **webhook-stripe-connect: Stripe SDK v14.24.0 inconsistente com padrão v14.21.0** | **8** | **webhook-stripe-connect/index.ts** |
| **186** | **send-invoice-notification: `.single()` em lookup de monthly_subscriptions (linha 161)** | **8** | **send-invoice-notification/index.ts** |
| **187** | **check-overdue-invoices: sem guard de status terminal — pode sobrescrever `paga` para `overdue`** | **0** | **check-overdue-invoices/index.ts** |
| **188** | **cancel-payment-intent: marca `payment_origin: 'manual'` mesmo quando PI já `succeeded` no Stripe** | **8** | **cancel-payment-intent/index.ts** |
| **189** | **automated-billing: processMonthlySubscriptionBilling sem proteção contra fatura duplicada no mesmo ciclo** | **8** | **automated-billing/index.ts** |

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
| ~~M9~~ | ~~create-invoice chamar send-invoice-notification~~ | ~~5~~ | ~~✅ Já implementado~~ |
| M10 | Financeiro.tsx taxa dinâmica por método de pagamento | 8 |
| M11 | AmnestyButton refatorar para suportar faturas consolidadas | 7 |
| M12 | send-invoice-notification CTA baseado no `payment_method` real | 8 |
| M13 | create-invoice deve respeitar `payment_due_days` do perfil do professor | 5 |
| M14 | send-cancellation-notification deveria informar sobre modelo de cobrança | 6 |
| M15 | check-overdue-invoices deveria usar tabela própria de idempotência | 8 |
| **M16** | **automated-billing deve salvar `payment_method` na fatura ao criá-la** | **5** |
| **M17** | **webhook-stripe-connect: confirmar participantes de aulas prepaid ao receber pagamento** | **8** |
| **M18** | **automated-billing deve buscar `charge_timing` na query de business_profiles** | **4** |
| **M19** | **check-overdue-invoices deve diferenciar notificações por `invoice_type`** | **8** |
| **M26** | **processMonthlySubscriptionBilling deve buscar e processar cancelamentos com cobrança** | **4** |
| **M27** | **Extrair helper `generatePaymentForInvoice` unificado (resolve #31, #36, #40, #60)** | **4** |
| **M28** | **create-invoice deve validar `invoice_type` contra lista de tipos permitidos** | **5** |
| **M29** | **webhook-stripe-connect deve retornar HTTP 200 para falhas de update não-críticas** | **8** |
| **M30** | **processMonthlySubscriptionBilling caller deve logar `outsideCycleInvoiceId` explicitamente** | **4** |
| **M31** | **automated-billing `skipBoletoGeneration` deve verificar PIX antes de pular geração** | **5** |
| **M32** | **check-overdue-invoices catch geral retorna HTTP 500 — padronizar para 200+success:false** | **8** |
| **M33** | **send-cancellation-notification não busca nome do serviço — email incompleto** | **6** |
| **M34** | **Agenda.tsx handleClassSubmit — participantes de grupo sem `confirmed_at`** | **5** |
| **M35** | **Idempotência no create-invoice para faturas prepaid — verificação de duplicidade** | **5** |
| **M36** | **automated-billing tradicional não envia notificação para faturas com boleto abaixo do mínimo** | **4** |
| **M37** | **BillingSettings.tsx não busca nem exibe `charge_timing` — confirmação técnica da ponta #3.2** | **2** |
| **M38** | **create-invoice duplica `stripe_hosted_invoice_url` com `boleto_url` — raiz do bug #91/M22** | **5** |

---

## Novas Pontas Soltas v4.5 (#36-#40)

### 36. automated-billing — monthly subscription também hard-coded boleto (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 854-855)

A ponta #31 identificou o hard-code de `payment_method: 'boleto'` no fluxo tradicional (linha 527), mas o mesmo problema existe em mais dois locais:
- `processMonthlySubscriptionBilling` (linha 854): gera boleto para fatura de mensalidade
- Fatura de aulas fora do ciclo (linha 969): gera boleto para aulas avulsas pré-mensalidade

**Ação**: Aplicar a mesma correção da ponta #31 em todos os 3 pontos onde `payment_method: 'boleto'` é hard-coded. Extrair uma função helper `selectPaymentMethod(businessProfileId)` que busca `enabled_payment_methods` do `business_profiles` e aplica a hierarquia (Boleto → PIX → Nenhum).

### 37. AmnestyButton busca fatura por `class_id` — incompatível com faturamento pós-pago (Fase 7)

**Arquivo**: `src/components/AmnestyButton.tsx` (linhas 48-55)

**Bug crítico**: O `AmnestyButton` cancela faturas usando `.eq('class_id', classId).eq('invoice_type', 'cancellation')`. Isso funciona quando o `process-cancellation` cria uma fatura standalone do tipo `cancellation`. Porém, no fluxo **pós-pago** (automated-billing), cobranças de cancelamento são incluídas como itens (`item_type: 'cancellation_charge'`) dentro de uma fatura `automated` ou `monthly_subscription` via `invoice_classes`. Nesse cenário:

1. Não existe fatura com `invoice_type = 'cancellation'` e `class_id = X` — a query retorna 0 resultados
2. A anistia atualiza `classes.charge_applied = false` mas **não remove o item da fatura consolidada**
3. Se a anistia é concedida antes do ciclo de faturamento, a aula deveria ser excluída pelo `automated-billing` (via `charge_applied = false`), mas se concedida **depois** da fatura ser criada, o item já está incluído

**Ação** (ver M11): Refatorar `AmnestyButton` para:
1. Primeiro buscar em `invoices` com `class_id` e `invoice_type = 'cancellation'` (cenário standalone — já funciona)
2. Se não encontrar, buscar em `invoice_classes` com `class_id` e `item_type = 'cancellation_charge'`
3. Se encontrar item em fatura consolidada: exibir label "Não é possível conceder anistia — cobrança já incluída em fatura" (mesmo comportamento de #6.1)
4. Se não encontrar nenhum: anistia concedida normalmente (remove `charge_applied`, aula será excluída do próximo ciclo)

### 38. create-invoice — FK joins em class_participants query (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 226-241)

Além da FK join na ponta #25 (relationship query, linha 148), a query de `class_participants` (linha 228) também usa FK join syntax aninhada:
```
classes!inner (id, class_date, service_id, class_services (name, price))
```

Isso viola a constraint `edge-functions-pattern-sequential-queries` e pode causar falhas intermitentes no Deno.

**Ação**: Refatorar para 3 queries sequenciais: (1) buscar `class_participants`, (2) buscar `classes` pelos IDs, (3) buscar `class_services` pelos service_ids.

### 39. send-invoice-notification — label "Pagar com Cartão" para hosted URL genérica (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 291-295)

A seção de métodos de pagamento mostra `stripe_hosted_invoice_url` com o label fixo "Pagar com Cartão". No entanto, para faturas geradas via boleto ou PIX, o `stripe_hosted_invoice_url` aponta para a página Stripe hosted que pode conter qualquer método de pagamento. O label é confuso quando o aluno clica em "Pagar com Cartão" e vê um boleto.

A memória `notificacoes-pre-pago-cta-logic` define que o CTA principal para faturas pré-pagas deve ser `stripe_hosted_invoice_url` com label "Pagar Agora" ou "Escolher Método de Pagamento".

**Ação** (ver M12): Substituir o label "Pagar com Cartão" por lógica baseada no `payment_method` da fatura:
- Se `payment_method = 'boleto'`: "Ver Boleto"
- Se `payment_method = 'pix'`: "Ver PIX"
- Se `payment_method = 'card'` ou null: "Pagar com Cartão"
- Fallback genérico: "Escolher Método de Pagamento"

### 40. automated-billing outside-cycle invoice hard-coded boleto (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linha 969)

Relacionada a #36. A fatura de aulas fora do ciclo (traditional per-class billing dentro de `processMonthlySubscriptionBilling`) também usa `payment_method: 'boleto'` hard-coded. Mesma correção via helper `selectPaymentMethod`.

---

## Novas Melhorias v4.5 (M11-M12)

### M11. AmnestyButton refatorar para suportar faturas consolidadas (Fase 7)

Relacionada à ponta #37. O fluxo de anistia precisa distinguir entre dois cenários:

**Cenário A — Fatura standalone de cancelamento** (existente, funciona):
- Professor usa cobrança imediata no cancelamento (`process-cancellation` → `create-invoice`)
- `AmnestyButton` encontra fatura com `class_id` e `invoice_type = 'cancellation'`
- Cancela a fatura → funciona

**Cenário B — Cobrança de cancelamento em fatura consolidada** (não funciona):
- Aluno cancela aula tardiamente, mas professor usa pós-pago
- `charge_applied = true` no participant, mas nenhuma fatura standalone
- No ciclo de faturamento, o `automated-billing` inclui como `cancellation_charge` em fatura `automated`
- Se anistia for concedida **antes** do ciclo: basta `charge_applied = false` (aula será ignorada pelo billing)
- Se anistia for concedida **depois** do ciclo: item já está na fatura → não é possível reverter sem estornar

**Implementação**:
1. Buscar em `invoice_classes WHERE class_id = X AND item_type = 'cancellation_charge'`
2. Se encontrar: mostrar "Anistia não disponível — cobrança já incluída na fatura"
3. Se não encontrar: prosseguir com anistia normalmente (seta `charge_applied = false`)

### M12. send-invoice-notification CTA baseado no `payment_method` real (Fase 8)

Relacionada à ponta #39. O email de notificação deve usar labels de CTA que correspondam ao método de pagamento real da fatura. A query da fatura (linha 41-55) precisa incluir `payment_method` no select para que a lógica funcione. Opções de label:

| `payment_method` | Label do CTA | Link |
|---|---|---|
| `boleto` | "Ver Boleto" | `boleto_url` |
| `pix` | "Pagar via PIX" | QR code inline + copia/cola |
| `card` | "Pagar com Cartão" | `stripe_hosted_invoice_url` |
| null / `prepaid_class` | "Escolher Método" | `stripe_hosted_invoice_url` |

---

## Novas Pontas Soltas v4.6 (#41-#46)

### 41. check-overdue-invoices usa `class_notifications` para idempotência de faturas (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 47-52, 100-105)

**Bug semântico**: A função usa a tabela `class_notifications` para rastrear se uma notificação de fatura já foi enviada, usando `class_id = invoice.id` e `notification_type = 'invoice_overdue'`. Isso é semanticamente incorreto — `class_notifications.class_id` referencia aulas, não faturas. Funciona porque UUIDs não colidem na prática, mas:
1. Viola integridade referencial (FK aponta para `classes`, não `invoices`)
2. `class_notifications.student_id` é obrigatório no schema mas não é fornecido nessa query (usa `maybeSingle` para silenciar)
3. Se alguém adicionar FK validation, o sistema quebra

**Ação**: Para v4.6, documentar como tech debt. Na implementação futura (M15), criar uma tabela dedicada `invoice_notification_log` ou adicionar coluna nullable `invoice_id` a `class_notifications`.

### 42. handleClassSubmit — rollback incompleto se fatura pré-paga falhar (Fase 5)

**Arquivo**: `src/pages/Agenda.tsx` (~linha 1500)

O plano define que após `handleClassSubmit` criar a aula, deve chamar `create-invoice` para aulas pré-pagas. Porém, se a criação da fatura falhar:
- A aula já estará persistida no banco com participantes
- O toast destructive será exibido (conforme memória `ui-feedback-constraints`)
- Mas a aula fica "órfã" — agendada sem fatura

**Decisão**: Não fazer rollback da aula. A aula existe e é válida. O professor verá o toast de erro e pode gerar a fatura manualmente em `Financeiro.tsx`. O plano deve documentar esse comportamento como **intencional**, não como bug. Adicionar nota ao toast: "A aula foi agendada, mas a fatura não foi gerada. Crie a fatura manualmente."

### 43. send-cancellation-notification não recebe `is_paid_class` / `charge_timing` (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 352-369)

O `process-cancellation` chama `send-cancellation-notification` com payload que inclui `charge_applied`, `cancellation_reason`, `is_group_class` e `participants`, mas **não inclui `is_paid_class` nem `charge_timing`**. Com o modelo híbrido, o email de cancelamento deveria contextualizar:
- Aula gratuita: "Cancelamento sem impacto financeiro"
- Aula pré-paga: "Cancelamento registrado. O pagamento já realizado deve ser tratado diretamente com o professor."
- Aula pós-paga sem cobrança: "Cancelamento dentro do prazo, sem cobrança"
- Aula pós-paga com cobrança: "Cancelamento tardio, taxa aplicada" (já funciona)

**Ação**: Passar `is_paid_class` e `charge_timing` ao payload do `send-cancellation-notification`. Atualizar a edge function para contextualizar a mensagem. Ver M14.

### 44. create-invoice — `due_date` fallback 15 dias não consulta `payment_due_days` do professor (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 180)

O `create-invoice` usa fallback `Date.now() + 15 * 24 * 60 * 60 * 1000` quando `due_date` não é fornecido. Porém, o professor pode ter configurado `payment_due_days` diferente (ex: 7 ou 30 dias) em seu perfil. O `automated-billing` já respeita isso, mas chamadas diretas do frontend (faturas manuais e pré-pagas) usam o default hard-coded.

**Ação** (M13): Buscar `payment_due_days` do perfil do professor quando `due_date` não for fornecido. A query do perfil do professor já está disponível via `user.id`. Fallback: 15 dias se não encontrar.

### 45. get_classes_with_participants RPC não retorna `is_paid_class` (Fase 4)

**Arquivo**: RPC SQL + `src/pages/Agenda.tsx` (linha 341)

A Agenda.tsx usa `supabase.rpc('get_classes_with_participants', ...)` para carregar aulas. Se a RPC não inclui `is_paid_class` no resultado, o campo não estará disponível nas instâncias de `ClassWithParticipants`, tornando impossível:
- Exibir indicador visual no calendário
- Propagar `is_paid_class` para modais (CancellationModal, ClassForm em modo edição)
- Decidir se deve mostrar o AmnestyButton

**Ação**: Atualizar a RPC `get_classes_with_participants` para incluir `is_paid_class` no SELECT. Atualizar a interface `ClassWithParticipants` (M8). As instâncias virtuais herdam via spread (`...templateClass`), então funcionarão automaticamente.

### 46. Financeiro.tsx `getInvoiceTypeBadge` falta tipo `prepaid_class` (Fase 8)

**Arquivo**: `src/pages/Financeiro.tsx` (linhas 30-44)

O `getInvoiceTypeBadge` inline suporta `monthly_subscription`, `automated`, `manual`, `cancellation` e `orphan_charges` — mas **não suporta `prepaid_class`**. Faturas pré-pagas cairão no caso `default` e exibirão badge genérico "Regular", confundindo o professor.

**Ação**: Adicionar case `'prepaid_class'` com badge distinto (ex: `<Badge className="bg-emerald-100 text-emerald-800">Pré-paga</Badge>`). Alinhar com a consolidação do `InvoiceTypeBadge` (ponta #21). Adicionar chave i18n `financial.invoiceTypes.prepaidClass`.

---

## Novas Melhorias v4.6 (M13-M15)

### M13. create-invoice deve respeitar `payment_due_days` do perfil do professor (Fase 5)

Relacionada à ponta #44. Quando `due_date` não for fornecido, o `create-invoice` deve:
1. Buscar `payment_due_days` do perfil do professor (`profiles.payment_due_days`)
2. Calcular `due_date = Date.now() + payment_due_days * 24 * 60 * 60 * 1000`
3. Fallback: 15 dias se `payment_due_days` não estiver configurado

Isso garante consistência entre faturas automáticas (que já usam `payment_due_days`) e manuais/pré-pagas.

### M14. send-cancellation-notification deveria informar sobre modelo de cobrança (Fase 6)

Relacionada à ponta #43. O email de cancelamento deve contextualizar o impacto financeiro baseado no modelo de cobrança:
- Para aulas gratuitas (`is_paid_class = false`): mensagem neutra sem menção a cobrança
- Para aulas pré-pagas (`charge_timing = 'prepaid'`): informar que ajustes financeiros devem ser combinados diretamente
- Para aulas pós-pagas: manter comportamento atual (já funciona com `charge_applied`)

A edge function `send-cancellation-notification` precisa aceitar e processar `is_paid_class` e `charge_timing` no payload.

### M15. check-overdue-invoices deveria usar tabela própria de idempotência (Fase 8)

Relacionada à ponta #41. Três opções de implementação:
1. **Simples (recomendada)**: Adicionar coluna `last_overdue_notified_at` ou `overdue_notification_sent` na tabela `invoices` — elimina need de tabela secundária
2. **Normalizada**: Criar tabela `invoice_notification_log(invoice_id, notification_type, sent_at)`
3. **Manter (tech debt)**: Documentar o uso semântico incorreto de `class_notifications` e aceitar o risco

A opção 1 é a mais pragmática — uma coluna boolean `overdue_notification_sent` na tabela `invoices` resolve o problema sem adicionar complexidade.

---

## Novas Pontas Soltas v4.7 (#47-#51)

### 47. check-overdue-invoices — CRÍTICO: sem INSERT de idempotência após enviar notificação (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 43-76, 96-122)

**Bug crítico**: A função verifica em `class_notifications` se já enviou notificação (linhas 47-52), mas **nunca insere um registro** após enviar com sucesso (linha 62). Resultado: a cada execução do cron, o `SELECT` retorna vazio e a notificação é **reenviada infinitamente** para todas as faturas vencidas.

O mesmo bug existe para lembretes de pagamento (linhas 100-105): verifica existência mas nunca insere tracking.

Além do bug de idempotência descrito na ponta #41 (usar `class_notifications` para faturas), este bug é **operacional imediato** — os alunos recebem emails duplicados a cada execução do cron.

**Ação imediata**: Inserir em `class_notifications` (ou melhor, usar M15 com `overdue_notification_sent`) após enviar cada notificação. Se M15 não for implementado antes, pelo menos adicionar o INSERT:
```sql
INSERT INTO class_notifications (class_id, student_id, notification_type, status)
VALUES (invoice.id, invoice.student_id, 'invoice_overdue', 'sent');
```

### 48. automated-billing não salva `payment_method` na fatura ao criá-la (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 490-508)

O `automated-billing` cria faturas via RPC `create_invoice_and_mark_classes_billed` e depois gera o pagamento com `create-payment-intent-connect`. Porém, o `invoiceData` passado à RPC (linhas 490-497) **não inclui `payment_method`**. O campo só é populado indiretamente pelo webhook quando o pagamento é processado.

Isso significa que entre a criação da fatura e o pagamento, o campo `payment_method` é `null`. As notificações de email enviadas nesse intervalo (ponta #32, M12) não conseguem determinar o método de pagamento para exibir CTAs corretos.

Em contraste, o `create-invoice` (linha 439) **já define** `payment_method` corretamente.

**Ação** (M16): Após determinar o `payment_method` via helper `selectPaymentMethod` (ponta #31), salvar na fatura tanto via RPC quanto no update após gerar o payment intent. Mesma correção para os 3 pontos: traditional (linha 527), monthly (linha 854), outside-cycle (linha 969).

### 49. webhook-stripe-connect usa `.single()` em 3 lookups — viola constraint (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 307-310, 343-347, 453-457)

Três handlers (`invoice.paid`, `invoice.payment_succeeded`, `payment_intent.succeeded`) usam `.single()` para buscar `payment_origin` da fatura antes de processar. Se a fatura não existir no banco (evento orphaned ou processamento fora de ordem), o `.single()` lança exceção, interrompendo o webhook e retornando 500 ao Stripe.

Isso viola a constraint `supabase-single-query-errors` e pode causar retries infinitos do Stripe para eventos legítimos de faturas não rastreadas localmente.

**Ação**: Substituir `.single()` por `.maybeSingle()` nos 3 locais. Se `existingInvoice` for `null`, logar como warning e prosseguir normalmente (o update subsequente simplesmente não encontrará a fatura).

### 50. CORS headers incompletos em 4+ edge functions invocadas pelo frontend (Fase 8)

**Arquivos**: `create-invoice/index.ts` (linha 4-6), `process-cancellation/index.ts` (linha 4-6), `check-overdue-invoices/index.ts` (linha 4-6), `automated-billing/index.ts` (linha 4-6)

Os CORS headers destas funções são:
```javascript
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
```

Mas a memória `infrastructure/edge-functions-cors-headers` exige headers adicionais:
```
x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
```

Para `create-invoice` e `process-cancellation` (invocadas diretamente do frontend), a ausência pode causar falhas de preflight em navegadores que enviam esses headers. Para `automated-billing` e `check-overdue-invoices` (invocadas server-to-server), o impacto é menor mas a padronização é recomendada.

**Ação**: Padronizar CORS headers em todas as edge functions para incluir os headers Supabase-specific.

### 51. webhook `payment_intent.succeeded` não confirma participantes de aulas prepaid (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 441-501)

Quando uma fatura pré-paga é paga via `payment_intent.succeeded`, o webhook atualiza o status da fatura para `paid` e limpa campos temporários (PIX, boleto). Porém, **não atualiza o status dos participantes da aula** (`class_participants.status`) nem da aula (`classes.status`).

No modelo pós-pago, isso não é problema porque o status da aula já reflete a conclusão (o faturamento vem depois). No modelo **pré-pago**, a fatura é criada antes/no momento do agendamento, e o pagamento pode ser o gatilho para confirmar a participação ou liberar a aula.

**Decisão**: Existem duas abordagens:
1. **Não atualizar** (mais simples): A aula já é criada com `status = 'confirmada'` no `handleClassSubmit`. O pagamento da fatura é um evento financeiro separado da confirmação da aula. Status da aula e do pagamento são independentes.
2. **Atualizar** (mais completo): Ao receber pagamento de fatura `prepaid_class`, buscar `invoice.class_id` e atualizar `class_participants` para refletir "pagamento recebido".

**Recomendação**: Opção 1 (não atualizar). A aula já está confirmada; o pagamento é rastreado pela fatura. Se futuramente for necessário um indicador visual de "pago", usar JOIN com `invoices` em vez de duplicar estado.

---

## Novas Melhorias v4.7 (M16-M17)

### M16. automated-billing deve salvar `payment_method` na fatura ao criá-la (Fase 5)

Relacionada à ponta #48. Ao implementar o helper `selectPaymentMethod` (pontas #31, #36, #40), o método selecionado deve ser persistido no campo `invoices.payment_method` no momento da criação da fatura, não apenas após o pagamento via webhook. Isso permite que:
1. Emails de notificação (`send-invoice-notification`) usem CTAs corretos desde o envio (M12)
2. A UI do Financeiro exiba o método de pagamento esperado antes do pagamento ser processado
3. Relatórios e métricas reflitam a intenção de pagamento mesmo para faturas pendentes

### M17. webhook-stripe-connect: confirmar participantes de aulas prepaid ao receber pagamento (Fase 8)

Relacionada à ponta #51. Se a opção 2 for escolhida futuramente, o handler `payment_intent.succeeded` deve:
1. Buscar a fatura com `class_id` e `invoice_type = 'prepaid_class'`
2. Se encontrar, atualizar `class_participants.status` para `'confirmada'` (ou adicionar campo `payment_confirmed`)
3. Enviar notificação de confirmação ao professor

Por ora, a recomendação é manter a opção 1 (sem atualização) e documentar como melhoria futura.

---

## Pontas Soltas Resolvidas no Código (Correções v4.7)

### ~~#33. create-invoice não dispara notificação por email~~ ✅

O `create-invoice` (linhas 531-548) já implementa `send-invoice-notification` com fire-and-forget. A ponta #33 e a melhoria M9 estavam incorretas — o código já possui essa funcionalidade.

### ~~#44 (parcial). create-invoice `payment_method` não salvo~~ ✅

O `create-invoice` (linha 439) já salva `payment_method: selectedPaymentMethod` após determinar a hierarquia (Boleto → PIX). O problema restante é apenas no `automated-billing` (ponta #48).

---

## O que foi REMOVIDO do plano v3.10

1. Edge function `process-class-billing` (nunca existiu no código)
2. Lógica de Invoice Items + Invoice + Finalize no Stripe Connect para pré-pago
3. Lógica de void/cancel de faturas Stripe no cancelamento
4. Lógica de reembolso (pending_refunds para pré-pago)
5. Complexidade de materialização com billing no frontend
6. ~60% dos 228 gaps originais
7. Fase 0 com referência inválida a "Gaps 82-115"

---

## Novas Pontas Soltas v4.8 (#52-#56)

### 52. automated-billing `validateTeacherCanBill` usa FK join `subscription_plans!inner` (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 1031-1036)

A função `validateTeacherCanBill` usa FK join syntax:
```
.select(`status, subscription_plans!inner (features)`)
```

Isso viola a constraint `edge-functions-pattern-sequential-queries`. Se o schema cache do Deno ficar desatualizado, a validação de permissão do professor falhará silenciosamente, impedindo a cobrança de todos os alunos daquele professor.

**Ação**: Refatorar para duas queries sequenciais: (1) buscar `user_subscriptions` com `status = 'active'`, (2) buscar `subscription_plans` pelo `plan_id` retornado.

### 53. send-invoice-notification usa `.single()` em lookup de fatura (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linha 57)

A query de fatura usa `.single()`. Se a fatura não existir (ex: fatura deletada antes da notificação ser processada, ou race condition no cron), a função lança exceção e retorna 500. Isso pode causar falhas em cadeia quando `check-overdue-invoices` ou `automated-billing` invocam essa função.

**Ação**: Substituir por `.maybeSingle()` e retornar early com log de warning se fatura não encontrada.

### 54. send-invoice-notification SELECT não inclui `payment_method` — bloqueia M12 (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 41-54)

O SELECT da fatura inclui `stripe_hosted_invoice_url`, `boleto_url`, `pix_qr_code`, `pix_copy_paste`, `invoice_type` e `monthly_subscription_id`, mas **não inclui `payment_method`**. A implementação de M12 (CTAs dinâmicos baseados no método de pagamento) requer esse campo para decidir labels como "Ver Boleto" vs "Pagar via PIX".

A lógica atual (linhas 289-309) decide o que mostrar pela **presença** dos campos (`boleto_url`, `pix_copy_paste`, etc.). Para faturas recém-criadas onde o payment intent ainda não gerou todos os dados, o email pode não incluir nenhum método.

**Ação**: Adicionar `payment_method` ao SELECT. Usar `payment_method` como fonte primária para decidir o CTA principal, com fallback para presença de campos.

### 55. materializeVirtualClass frontend: group participants sem `dependent_id` (Fase 5)

**Arquivo**: `src/pages/Agenda.tsx` (linhas 1309-1313)

Ao materializar uma aula virtual de grupo, os participantes são inseridos sem `dependent_id`:
```javascript
const participantInserts = virtualClass.participants.map(p => ({
  class_id: newClass.id,
  student_id: p.student_id,
  status: targetStatus
}));
```

O `dependent_id` está disponível em `p.dependent_id` mas **não é propagado**. Isso quebra:
- Rastreamento de uso de franquia de mensalidade (dependentes consolidados no responsável)
- Nome correto na fatura (mostra responsável em vez do dependente)
- Notificação de cancelamento (não sabe qual dependente participava)

**Ação**: Adicionar `dependent_id: p.dependent_id || null` ao objeto de insert. Verificar também o bloco de aula individual (linha 1322) que igualmente não propaga `dependent_id` na materialização.

### 56. check-overdue-invoices atualiza status para `overdue` antes de confirmar envio (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-70)

A função atualiza o status da fatura para `overdue` (linha 57) **antes** de invocar `send-invoice-notification` (linha 62). Se o envio falhar, a fatura já está `overdue` mas o aluno não foi notificado. Na próxima execução do cron, a fatura não será reprocessada (já não tem `status = 'pendente'`), resultando em fatura vencida sem comunicação.

**Ação**: Inverter a ordem — enviar notificação primeiro, atualizar status depois. Ou atualizar status apenas se a notificação for enviada com sucesso.

---

## Novas Melhorias v4.8 (M18-M19)

### M18. automated-billing deve buscar `charge_timing` e `enabled_payment_methods` na query de business_profiles (Fase 4)

Relacionada a #52 e M5. A query de `business_profiles` (linha 133) busca apenas `id, business_name`. Deve incluir `charge_timing, enabled_payment_methods` para:
1. Logging de M5
2. Helper `selectPaymentMethod` (pontas #31, #36, #40) sem queries adicionais
3. Futuras decisões baseadas no modelo de cobrança

### M19. check-overdue-invoices deve diferenciar notificações por `invoice_type` (Fase 8)

Faturas pré-pagas (`prepaid_class`) vencidas precisam de mensagem contextual diferente:
- **Pós-paga**: "Sua fatura está vencida"
- **Pré-paga**: "A fatura da sua aula agendada para [data] está vencida"

A query (linhas 27-31) não inclui `invoice_type`. Adicionar ao SELECT e passar ao `send-invoice-notification` para personalização.

---

## Novas Pontas Soltas v4.9 (#57-#61)

### 57. create-invoice usa FK join `business_profiles!teacher_student_relationships_business_profile_id_fkey` (Fase 4)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 143-154)

A query de `teacher_student_relationships` usa FK join syntax:
```
.select(`
  business_profile_id, 
  teacher_id,
  business_profile:business_profiles!teacher_student_relationships_business_profile_id_fkey(
    enabled_payment_methods
  )
`)
```

Isso viola a constraint `edge-functions-pattern-sequential-queries`. Se o schema cache do Deno ficar desatualizado, o `create-invoice` retornará erro 500 — tanto para faturas manuais quanto para pré-pagas e cancelamentos. Impacto crítico pois `create-invoice` é chamada por `process-cancellation` server-to-server e pelo frontend.

**Ação**: Refatorar para duas queries sequenciais: (1) buscar `teacher_student_relationships` com `business_profile_id`, (2) buscar `business_profiles` pelo `id` retornado para obter `enabled_payment_methods`.

### 58. automated-billing usa FK joins `teacher:profiles!teacher_id` e `student:profiles!student_id` (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 71-89)

A query principal de `teacher_student_relationships` usa **dois** FK joins simultâneos:
```
.select(`
  id, student_id, teacher_id, billing_day, business_profile_id,
  teacher:profiles!teacher_id (id, name, email, payment_due_days),
  student:profiles!student_id (id, name, email)
`)
```

Isso já foi identificado parcialmente na ponta #52 (validateTeacherCanBill), mas a query **principal** do fluxo de billing (linha 71) também viola a constraint e tem impacto muito maior — se falhar, **nenhum aluno é faturado**.

**Ação**: Refatorar para: (1) buscar `teacher_student_relationships` com campos básicos, (2) buscar `profiles` do teacher e student separadamente.

### 59. process-cancellation não verifica `is_paid_class` nem `charge_timing` (Fase 5)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 43-46)

A query de `classes` busca `id, teacher_id, class_date, status, is_group_class, service_id, is_experimental` mas **não busca `is_paid_class`**. O plano v4.1 define que:
- Se `is_paid_class = false`: `shouldCharge = false` (igual a experimental)
- Se `charge_timing = 'prepaid'` e `is_paid_class = true`: `shouldCharge = false` (cobrança já feita)

Sem buscar `is_paid_class` e `charge_timing`, o `process-cancellation` pode gerar faturas de cancelamento para aulas pré-pagas, violando o invariante de segurança definido na seção "Invariante de segurança: faturas de cancelamento + prepaid".

**Ação**: 
1. Adicionar `is_paid_class` ao SELECT de `classes` (linha 45)
2. Buscar `charge_timing` do `business_profiles` do professor (query sequencial)
3. Adicionar lógica: `if (!classData.is_paid_class) shouldCharge = false;` e `if (chargeTiming === 'prepaid' && classData.is_paid_class) shouldCharge = false;`

### 60. automated-billing hardcoded `payment_method: 'boleto'` ignora `enabled_payment_methods` (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 527 e 855)

Em dois pontos, o `automated-billing` invoca `create-payment-intent-connect` com `payment_method: 'boleto'` hardcoded:
- Linha 527: faturamento tradicional per-class
- Linha 855: faturamento de mensalidade

Se o professor desabilitou boleto e habilitou apenas PIX, a geração de pagamento falhará silenciosamente. O `create-invoice` (que é chamado do frontend) já implementa a hierarquia correta (Boleto → PIX → None), mas o `automated-billing` **não usa `create-invoice`** — ele usa a RPC `create_invoice_and_mark_classes_billed` diretamente e depois gera o pagamento manualmente.

**Ação**: Buscar `enabled_payment_methods` do `business_profiles` (já proposto em M18) e aplicar a mesma hierarquia de seleção: Boleto (se habilitado e >= R$5) → PIX (se habilitado e >= R$1) → None.

### 61. materialize-virtual-class backend não propaga `is_paid_class` (Fase 3)

**Arquivo**: `supabase/functions/materialize-virtual-class/index.ts` (linhas 250-263)

A criação da aula materializada copia campos do template:
```javascript
teacher_id, class_date, duration_minutes, status, is_experimental, 
is_group_class, service_id, is_template, class_template_id, notes
```

Mas **não copia `is_paid_class`**. O template (aula recorrente) pode ter `is_paid_class = true` ou `false`, e essa informação se perde na materialização. Como o default do banco é `true`, aulas de reposição (template com `is_paid_class = false`) serão incorretamente materializadas como pagas, gerando cobranças indevidas.

**Ação**: Adicionar `is_paid_class: template.is_paid_class` ao insert (linha 262). Isso já está documentado como ponta #17 para o frontend, mas a edge function backend tem o mesmo bug.

---

## Novas Melhorias v4.9 (M20-M22)

### M20. CancellationModal frontend não busca `is_paid_class` — bloqueia UX de cancelamento híbrido (Fase 5)

Relacionada a #19/#20. A query do `CancellationModal.tsx` (linhas 113-119) busca `teacher_id, class_date, service_id, is_group_class, is_experimental, class_services(price)` mas não busca `is_paid_class`. Sem esse campo, o modal não consegue:
1. Mostrar aviso contextual para aulas pré-pagas ("O pagamento já foi realizado")
2. Esconder o aviso de multa para aulas não-pagas
3. Diferenciar o comportamento de cancelamento conforme o modelo de cobrança

**Ação**: Adicionar `is_paid_class` ao SELECT. Buscar `charge_timing` do `business_profiles` do professor via query sequencial. Atualizar a lógica de `willBeCharged` para considerar os dois campos.

### M21. automated-billing gera boleto para fatura de mensalidade separadamente em vez de usar helper compartilhado (Fase 4)

O fluxo `processMonthlySubscriptionBilling` (linhas 848-878) e o fluxo tradicional (linhas 520-558) ambos implementam a **mesma lógica** de geração de boleto: invocar `create-payment-intent-connect`, atualizar a fatura com os campos retornados. Esse código está duplicado em 3 pontos:
1. Faturamento tradicional (linha 520)
2. Faturamento de mensalidade (linha 848)
3. Faturamento de aulas fora do ciclo (linha 963)

**Ação**: Extrair para helper `generatePaymentForInvoice(invoiceId, enabledMethods, amount)` que aplica a hierarquia de pagamento correta (Boleto → PIX → None) e retorna os campos para atualizar a fatura. Isso resolve simultaneamente a ponta #60.

### M22. send-invoice-notification CTA `stripe_hosted_invoice_url` rotulado como "Pagar com Cartão" (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 291-295)

O email mostra `stripe_hosted_invoice_url` com label "Pagar com Cartão":
```html
<p><strong>💳 Cartão de Crédito:</strong></p>
<a href="${invoice.stripe_hosted_invoice_url}" class="payment-link">Pagar com Cartão</a>
```

Porém `stripe_hosted_invoice_url` é preenchida com a URL do **boleto** (não do cartão) quando o método selecionado é boleto:
```javascript
// create-invoice.ts linha 443:
updateFields.stripe_hosted_invoice_url = paymentResult.boleto_url;
```

O campo `stripe_hosted_invoice_url` está sendo usado para armazenar URLs de boleto, mas o label no email diz "Cartão de Crédito". Isso confunde o aluno.

**Ação**: No `send-invoice-notification`, usar `boleto_url` para boletos e `stripe_hosted_invoice_url` para cartão. Se ambos existirem, exibir ambos com labels corretos. Se apenas `boleto_url` existir, exibir "Ver Boleto". Remover o uso ambíguo de `stripe_hosted_invoice_url` como campo genérico.

---

## Novas Pontas Soltas v5.0 (#62-#67)

### 62. handleClassSubmit não inclui `is_paid_class` no insert de aulas (Fase 3)

**Arquivo**: `src/pages/Agenda.tsx` (linhas 1419-1430)

O `baseClassData` construído no `handleClassSubmit` inclui `teacher_id, service_id, class_date, duration_minutes, notes, status, is_experimental, is_group_class, recurrence_pattern` mas **não inclui `is_paid_class`**. Sem esse campo, todas as aulas criadas usarão o default do banco (`true`), ignorando a seleção do professor no ClassForm.

Isso é a raiz de múltiplas pontas soltas downstream (#17, #18, #59, #61). Sem propagar `is_paid_class` na criação, toda a lógica de faturamento condicional é inútil.

**Ação**: Adicionar `is_paid_class: formData.is_paid_class ?? true` ao `baseClassData` (linha 1430). Verificar que `ClassFormData` interface inclui `is_paid_class: boolean`.

### 63. materializeVirtualClass frontend não inclui `is_paid_class` no insert (Fase 3)

**Arquivo**: `src/pages/Agenda.tsx` (linhas 1288-1299)

O `realClassData` do `materializeVirtualClass` inclui campos do `virtualClass` mas **não inclui `is_paid_class`**. Como a propriedade `is_paid_class` pode existir no objeto `virtualClass` (vindo do template), ela deve ser propagada.

**Ação**: Adicionar `is_paid_class: virtualClass.is_paid_class ?? true` ao `realClassData` (linha 1299). Confirmar que a query de templates em `loadClasses` inclui `is_paid_class` no SELECT.

### 64. webhook `payment_intent.succeeded` usa `.single()` no lookup de `payment_origin` (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 453-457)

```javascript
const { data: existingPI } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .single();
```

Se nenhuma fatura existir com esse `payment_intent_id` (evento órfão ou race condition), `.single()` lança exceção. Embora o `.data` resultante possa ser ignorado, a exceção pode interromper o handler e causar retry do Stripe.

**Ação**: Substituir por `.maybeSingle()`. Se `existingPI` for `null`, continuar normalmente (update não encontrará nada — é seguro).

### 65. automated-billing `processMonthlySubscriptionBilling` não filtra por `is_paid_class` (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 674-680)

A RPC `get_unbilled_participants_v2` é chamada para buscar aulas concluídas, mas a RPC **não filtra por `is_paid_class`**. Se um professor usa modelo pós-pago e tem aulas marcadas como `is_paid_class = false` (gratuitas/reposição), essas aulas serão contabilizadas como uso da franquia de mensalidade, reduzindo o limite de aulas pagas.

Memória `database/billing-rpc-filters-experimental-dependents` confirma que a RPC filtra `is_experimental = false`, mas **não menciona filtro de `is_paid_class`**.

**Ação**: Atualizar a RPC `get_unbilled_participants_v2` para adicionar `AND c.is_paid_class = true` na cláusula WHERE. Isso garante que apenas aulas pagas consumam a franquia e sejam faturadas.

### 66. ClassFormData interface não inclui `is_paid_class` (Fase 3)

**Arquivo**: `src/components/ClassForm/ClassForm.tsx` (linhas 47-63)

A interface `ClassFormData` define os campos retornados pelo formulário:
```typescript
interface ClassFormData {
  selectedStudents: string[];
  selectedParticipants: ParticipantSelection[];
  service_id: string;
  class_date: string;
  time: string;
  duration_minutes: number;
  notes: string;
  is_experimental: boolean;
  is_group_class: boolean;
  recurrence?: { ... };
}
```

O campo `is_paid_class` **não existe** na interface. Antes de implementar o switch no ClassForm (Fase 3), a interface precisa ser estendida. Sem isso, TypeScript bloqueará `formData.is_paid_class` no `handleClassSubmit`.

**Ação**: Adicionar `is_paid_class: boolean;` à interface `ClassFormData`.

### 67. automated-billing fatura tradicional não envia notificação para todas as faturas criadas (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 560-566)

No fluxo tradicional (sem mensalidade), após criar a fatura e gerar o boleto (linhas 484-558), **não há chamada a `send-invoice-notification`**. A notificação só existe no fluxo de mensalidade (linha 884) e no fluxo de aulas fora do ciclo (linha 998). O aluno que recebe fatura avulsa automatizada **não recebe email**.

Compare com `create-invoice` (linha 532) que sempre envia notificação. O `automated-billing` deveria fazer o mesmo para faturas tradicionais.

**Ação**: Adicionar chamada fire-and-forget a `send-invoice-notification` após a linha 565 (antes do `processedCount++`):
```javascript
supabaseAdmin.functions.invoke('send-invoice-notification', {
  body: { invoice_id: invoiceId, notification_type: 'invoice_created' }
}).catch(err => logStep('⚠️ Failed to send notification', err));
```

---

## Novas Melhorias v5.0 (M23-M25)

### M23. CORS headers desatualizados em 4+ edge functions (Infraestrutura)

Memória `infrastructure/edge-functions-cors-headers` define que os CORS headers devem incluir `x-supabase-client-platform`, etc. As seguintes funções usam headers incompletos:
- `create-invoice` (linha 5)
- `process-cancellation` (linha 5)
- `automated-billing` (linha 5)
- `check-overdue-invoices` (linha 5)
- `materialize-virtual-class` (linha 5)
- `send-invoice-notification` (linha 5)
- `webhook-stripe-connect` (linha 5)

Todas usam apenas `"authorization, x-client-info, apikey, content-type"`.

**Ação**: Padronizar para: `"authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"`. Para webhooks e cron jobs (server-to-server), o impacto é menor, mas a padronização reduz risco de regressão quando funções mudam de contexto.

### M24. Financeiro.tsx `getInvoiceTypeBadge` e `InvoiceTypeBadge.tsx` estão desincronizados (Fase 7)

Confirmado pela ponta #21 e verificação do código:
- `Financeiro.tsx` (linhas 30-44): suporta 5 tipos (`monthly_subscription`, `automated`, `manual`, `cancellation`, `orphan_charges`) + default
- `InvoiceTypeBadge.tsx` (linhas 12-28): suporta apenas 3 tipos (`monthly_subscription`, `automated`, `manual`)

Nenhum dos dois suporta `prepaid_class`. Após implementação, haverá 7 tipos no banco mas apenas suporte parcial na UI.

**Ação**: Consolidar em `InvoiceTypeBadge.tsx` como componente único (SSoT). Adicionar todos os 7 tipos: `monthly_subscription`, `automated`, `manual`, `cancellation`, `orphan_charges`, `prepaid_class`, `regular`. Atualizar `Financeiro.tsx` para usar `<InvoiceTypeBadge>` em vez da função inline. Adicionar traduções i18n faltantes.

### M25. Cancellation policy buscada múltiplas vezes no automated-billing (Performance)

No fluxo tradicional do `automated-billing`, a `cancellation_policies` é buscada **dentro do loop** de `cancelledChargeable` (linhas 351-356 e 413-418), resultando em N queries para N cancelamentos do mesmo professor. Como a política é a mesma para todos os cancelamentos do mesmo professor, deveria ser buscada **uma única vez** antes do loop.

**Ação**: Mover a query de `cancellation_policies` para antes do loop de processamento (após a linha 307), armazenando em variável `teacherPolicy`. Usar `teacherPolicy?.charge_percentage || 50` dentro do loop.

---

## Pontas Soltas Resolvidas no Código (Correções v5.0)

### ~~#25. FK join syntax no create-invoice~~ → Substituída por #57

A ponta #25 e #57 são a mesma observação. Consolidar como #57 (mais detalhada).

---

## Novas Pontas Soltas v5.1 (#68-#73)

### 68. processMonthlySubscriptionBilling não processa cancelamentos com cobrança — BUG CRÍTICO (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 674-680)

O fluxo de mensalidade (`processMonthlySubscriptionBilling`) busca **apenas** aulas com status `concluida` via `get_unbilled_participants_v2`. Porém, o fluxo **tradicional** (linhas 274-294) busca **separadamente** aulas com status `cancelada` e `charge_applied = true` para incluí-las como itens de cobrança de cancelamento.

**Impacto**: Se um aluno com mensalidade ativa cancela uma aula tardiamente (com cobrança), o `charge_applied = true` é definido no participant, mas **nunca é faturado**. O professor perde a receita da multa de cancelamento. Isso ocorre porque:
1. O aluno tem mensalidade → entra no fluxo `processMonthlySubscriptionBilling` (linha 174)
2. Este fluxo **não busca** participações canceladas com cobrança
3. O fluxo tradicional (que busca) **nunca é executado** para esse aluno (linha 198: `continue`)

**Ação** (M26): Adicionar uma segunda chamada a `get_unbilled_participants_v2` com `p_status = 'cancelada'` no fluxo de mensalidade. Filtrar por `charge_applied = true`. Calcular valor proporcional usando a política de cancelamento e incluir como `cancellation_charge` na fatura de mensalidade.

### 69. automated-billing old confirmed classes check usa FK join `classes!inner` (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 212-226)

A query de alerta de aulas confirmadas antigas usa FK join syntax:
```javascript
.select(`id, classes!inner (id, class_date, status, teacher_id)`)
.eq('classes.teacher_id', studentInfo.teacher_id)
```

Isso viola a constraint `edge-functions-pattern-sequential-queries`. Embora seja apenas um alerta de diagnóstico (não impacta a cobrança), se o schema cache falhar, a exceção pode interromper o processamento do aluno inteiro, causando perda de faturamento.

**Ação**: Refatorar para duas queries sequenciais: (1) buscar `class_participants` com `status = 'confirmada'` do aluno, (2) buscar `classes` pelos IDs retornados e filtrar por `teacher_id` e `class_date < 30 dias`.

### 70. materialize-virtual-class usa Supabase SDK v2.57.4 — inconsistente com ecossistema (Fase 8)

**Arquivo**: `supabase/functions/materialize-virtual-class/index.ts` (linha 2)

```javascript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
```

Todas as outras edge functions usam `@supabase/supabase-js@2.45.0`. A versão diferente pode causar incompatibilidades de tipos e comportamento inesperado em queries.

**Ação**: Padronizar para `@2.45.0` (versão do ecossistema).

### 71. check-overdue-invoices — CONFIRMAÇÃO do bug #47: falta INSERT de tracking (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 44-75, 96-122)

Revisão detalhada confirma o bug #47:

1. **Faturas vencidas** (linhas 47-52): verifica `class_notifications` com `notification_type = 'invoice_overdue'`, mas após enviar a notificação (linha 62), **não insere tracking**. Notificações de vencimento reenviadas a cada execução do cron.

2. **Lembretes** (linhas 100-105): mesma verificação com `notification_type = 'invoice_payment_reminder'`, igualmente **sem INSERT** após envio (linha 109). Lembretes reenviados infinitamente.

3. **Agravante**: usa `class_notifications` (tabela de aula) para faturas — conflito semântico.

**Ação imediata**: Adicionar INSERT em `class_notifications` após cada envio bem-sucedido (linhas 69 e 116). Melhor: usar coluna `overdue_notification_sent` na tabela `invoices` (M15).

### 72. create-invoice catch block retorna HTTP 500 — viola constraint de error handling (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 564-573)

O catch block genérico retorna `status: 500`. A memória `constraints/error-handling-user-friendly-messages` define que edge functions devem retornar **HTTP 200 com `success: false`** para erros de negócio. Com HTTP 500, o Supabase SDK no frontend lança exceção genérica, e a mensagem amigável é perdida.

O `create-invoice` já usa 200 corretamente em validações específicas (linhas 62-68, 165-171), mas o catch genérico reverte para 500.

**Ação**: Alterar catch block para retornar `status: 200` com `success: false`. Manter HTTP 500 apenas para erros inesperados.

### 73. send-invoice-notification usa `.single()` em lookups de aluno e professor (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 65-73, ~85-95)

Além do `.single()` na fatura (#53), a função usa `.single()` para buscar perfil do aluno (linha 69) e do professor. Se um ID inválido for passado, a exceção interrompe o processamento e pode causar falha em cadeia via `automated-billing` ou `check-overdue-invoices`.

**Ação**: Substituir ambos por `.maybeSingle()`. Se aluno/professor não encontrado, logar warning e retornar early sem enviar email.

---

## Novas Melhorias v5.1 (M26-M28)

### M26. processMonthlySubscriptionBilling deve buscar e processar cancelamentos com cobrança (Fase 4)

Relacionada à ponta #68. O fluxo de mensalidade deve ser estendido para:
1. Chamar `get_unbilled_participants_v2` com `p_status = 'cancelada'`
2. Filtrar por `charge_applied = true` e pelo ciclo de faturamento
3. Buscar `cancellation_policies` uma única vez (M25)
4. Calcular valor proporcional e adicionar como `cancellation_charge`
5. **Não** contar cancelamentos contra a franquia de aulas (`maxClasses`)

### M27. Extrair helper `generatePaymentForInvoice` unificado (Fase 4)

Código de geração de pagamento duplicado em **4 pontos** no `automated-billing`:
1. Tradicional (linhas 520-558): hard-coded `'boleto'`
2. Mensalidade (linhas 848-878): hard-coded `'boleto'`
3. Fora do ciclo (linhas 963-993): hard-coded `'boleto'`
4. (Potencial 4º com M26)

**Implementação**:
```typescript
async function generatePaymentForInvoice(
  invoiceId: string, amount: number, enabledPaymentMethods: string[]
): Promise<{ success: boolean; paymentMethod?: string }>
```

Resolve simultaneamente #31, #36, #40, #60 e M21.

### M28. create-invoice deve validar `invoice_type` contra lista de tipos permitidos (Fase 5)

Linha 197 aceita qualquer string como `invoice_type` sem validação. Adicionar validação contra `VALID_INVOICE_TYPES = ['regular', 'manual', 'automated', 'monthly_subscription', 'prepaid_class', 'cancellation', 'orphan_charges']` antes da inserção.

---

## Novas Pontas Soltas v5.2 (#74-#79)

### 74. webhook-stripe-connect `invoice.paid` e `invoice.payment_succeeded` sobrescrevem `payment_method` — BUG (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 300-369)

O Stripe pode enviar **ambos** `invoice.paid` e `invoice.payment_succeeded` para a mesma fatura. Os dois handlers atualizam status para `paid`, mas `invoice.payment_succeeded` (linha 359) define `payment_method: 'stripe_invoice'`, sobrescrevendo o método real (boleto/pix) já salvo pelo handler `payment_intent.succeeded` (linha 471).

Para faturas pré-pagas pagas via boleto, a sequência `payment_intent.succeeded → invoice.payment_succeeded` resultará em `payment_method` mudando de `'boleto'` para `'stripe_invoice'`, quebrando:
1. CTAs de email (M12) que dependem do `payment_method` correto
2. Cálculo de taxas Stripe no Financeiro.tsx (#34/M10)
3. Métricas e relatórios de métodos de pagamento

**Ação**: No handler `invoice.payment_succeeded`, usar `.maybeSingle()` e **não sobrescrever `payment_method`** se já estiver preenchido. Alterar para: `payment_method: existingSucceeded?.payment_method || 'stripe_invoice'`.

### 75. automated-billing `skipBoletoGeneration` não tenta PIX como fallback (Fase 5)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 374-376, 513-519, 783, 848, 925)

Quando `totalAmount < R$ 5,00`, o código define `skipBoletoGeneration = true` e **pula toda geração de pagamento** (linhas 513-519). Porém, PIX tem mínimo de R$ 1,00 — faturas entre R$ 1,00 e R$ 4,99 poderiam ter PIX gerado se habilitado pelo professor.

O mesmo problema ocorre em 3 pontos:
1. Fluxo tradicional (linha 374): `totalAmount < MINIMUM_BOLETO_AMOUNT` → skip tudo
2. Fluxo mensalidade (linha 783): idem
3. Fluxo outside-cycle (linha 925): idem

**Ação** (M31): Renomear `skipBoletoGeneration` para `skipPaymentGeneration`. Antes de skipar, verificar `enabled_payment_methods` do professor: se PIX habilitado e valor >= R$ 1,00, gerar PIX. Resolver via helper `generatePaymentForInvoice` (M27) que já encapsula essa hierarquia.

### 76. automated-billing catch geral retorna HTTP 500 — viola constraint (Fase 8)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 588-596)

O catch block geral retorna `status: 500`. Para chamadas via cron (server-to-server), o impacto é menor, mas se invocado manualmente pelo professor via frontend (ex: botão "Faturar agora"), o HTTP 500 impede que o frontend extraia a mensagem de erro amigável.

Memória `constraints/error-handling-user-friendly-messages` define retorno 200 + `success: false` para erros de negócio.

**Ação**: Alterar para `status: 200` com `success: false` no body. Manter logs de erro para diagnóstico.

### 77. webhook-stripe-connect retorna HTTP 500 para falhas de update não-críticas (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 328-331, 411-414)

Dois handlers retornam HTTP 500 quando falham ao atualizar status de fatura:
- `invoice.paid` (linha 328): `return new Response(JSON.stringify({ error: 'Failed to update invoice to paid' }), { status: 500 })`
- `invoice.marked_uncollectible` (linha 411): idem

Retornar 500 ao Stripe causa **retries automáticos**, que por sua vez podem causar processamento duplicado em handlers não-idempotentes. Se a fatura simplesmente não existe no banco (evento orphan), o retry nunca será bem-sucedido, gerando logs de erro infinitos.

**Ação** (M29): Retornar HTTP 200 com `{ received: true, warning: '...' }` para falhas de update. Logar como warning (não error). HTTP 500 deve ser reservado para falhas de validação de assinatura do webhook.

### 78. create-invoice guardian lookup usa `.single()` — pode falhar (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 382)

A query de guardian data:
```javascript
const { data: relationshipData } = await supabaseClient
  .from('teacher_student_relationships')
  .select('student_guardian_cpf, ...')
  .eq('student_id', billingStudentId)
  .eq('teacher_id', user.id)
  .single();
```

Usa `.single()` que lançará exceção se não encontrar o relacionamento (ex: relação deletada entre criação da fatura e lookup de guardian). Como essa query é usada apenas para **logging** (linhas 384-390), uma exceção aqui interrompe todo o fluxo de pagamento desnecessariamente.

**Ação**: Substituir por `.maybeSingle()`. Se `relationshipData` for null, continuar sem dados de guardian (já é opcional).

### 79. processMonthlySubscriptionBilling `outsideCycleInvoiceId` não logado pelo caller (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 184-195, 1012-1016)

A função retorna `{ success, invoiceId, outsideCycleInvoiceId }` mas o caller (linhas 184-195) apenas verifica `subscriptionResult.success` e loga `subscriptionResult` genericamente:
```javascript
logStep(`✅ Monthly subscription billing completed`, subscriptionResult);
```

O `outsideCycleInvoiceId` se perde no log genérico. Quando um aluno tem aulas **antes** e **depois** do início da mensalidade, duas faturas são criadas, mas sem log explícito do segundo ID, a auditoria de faturamento dual fica difícil.

**Ação** (M30): O caller deve logar explicitamente ambos os IDs:
```javascript
if (subscriptionResult.outsideCycleInvoiceId) {
  logStep(`📦 Also created traditional invoice for pre-subscription classes`, {
    outsideCycleInvoiceId: subscriptionResult.outsideCycleInvoiceId
  });
}
```

---

## Novas Melhorias v5.2 (M29-M31)

### M29. webhook-stripe-connect deve retornar HTTP 200 para falhas de update não-críticas (Fase 8)

Relacionada à ponta #77. Handlers de webhook devem distinguir entre:
1. **Falhas críticas** (assinatura inválida, evento corrompido): retornar HTTP 400/500
2. **Falhas de processamento** (fatura não encontrada, update falhou): retornar HTTP 200 com warning

O padrão atual retorna 500 em dois handlers (`invoice.paid`, `invoice.marked_uncollectible`), causando retries desnecessários. Todos os outros handlers (`invoice.payment_succeeded`, `invoice.voided`, `payment_intent.succeeded`) já retornam 200 mesmo em caso de falha — inconsistência.

### M30. processMonthlySubscriptionBilling caller deve logar `outsideCycleInvoiceId` explicitamente (Fase 4)

Relacionada à ponta #79. O caller deve extrair e logar especificamente `outsideCycleInvoiceId` para facilitar auditoria de cenários de faturamento dual (mensalidade + aulas pré-mensalidade).

### M31. automated-billing `skipBoletoGeneration` deve verificar PIX antes de pular geração (Fase 5)

Relacionada à ponta #75. A lógica de `skipBoletoGeneration` (3 pontos no código) deve ser substituída por chamada ao helper `generatePaymentForInvoice` (M27), que já implementa a hierarquia Boleto → PIX → None com valores mínimos corretos.

Isso resolve simultaneamente #75 e complementa #31, #36, #40, #60.

---

## Novas Pontas Soltas v5.3 (#80-#85)

### 80. process-cancellation usa SERVICE_ROLE_KEY como Bearer token para create-invoice — viola constraint de autenticação (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 451-457)

O `process-cancellation` invoca `create-invoice` passando `SUPABASE_SERVICE_ROLE_KEY` como Bearer token:
```javascript
headers: {
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
}
```

A memória `auth/limite-autenticacao-service-role-edge-functions` documenta explicitamente que a `SUPABASE_SERVICE_ROLE_KEY` **não pode ser passada como Bearer token para `supabase.auth.getUser()`**, pois não é um JWT de usuário válido. O `create-invoice` (linha 45) chama `supabase.auth.getUser(token)` e usará o service role key como se fosse um token de usuário.

Na prática, o `user` retornado por `getUser` será `null` ou inválido, fazendo o fluxo falhar na linha 49 (`if (!user) throw`). Se faturas de cancelamento estão sendo criadas com sucesso hoje, é possível que o SDK esteja aceitando como JWT válido — comportamento não documentado e frágil.

**Severidade**: CRÍTICA — pode falhar silenciosamente em atualizações do SDK.

**Ação**: Refatorar `process-cancellation` para criar a fatura diretamente via `supabaseClient` (que já tem service role) em vez de invocar `create-invoice` como edge function. Alternativamente, adicionar ao `create-invoice` um bypass de autenticação quando chamado com service role (verificando `auth.role() === 'service_role'`).

### 81. check-overdue-invoices sem guard clause `status = 'pendente'` no update — race condition paid→overdue (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59)

A função busca faturas com `status = 'pendente'` e `due_date < now`, depois atualiza para `overdue`. Porém, entre a busca (linha 27-31) e o update (linha 57-59), um webhook Stripe pode ter processado o pagamento e atualizado o status para `paid`. O update `.eq('id', invoice.id)` **não verifica** o status atual — sobrescreve para `overdue` mesmo que a fatura já esteja `paid`.

A memória `payment/protecao-reversao-status-fatura` define: "Transições de estado devem incluir uma verificação de guarda para garantir que o status atual não seja 'paga'".

**Severidade**: ALTA — fatura paga revertida para overdue.

**Ação**: Adicionar `.eq('status', 'pendente')` ao update:
```javascript
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id)
  .eq("status", "pendente"); // Guard clause
```

### 82. AmnestyButton não verifica `is_paid_class` — permite anistia em aulas pré-pagas (Fase 7)

**Arquivo**: `src/components/AmnestyButton.tsx` (linhas 28-80)

O `AmnestyButton` concede anistia atualizando `classes.charge_applied = false` e cancelando a fatura `invoice_type = 'cancellation'`. O plano define que para aulas pré-pagas, a anistia **não deve ser oferecida** (tratamento manual entre professor e aluno).

Atualmente, o componente **não recebe** nem verifica `is_paid_class` ou `charge_timing`. As props (`AmnestyButtonProps`) não incluem esses campos.

**Severidade**: MÉDIA — mitigado pelo invariante no backend (`shouldCharge = false` para prepaid).

**Ação**: Adicionar props `isPaidClass` e `chargeTiming` ao `AmnestyButton`. Se `chargeTiming === 'prepaid' && isPaidClass`, renderizar label informativo em vez do botão.

### 83. process-cancellation catch geral retorna HTTP 500 — viola constraint (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 493-499)

O catch block genérico retorna `status: 500`. Quando chamado pelo frontend (`CancellationModal.tsx`), o Supabase SDK lança exceção genérica e a mensagem de erro amigável é perdida. O usuário vê apenas "Erro ao cancelar aula" em vez da mensagem específica.

Mesmo cenário das pontas #72 (`create-invoice`) e #76 (`automated-billing`).

**Severidade**: MÉDIA — UX degradada, sem perda de dados.

**Ação**: Alterar para `status: 200` com body `{ success: false, error: message }`.

### 84. process-cancellation usa `.single()` para buscar dependente — pode falhar (Fase 6)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 103-107)

A query de dependente usa `.single()`. Se o `dependent_id` passado for inválido ou o dependente tiver sido deletado entre a seleção no frontend e o processamento, o `.single()` lança exceção e interrompe todo o cancelamento.

**Severidade**: BAIXA — edge case raro mas possível.

**Ação**: Substituir por `.maybeSingle()`. Se `dependent` for null, continuar o cancelamento sem dados de dependente (já é um campo opcional).

### 85. automated-billing não salva `payment_method` nos 3 updates de pagamento (Fase 8)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 534-542, 861-869, 978-984)

O `invoiceData` passado a `create_invoice_and_mark_classes_billed` não inclui `payment_method`. Os 3 fluxos (tradicional, mensalidade, fora-ciclo) geram o pagamento após a criação e atualizam a fatura com `boleto_url`, `linha_digitavel`, `stripe_payment_intent_id`, etc., mas **nenhum** inclui `payment_method: 'boleto'` (ou o método selecionado).

Em contraste, o `create-invoice` (linhas 437-439) **já salva** `payment_method: selectedPaymentMethod`.

Isso é distinto da ponta #48 (que identifica o problema na criação) — aqui o problema é nos **updates subsequentes** após geração de pagamento.

**Severidade**: ALTA — faturas sem `payment_method` quebra CTAs de email e cálculo de taxas.

**Ação**: Adicionar `payment_method: selectedPaymentMethod` (via helper `generatePaymentForInvoice` de M27) em cada um dos 3 updates de pagamento.

---

## Novas Melhorias v5.3 (M32-M35)

### M32. check-overdue-invoices catch geral retorna HTTP 500 — padronizar (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 139-151)

O catch block retorna `status: 500`. Para funções invocadas via cron, o impacto é menor, mas se invocada manualmente (ex: painel admin), o HTTP 500 impede que o frontend extraia a mensagem de erro. Padronizar para `status: 200` com `success: false`.

### M33. send-cancellation-notification não busca nome do serviço — email incompleto (Fase 6)

**Arquivo**: `supabase/functions/send-cancellation-notification/index.ts` (linhas 52-57)

A query de `classes` busca apenas `id, class_date, teacher_id, service_id` mas não busca o nome do serviço. O email de cancelamento diz "sua aula foi cancelada" sem indicar qual serviço/matéria. Para professores com múltiplos serviços, isso é confuso.

**Ação**: Buscar `class_services.name` via query sequencial após obter `service_id`.

### M34. Agenda.tsx handleClassSubmit — participantes de grupo sem `confirmed_at` (Fase 5)

**Arquivo**: `src/pages/Agenda.tsx` (linhas 1487-1492)

Na criação de aulas em grupo, participantes são inseridos com `status: 'confirmada'` mas sem `confirmed_at`. Em aulas individuais (linhas 1320-1328), o `confirmed_at` é definido. Inconsistência nos dados.

**Ação**: Adicionar `confirmed_at: new Date().toISOString()` ao insert de participantes de grupo.

### M35. Idempotência no create-invoice para faturas prepaid — verificação de duplicidade (Fase 5)

A memória `features/billing/create-invoice-idempotency-constraint` define que o `create-invoice` deve verificar faturas existentes para a combinação `participant_id + class_id` antes da inserção. O código atual (linhas 188-208) **não realiza** essa verificação. Um duplo clique ou retentativa de rede pode criar faturas duplicadas.

**Ação**: Antes de inserir a fatura, verificar se já existe uma fatura com `class_id = X` e `student_id = Y` e `invoice_type = 'prepaid_class'` e `status != 'cancelada'`. Se existir, retornar a fatura existente em vez de criar nova.

---

## Novas Pontas Soltas v5.4 (#86-#91)

### 86. webhook-stripe-connect `payment_intent.succeeded` apaga dados de boleto/PIX da fatura paga (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 464-482)

Quando um `payment_intent.succeeded` é recebido, o handler define:
```javascript
pix_qr_code: null,
pix_copy_paste: null,
pix_expires_at: null,
boleto_url: null,
linha_digitavel: null,
boleto_expires_at: null,
barcode: null,
stripe_hosted_invoice_url: null,
```

Isso **apaga permanentemente** a URL do boleto e os dados do PIX da fatura. Embora o pagamento já tenha sido confirmado, esses dados são necessários para:
1. O aluno consultar o comprovante na página `/faturas` (CTA "Ver Boleto" desaparece)
2. Auditoria histórica e resolução de disputas financeiras
3. O professor verificar qual método foi usado no painel financeiro

A ponta #74 identificou que `invoice.payment_succeeded` sobrescreve `payment_method`, mas esta ponta é distinta: aqui o `payment_intent.succeeded` **apaga fisicamente** os dados de pagamento.

**Severidade**: ALTA — perda de dados de auditoria.

**Ação**: Remover a limpeza de `boleto_url`, `linha_digitavel`, `stripe_hosted_invoice_url` e `pix_copy_paste` do handler `payment_intent.succeeded`. Manter apenas a limpeza de dados temporários de expiração (`pix_expires_at`, `boleto_expires_at`). Se necessário limpar por segurança, usar flag `payment_data_archived: true` em vez de deletar.

### 87. webhook-stripe-connect handlers `invoice.*` nunca encontram faturas internas — reconciliação falha (Fase 1 — CRÍTICA)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 306-331)

O handler `invoice.paid` busca a fatura com `.eq('stripe_invoice_id', paidInvoice.id)` (linha 309). Porém, faturas criadas pelo `create-invoice` e pelo `automated-billing` **não preenchem `stripe_invoice_id`** — elas preenchem apenas `stripe_payment_intent_id`.

A memória `payment/alvo-reconciliacao-webhook-stripe-connect` confirma: "Buscar apenas pelo ID da fatura resulta em falhas de processamento para pagamentos originados de aulas."

Isso significa que o handler `invoice.paid` **nunca encontra** faturas criadas internamente. O pagamento só é processado pelo handler `payment_intent.succeeded` (linhas 441-501), que busca por `stripe_payment_intent_id`. Se o Stripe enviar `invoice.paid` sem um `payment_intent.succeeded` correspondente, a fatura permanecerá `pendente` indefinidamente.

O mesmo bug afeta os handlers `invoice.payment_succeeded` (linha 347) e `invoice.payment_failed` (linha 386).

**Severidade**: CRÍTICA — reconciliação de pagamentos completamente quebrada para handlers `invoice.*`.

**Ação**: Em cada handler de invoice (`invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.marked_uncollectible`, `invoice.voided`), adicionar fallback de busca por `stripe_payment_intent_id` quando a busca por `stripe_invoice_id` não encontrar resultados:
```javascript
let invoice = existingInvoice;
if (!invoice) {
  const piId = paidInvoice.payment_intent;
  if (piId) {
    const { data } = await supabaseClient
      .from('invoices')
      .select('payment_origin')
      .eq('stripe_payment_intent_id', piId)
      .maybeSingle();
    invoice = data;
  }
}
```

### 88. automated-billing `processMonthlySubscriptionBilling` sem filtro de datas na RPC — performance (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 674-680)

A chamada a `get_unbilled_participants_v2` no fluxo de mensalidade **não passa** os parâmetros `p_start_date` e `p_end_date`:
```javascript
const { data: completedParticipations } = await supabaseAdmin
  .rpc('get_unbilled_participants_v2', {
    p_teacher_id: studentInfo.teacher_id,
    p_student_id: studentInfo.student_id,
    p_status: 'concluida'
  });
```

A filtragem por ciclo é feita **depois** no JavaScript (linhas 709-718). Embora funcional, busca TODAS as aulas não faturadas do histórico inteiro. Se houver centenas de aulas históricas não faturadas, a RPC sobrecarregará a memória.

A RPC `get_unbilled_participants_v2` já suporta `p_start_date` e `p_end_date` (parâmetros opcionais) mas não estão sendo usados.

**Severidade**: MÉDIA — performance degradada para professores com histórico longo.

**Ação**: Passar `p_start_date` como lookback de 6 meses antes do `cycleStart` e `p_end_date` como `cycleEnd + 1 dia` para limitar o volume. Manter filtragem JavaScript como segunda camada.

### 89. create-invoice não verifica `charges_enabled` do Stripe Connect antes de gerar pagamento (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 141-177, 365-415)

O `create-invoice` busca `business_profile_id` e `enabled_payment_methods`, valida que `business_profile_id` existe, e gera pagamento via `create-payment-intent-connect`. Porém, **não verifica** se o `business_profile` tem `stripe_connect_id` válido com `charges_enabled = true`.

Se o professor desconectou a conta Stripe ou teve o onboarding rejeitado, a geração de pagamento falhará no `create-payment-intent-connect`, resultando em fatura sem método de pagamento — o aluno recebe email sem CTA.

O mesmo problema existe no `automated-billing` (linhas 132-142) que busca apenas `id, business_name` do business_profile.

**Severidade**: MÉDIA — UX degradada, fatura sem pagamento.

**Ação**: Antes de invocar `create-payment-intent-connect`, buscar `stripe_connect_id` do `business_profiles` e verificar se `charges_enabled = true`. Se não, logar warning e criar fatura sem pagamento (permitindo pagamento manual posterior).

### 90. Decisão de negócio: mensalidade cobrada sem aulas no ciclo (Documentação)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 736-747, 814-819)

A função **sempre** cria fatura com item `monthly_base` (valor da mensalidade), independentemente de o aluno ter feito aulas no ciclo. Isso é um comportamento de design, porém **não está documentado** como decisão explícita.

Se a mensalidade do aluno foi desativada (`sms.is_active = false`) no meio do ciclo, a RPC `get_student_active_subscription` retornará null e o aluno cairia no fluxo tradicional — mas aulas já concluídas no ciclo atual ficariam sem faturamento por nenhum dos dois fluxos.

**Severidade**: BAIXA — documentação.

**Ação**: Adicionar ao plano decisão explícita: "Mensalidades são cobradas integralmente independente do número de aulas realizadas. Se a mensalidade for desativada no meio do ciclo, o último faturamento inclui o valor integral." Verificar se a desativação mid-cycle está coberta pela lógica atual.

### 91. send-invoice-notification label "Pagar com Cartão" quando link é de boleto (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 291-295)

Bug parcialmente identificado como M22, mas com impacto maior:
```javascript
if (invoice.stripe_hosted_invoice_url) {
  paymentMethods += `
    <p><strong>💳 Cartão de Crédito:</strong></p>
    <a href="${invoice.stripe_hosted_invoice_url}" class="payment-link">Pagar com Cartão</a>
  `;
}
```

No `create-invoice` (linha 443), `stripe_hosted_invoice_url` é preenchida com `paymentResult.boleto_url`:
```javascript
updateFields.stripe_hosted_invoice_url = paymentResult.boleto_url;
```

Resultado: **todos** os emails de fatura de boleto exibem o link do boleto sob o rótulo "Pagar com Cartão de Crédito". Como boletos são o método padrão para a maioria das faturas automatizadas, praticamente todos os emails contêm informação enganosa.

Além disso, o email mostra o **mesmo link** em dois lugares: como "Pagar com Cartão" (via `stripe_hosted_invoice_url`) e como "Gerar Boleto" (via `boleto_url`), pois ambos apontam para a mesma URL.

**Severidade**: ALTA — UX confusa para todos os alunos que recebem faturas.

**Ação**: No `send-invoice-notification`, verificar `payment_method` ou comparar `stripe_hosted_invoice_url === boleto_url`. Se iguais, não renderizar a seção de cartão. Melhor solução: no `create-invoice`, **não copiar** `boleto_url` para `stripe_hosted_invoice_url` (M38).

---

## Novas Pontas Soltas v5.5 (#92-#97)

### 92. automated-billing hardcoda `payment_method: 'boleto'` ignorando `enabled_payment_methods` do professor (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts`

Tanto o fluxo tradicional quanto o de mensalidade hardcodam `payment_method: 'boleto'` ao chamar `create-payment-intent-connect`, ignorando completamente o array `enabled_payment_methods` do `business_profiles` do professor. Se o professor desabilitou boleto e habilitou apenas PIX e cartão, o sistema ainda tenta gerar boleto.

O `create-invoice` (pré-pago) implementa corretamente a hierarquia de fallback (Boleto → PIX → nenhum), mas o `automated-billing` não replica essa lógica.

**Severidade**: ALTA — professor pode não receber pagamentos se desabilitou boleto.

**Ação**: Replicar a lógica de seleção de método de pagamento do `create-invoice` no `automated-billing`, consultando `enabled_payment_methods` do `business_profiles` e seguindo a hierarquia: Boleto (se habilitado e >= R$5) → PIX (se habilitado e >= R$1) → nenhum (fatura manual).

### 93. automated-billing não salva `payment_method` na fatura após geração de pagamento (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts`

Após chamar `create-payment-intent-connect` com sucesso, o `automated-billing` atualiza a fatura com `stripe_payment_intent_id`, `boleto_url`, `linha_digitavel`, etc., mas **não salva o campo `payment_method`** (ex: 'boleto', 'pix'). O campo fica `NULL` na tabela `invoices`.

Isso impacta:
1. Frontend `Financeiro.tsx` que exibe o método de pagamento
2. `send-invoice-notification` que condiciona CTAs baseado em `payment_method`
3. Filtros e relatórios financeiros

A ponta #85 já identificou parcialmente este problema, mas a análise confirma que é mais abrangente: afeta **todas** as faturas geradas pelo `automated-billing`.

**Severidade**: ALTA — campo essencial não preenchido em todas as faturas automatizadas.

**Ação**: Após chamada bem-sucedida a `create-payment-intent-connect`, salvar `payment_method` com o valor do método escolhido ('boleto', 'pix' ou null) no UPDATE da fatura.

### 94. automated-billing fluxo de mensalidade não gera pagamento via Stripe (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (fluxo `processMonthlySubscriptionBilling`)

O fluxo de mensalidade cria a fatura e os `invoice_classes` items mas **não chama** `create-payment-intent-connect` para gerar o boleto/PIX. A fatura é criada com status 'pendente' e sem nenhum dado de pagamento (`stripe_payment_intent_id`, `boleto_url`, etc. ficam NULL).

O fluxo tradicional (`processTraditionalBilling`) chama `create-payment-intent-connect` (quando não há `skipBoletoGeneration`), mas o fluxo de mensalidade omite completamente essa etapa.

O aluno recebe uma fatura sem nenhum CTA de pagamento funcional.

**Severidade**: CRÍTICA — faturas de mensalidade não têm mecanismo de pagamento.

**Ação**: Após criar a fatura de mensalidade e inserir os `invoice_classes`, replicar a lógica de geração de pagamento do fluxo tradicional: consultar `enabled_payment_methods`, selecionar método apropriado, chamar `create-payment-intent-connect` e atualizar a fatura com os dados de pagamento.

### ~~95. DUPLICATA de #155 — check-overdue-invoices race condition (Fase 0 via #155)~~

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59)

O UPDATE para marcar faturas como 'overdue' não inclui condição de status:
```javascript
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id);
```

Se entre o SELECT inicial (linha 27, `.eq("status", "pendente")`) e o UPDATE, o webhook do Stripe processar o pagamento e mudar o status para 'pago', este UPDATE **reverterá** o status para 'overdue'. A ponta #81 já identificou este risco genericamente, mas aqui está o código exato sem a guard clause.

**Severidade**: CRÍTICA — fatura paga pode ser revertida para overdue.

**Ação**: Adicionar `.eq("status", "pendente")` ao UPDATE para garantir atomicidade:
```javascript
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id)
  .eq("status", "pendente");
```

### ~~96. DUPLICATA de #80 — process-cancellation SERVICE_ROLE_KEY como Bearer (Fase 6 via #80)~~

**Arquivo**: `supabase/functions/process-cancellation/index.ts`

Quando há cobrança de cancelamento, `process-cancellation` invoca `create-invoice` passando `SUPABASE_SERVICE_ROLE_KEY` como Bearer token no header Authorization. Conforme a memória `auth/limite-autenticacao-service-role-edge-functions`, o `create-invoice` faz `supabase.auth.getUser(token)` que **falha** com service_role key pois não é um JWT de usuário válido.

Resultado: **nenhuma fatura de cancelamento com cobrança é gerada**. O professor marca "cancelar com cobrança" mas o aluno nunca recebe a fatura correspondente.

A ponta #80 identificou o uso de service_role key como Bearer genericamente, mas #96 documenta o impacto específico: perda de receita em cancelamentos tardios.

**Severidade**: CRÍTICA — receita de cancelamentos com cobrança completamente perdida.

**Ação**: Refatorar `create-invoice` para aceitar chamadas via service_role (verificar `auth.role() === 'service_role'` como alternativa ao `auth.getUser()`) ou refatorar `process-cancellation` para criar a fatura diretamente no banco via service_role client em vez de invocar `create-invoice`.

### 97. Clientes Stripe duplicados: platform vs connected account (Fase 6)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts`

O sistema cria clientes Stripe em dois contextos diferentes:
1. Na conta **platform** (para Boletos via Destination Charges)
2. Na conta **connected** (para PIX via Direct Charges)

Se um aluno paga uma fatura com boleto (cria customer na platform) e outra com PIX (cria customer na connected account), existem dois registros Stripe Customer para o mesmo aluno. O campo `stripe_customer_id` no `profiles` armazena apenas um deles.

Isso pode causar: falhas em cobranças futuras se o customer_id armazenado não corresponde ao tipo de charge sendo usado, dados inconsistentes no dashboard Stripe do professor.

**Severidade**: MÉDIA — inconsistência de dados que pode causar falhas esporádicas.

**Ação**: Armazenar ambos os IDs (platform e connected) separadamente, ou padronizar o tipo de charge para usar apenas um modelo. Documentar a decisão arquitetural sobre Destination vs Direct Charges.

---

## Novas Melhorias v5.5 (M39-M41)

### M39. automated-billing tradicional não envia notificação quando skipBoletoGeneration = true (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts`

Complementa M36. No fluxo tradicional, quando `skipBoletoGeneration = true` (valor < R$5), a fatura é criada mas a notificação via `send-invoice-notification` é completamente pulada. O aluno não sabe que tem uma fatura pendente.

**Ação**: Mover a chamada `send-invoice-notification` para fora do bloco condicional de geração de pagamento, garantindo que notificações são enviadas independentemente do valor da fatura.

### M40. change-payment-method lógica de autorização guardian/responsible redundante e bugada (Fase 5)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 71-108)

A verificação `isGuardian` (linhas 71-92) contém lógica incorreta: busca dependentes do user (`responsible_id = user.id`) e depois verifica se `responsible_id = invoice.student_id AND responsible_id = user.id` — duas condições conflitantes na mesma query. A verificação `isResponsible` (linhas 95-108) simplesmente re-verifica `invoice.student_id === user.id`, que já é coberto por `isStudent`.

Na prática, apenas `isStudent` funciona corretamente. As verificações de guardian e responsible são dead code.

**Ação**: Simplificar para verificar: (1) `isStudent` (student_id === user.id), (2) `isGuardian` via query correta em `dependents` onde o `responsible_id = user.id` e o `student_id` da fatura corresponde ao responsável do dependente. Remover `isResponsible` redundante.

### M41. create-invoice não valida invoice_type contra whitelist (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts`

Conforme a memória `features/billing/create-invoice-type-validation-whitelist`, o `create-invoice` deve implementar uma validação de lista branca para `invoice_type`. A memória documenta os tipos permitidos: 'regular', 'manual', 'automated', 'monthly_subscription', 'prepaid_class', 'cancellation', 'orphan_charges'.

Porém, a validação atual pode não estar implementada ou pode aceitar valores arbitrários. Sem a validação, valores inválidos de `invoice_type` podem ser inseridos, quebrando badges no frontend e filtros financeiros.

**Ação**: Verificar se a CHECK constraint de banco (#16) já cobre esta validação. Se não, adicionar validação no edge function antes do INSERT.

---

## Novas Melhorias v5.4 (M36-M38)

### M36. automated-billing tradicional não envia notificação para faturas com valor abaixo do mínimo (Fase 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 559-566)

Quando `skipBoletoGeneration = true` (valor < R$5), a fatura é criada mas nenhuma notificação é enviada (confirma #67). Porém, mesmo sem boleto, o aluno deveria ser notificado da existência da fatura e orientado a buscar alternativas de pagamento.

**Ação**: Enviar `send-invoice-notification` independentemente do `skipBoletoGeneration`. O email já lida com faturas sem métodos de pagamento (exibe apenas CTA "Ver Fatura" genérico).

### M37. BillingSettings.tsx não busca nem exibe `charge_timing` — confirmação técnica da ponta #3.2 (Fase 2)

**Arquivo**: `src/components/Settings/BillingSettings.tsx` (linhas 73-76)

A query de `business_profiles` busca apenas `id, enabled_payment_methods`:
```javascript
.select('id, enabled_payment_methods')
```

Não busca `charge_timing`. O componente não tem estado, select/radio, nem lógica de salvamento para `charge_timing`. A implementação da Fase 2 precisa adicionar:
1. `charge_timing` ao SELECT
2. Estado `chargeTiming` com useState
3. Radio/Select com opções 'prepaid'/'postpaid'
4. Card informativo condicional (M4)
5. Lógica de UPDATE no `onSubmit` ou em handler separado

### M38. create-invoice duplica `stripe_hosted_invoice_url` com `boleto_url` — raiz do bug #91/M22 (Fase 5)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 443)

```javascript
updateFields.stripe_hosted_invoice_url = paymentResult.boleto_url;
```

O campo `stripe_hosted_invoice_url` foi originalmente criado para armazenar a URL da página de pagamento hospedada pelo Stripe (que suporta cartão). Reutilizá-lo para boleto causa os bugs descritos em #91 e M22.

**Ação**: Remover a cópia de `boleto_url` para `stripe_hosted_invoice_url` no `create-invoice`. Atualizar `send-invoice-notification` e o frontend (`Financeiro.tsx`, `PaymentOptionsCard.tsx`) para usar `boleto_url` diretamente em vez de depender de `stripe_hosted_invoice_url` como campo genérico.

---

## Novas Pontas Soltas v5.6 (#98-#103)

### 98. cancel-payment-intent define status 'paid' em inglês em vez de 'paga' (Fase 3)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts`

Quando o professor marca uma fatura como "paga manualmente" via `cancel-payment-intent`, o status é atualizado para `'paid'` (inglês). O restante do sistema usa `'paga'` (português): `Financeiro.tsx` filtra por `'paga'`, `check-overdue-invoices` exclui `'paga'`, `trg_remove_invoice_notification` verifica `'paga'`. Uma fatura marcada como `'paid'` via esta função será invisível para esses filtros — pode aparecer como pendente/overdue indevidamente.

**Severidade**: ALTA — faturas pagas manualmente podem ser marcadas como vencidas pelo cron job.

**Ação**: Alterar `status: 'paid'` para `status: 'paga'` no update da fatura. Verificar se existem faturas com `status = 'paid'` no banco e migrar para `'paga'`.

### 99. send-invoice-notification armazena invoice.id no campo class_id de class_notifications (Fase 3)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 435-442)

O código registra notificações na tabela `class_notifications` usando `class_id: invoice.id`. Isso viola a semântica da tabela (class_id deveria referenciar classes) e provavelmente falha com a FK constraint `class_notifications_class_id_fkey` que aponta para `classes.id`.

**Severidade**: MÉDIA — notificações de fatura provavelmente nunca são registradas (FK violation silenciosa ou erro), sem impacto funcional direto mas perde rastreabilidade.

**Ação**: Criar tabela `invoice_notifications` dedicada ou usar `teacher_notifications` para rastrear envios de email de faturas. Alternativa mínima: remover o insert em `class_notifications` e confiar apenas nos logs.

### 100. AmnestyButton cancela faturas de todos os participantes em aulas de grupo (Fase 7)

**Arquivo**: `src/components/AmnestyButton.tsx`

Ao conceder anistia, o `AmnestyButton` busca faturas de cancelamento filtrando apenas por `class_id` e `invoice_type = 'cancellation'`. Em aulas de grupo, isso retorna faturas de **todos** os participantes daquela aula, e o código cancela todas elas. O professor pode querer conceder anistia a apenas um aluno específico.

**Severidade**: ALTA — anistia para um aluno em grupo cancela cobranças de todos os outros alunos.

**Ação**: Adicionar filtro `student_id` na query de busca de faturas de cancelamento. O `student_id` deve vir do participante específico que está recebendo a anistia, não apenas do `class_id`.

### 101. Financeiro.tsx calcula taxas Stripe com valor fixo de boleto para todos os métodos (Fase 8)

**Arquivo**: `src/pages/Financeiro.tsx`

O cálculo de taxas usa `STRIPE_BOLETO_FEE` (R$ 3,49) multiplicado pelo número de faturas pagas, independentemente do método de pagamento real. Faturas pagas via PIX (taxa diferente), cartão (percentual, não fixo), ou manualmente (sem taxa) são incorretamente calculadas.

**Severidade**: MÉDIA — dashboard financeiro exibe valores de taxas incorretos.

**Ação**: Calcular taxas por fatura individual usando o campo `payment_method` (quando disponível após #93). PIX: ~1.19%, Cartão: ~3.49% + R$0,39, Boleto: R$3,49 fixo, Manual: R$0,00. Alternativamente, armazenar a taxa real paga em cada fatura.

### 102. verify-payment-status e auto-verify-pending-invoices sem autenticação (Fase 1)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts`, `supabase/functions/auto-verify-pending-invoices/index.ts`

Ambas as funções não verificam se o caller está autenticado. `verify-payment-status` aceita qualquer `invoice_id` sem validar ownership. `auto-verify-pending-invoices` é chamada por cron mas não valida service_role. Um ator malicioso poderia verificar status de faturas de outros professores ou triggerar verificações em massa.

**Severidade**: ALTA — exposição de dados de pagamento e possível abuso de API Stripe.

**Ação**: `verify-payment-status`: adicionar auth check e validar que o caller é teacher_id ou student_id da fatura. `auto-verify-pending-invoices`: verificar que o caller tem role `service_role` ou é chamado via cron authorization header.

### 103. generate-boleto-for-invoice usa FK joins no Deno (Fase 5)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts`

Usa FK join syntax (`profiles!invoices_student_id_fkey`) para buscar dados do aluno e professor junto com a fatura. Isso viola o padrão documentado de evitar FK joins em Edge Functions Deno para prevenir schema cache issues (mesma classe de bugs que #25, #52, #57, #58, #69).

**Severidade**: MÉDIA — pode causar falhas intermitentes de geração de boleto em deploys.

**Ação**: Refatorar para queries sequenciais: buscar fatura, depois profile do aluno, depois profile do professor em queries independentes.

---

## Novas Melhorias v5.6 (M42-M44)

### M42. Financeiro.tsx query incompleta — falta monthly_subscription_id, payment_method, payment_origin (Fase 8)

**Arquivo**: `src/pages/Financeiro.tsx`

A query `loadInvoices` não inclui `monthly_subscription_id`, `payment_method` nem `payment_origin` no SELECT. Isso impede:
1. Exibir o nome do plano de mensalidade nas faturas do tipo `monthly_subscription`
2. Calcular taxas Stripe corretas por método de pagamento (#101)
3. Diferenciar faturas geradas automaticamente vs manualmente

**Ação**: Adicionar os três campos ao SELECT e usar `monthly_subscription_id` para buscar o nome do plano (JOIN ou query sequencial).

### M43. check-overdue-invoices envia apenas um lembrete sem tracking de re-envio (Fase 8)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts`

O cron job marca faturas como overdue e envia uma notificação única. Se o aluno não vê o email, não há mecanismo de re-envio ou escalação. Combinado com o bug #99 (notificação possivelmente não registrada), não há como saber se o aluno foi efetivamente notificado.

**Ação**: Implementar tracking de notificações enviadas por fatura (tabela `invoice_notifications` ou campo `last_reminder_sent_at` na fatura). Permitir re-envio periódico (ex: a cada 3 dias) enquanto a fatura permanecer overdue.

### M44. cancel-payment-intent não verifica se fatura já tem pagamento Stripe bem-sucedido (Fase 6)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts`

Quando o professor "marca como paga manualmente", a função cancela o Payment Intent Stripe existente e marca a fatura como paga. Porém, não verifica se o Payment Intent já foi pago (`status = 'succeeded'`). Se o aluno pagou via Stripe momentos antes do professor marcar manualmente, o pagamento Stripe é cancelado/perdido e o dinheiro não é transferido.

**Ação**: Antes de cancelar o Payment Intent, verificar seu status via `stripe.paymentIntents.retrieve()`. Se `status === 'succeeded'`, não cancelar e apenas atualizar a fatura como paga. Se `status === 'processing'` (boleto em compensação), alertar o professor.

---

## Novas Pontas Soltas v5.7 (#104-#108)

### 104. webhook-stripe-connect handlers invoice.* usam status em inglês — inconsistência com todo o sistema (Batch 1)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 320, 357, 469, 404)

Os handlers `invoice.paid` (linha 320), `invoice.payment_succeeded` (linha 357) e `payment_intent.succeeded` (linha 469) definem `status: 'paid'` em inglês. O handler `invoice.marked_uncollectible` (linha 404) define `status: 'overdue'` também em inglês.

O sistema inteiro utiliza status em português: `'paga'`, `'vencida'`, `'pendente'`, `'cancelada'`, `'falha_pagamento'`. Isso causa:
1. Faturas pagas via webhook ficam invisíveis nos filtros do `Financeiro.tsx` (que filtra por `'paga'`)
2. O cron `check-overdue-invoices` não encontra faturas com status `'paid'` ao filtrar por `'pendente'`
3. O `verify-payment-status` (linha 83) corretamente usa `'paga'`, criando divergência com o webhook

**Severidade**: CRÍTICA — faturas pagas via webhook não aparecem como pagas na interface.

**Relação**: Complementa #98 (mesmo bug em `cancel-payment-intent`). Este impacta TODAS as faturas pagas automaticamente via Stripe.

**Ação**: Substituir todos os status em inglês pelos equivalentes em português:
- `'paid'` → `'paga'` (linhas 320, 357, 469)
- `'overdue'` → `'vencida'` (linha 404)

### 105. process-orphan-cancellation-charges chama RPC com assinatura de parâmetros incorreta (Batch 5)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 205-215)

A função chama `create_invoice_and_mark_classes_billed` com parâmetros individuais (`p_student_id`, `p_teacher_id`, `p_amount`, etc.), enquanto `automated-billing` (linhas 484-488) chama a mesma RPC com objetos compostos (`p_invoice_data`, `p_class_items`).

Uma dessas chamadas está usando a assinatura errada da RPC. Se a RPC espera `p_invoice_data` (objeto), a chamada do `process-orphan-cancellation-charges` falhará silenciosamente, deixando cancelamentos órfãos sem faturamento permanentemente.

**Severidade**: ALTA — se a assinatura estiver errada, nenhuma cobrança órfã será gerada.

**Ação**: Verificar a definição exata da RPC `create_invoice_and_mark_classes_billed` no SQL e padronizar ambas as chamadas para a mesma assinatura. Provavelmente o `process-orphan-cancellation-charges` precisa ser atualizado para usar `p_invoice_data` como objeto.

### 106. process-orphan-cancellation-charges não gera pagamento (boleto/PIX) após criar fatura (Batch 4)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 223-229)

Após criar a fatura via RPC (linha 205), a função loga o sucesso e incrementa `processedCount`, mas **nunca invoca** `create-payment-intent-connect` para gerar boleto ou PIX. O aluno recebe uma fatura sem nenhum mecanismo de pagamento.

Comparando com `automated-billing` (linhas 520-558) que gera boleto explicitamente após criar a fatura, e com o fluxo de mensalidade (linhas 848-879) que faz o mesmo, esta função é a única que pula completamente a geração de pagamento.

Também não envia notificação ao aluno via `send-invoice-notification`.

**Severidade**: ALTA — cobranças órfãs são geradas mas o aluno não tem como pagar nem fica sabendo.

**Ação**: Após a criação da fatura (linha 223), adicionar:
1. Chamada a `create-payment-intent-connect` com hierarquia Boleto → PIX
2. Update da fatura com dados de pagamento
3. Chamada a `send-invoice-notification` com tipo `'invoice_created'`

### 107. process-cancellation não verifica is_paid_class antes de aplicar cobrança de cancelamento (Batch 3)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linhas 219-225)

A lógica de determinação de cobrança verifica se a aula é experimental (`is_experimental === true`) e aplica cobrança se o aluno cancelou tarde. Porém, **não verifica** `is_paid_class`. Se um professor agenda uma aula gratuita (`is_paid_class = false`) e o aluno cancela tarde, o sistema aplica cobrança baseada no preço do serviço para uma aula que deveria ser gratuita.

Isso é inconsistente com a regra de negócio: "aulas com `is_paid_class = false` nunca geram cobrança".

**Severidade**: MÉDIA — gera cobranças indevidas para aulas gratuitas canceladas tarde.

**Ação**: Adicionar verificação `classData.is_paid_class === false` junto com `is_experimental`:
```javascript
if (classData.is_experimental === true || classData.is_paid_class === false) {
  shouldCharge = false;
}
```

### 108. automated-billing fluxo tradicional nunca envia notificação ao aluno (Batch 3)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 511-566)

No fluxo tradicional (sem mensalidade), após criar a fatura e gerar pagamento, o `automated-billing` **nunca envia notificação** ao aluno via `send-invoice-notification`. Comparando com:
- `create-invoice` (linhas 531-548): envia notificação
- `processMonthlySubscriptionBilling` (linhas 882-893): envia notificação

O fluxo tradicional é o único que pula completamente a notificação, afetando todos os alunos sem mensalidade.

**Severidade**: ALTA — alunos com faturamento automatizado tradicional nunca recebem email de nova fatura.

**Relação**: Expande M36 (que cobria apenas o caso `skipBoletoGeneration`). O problema é mais amplo.

**Ação**: Adicionar chamada a `send-invoice-notification` após o bloco de geração de pagamento (após linha 558), similar ao fluxo de mensalidade.

---

## Nova Melhoria v5.7 (M45)

### M45. create-payment-intent-connect cria clientes Stripe duplicados entre plataforma e contas conectadas (Batch 6)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 297-315, 421-443)

Para pagamentos PIX (Direct Charges), a função cria um Stripe Customer **na conta conectada** do professor. Para pagamentos Boleto e Cartão (Destination Charges), cria um Customer **na plataforma**. Se um aluno paga uma fatura com PIX e outra com Boleto, terá dois registros de Customer no Stripe. Isso dificulta reconciliação, impede reutilização de métodos salvos e causa confusão em disputas.

**Ação**: Documentar como limitação conhecida da arquitetura híbrida (PIX Direct vs Boleto Destination). Avaliar migrar tudo para Direct Charges no futuro para unificar clientes.

---

## Novas Pontas Soltas v5.8 (#109-#113)

### 109. process-payment-failure-downgrade chama smart-delete-student com parâmetros incorretos — alunos nunca são removidos (Batch 1)

**Arquivo**: `supabase/functions/process-payment-failure-downgrade/index.ts` (linhas 142-153)
**Arquivo relacionado**: `supabase/functions/smart-delete-student/index.ts` (linhas 287-301)

A função `process-payment-failure-downgrade` chama `smart-delete-student` assim:

```javascript
body: {
  studentId: student.student_id,    // camelCase
  reason: 'payment_failure_downgrade'
}
```

Porém, `smart-delete-student` espera:

```javascript
const { student_id, teacher_id, relationship_id, force = false } = await req.json();
// Validação obrigatória (linha 290-301):
if (!student_id || !teacher_id || !relationship_id) {
  return Response({ success: false, error: 'Missing required fields...' }, { status: 400 });
}
```

Três problemas críticos:
1. `studentId` (camelCase) vs `student_id` (snake_case) — parâmetro nunca é lido
2. `teacher_id` não é passado — será `undefined`
3. `relationship_id` não é passado — será `undefined`

Resultado: **TODAS as chamadas retornam erro 400**, mas o `process-payment-failure-downgrade` ignora o corpo da resposta e apenas verifica `error` do `functions.invoke` (que só captura erros de rede, não erros HTTP 400). Os alunos excedentes NUNCA são removidos durante downgrade por falha de pagamento.

**Severidade**: CRÍTICA — professores com falha de pagamento mantêm alunos acima do limite do plano gratuito indefinidamente.

**Ação**: Corrigir a chamada para passar os 3 parâmetros obrigatórios em snake_case:

```javascript
body: {
  student_id: student.student_id,
  teacher_id: user.id,
  relationship_id: student.id, // ID do teacher_student_relationships
  force: true  // Necessário para pular verificação de aulas pendentes
}
```

### 110. handle-teacher-subscription-cancellation condiciona notificações a RESEND_API_KEY inexistente — emails nunca são enviados (Batch 3)

**Arquivo**: `supabase/functions/handle-teacher-subscription-cancellation/index.ts` (linhas 198-201)

A função condiciona o envio de notificações à existência da variável `RESEND_API_KEY`:

```javascript
if (Deno.env.get("RESEND_API_KEY")) {
  await sendNotifications(supabaseService, teacher_id, voidedInvoices, paidInvoices);
}
```

O sistema utiliza AWS SES (via `_shared/ses-email.ts`), não Resend. A variável `RESEND_API_KEY` provavelmente não existe no ambiente, o que significa que:
1. O professor NÃO recebe email sobre faturas canceladas automaticamente
2. Os alunos NÃO recebem email sobre suspensão de cobranças
3. Alunos com faturas pagas que precisam de estorno NÃO são informados

Além disso, a função `sendNotifications` (linhas 240-303) acessa `student.guardian_email` (campo que não existe em `profiles` — dados de responsável estão em `teacher_student_relationships`).

**Severidade**: ALTA — nenhuma parte afetada recebe comunicação sobre cancelamento de cobranças.

**Ação**:
1. Remover a condicional `RESEND_API_KEY` — chamar `sendNotifications` sempre
2. Corrigir `student.guardian_email` para buscar de `teacher_student_relationships.student_guardian_email`

### 111. process-expired-subscriptions usa FK joins que falham no Deno — subscrições expiradas podem não ser processadas (Batch 5)

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (linhas 38-57)

A função usa FK joins na query principal:

```javascript
.from('user_subscriptions')
.select(`
  ...,
  subscription_plans!inner (...),
  profiles!user_id (...)
`)
```

Este padrão de FK join (`tabela!coluna_fk`) é conhecido por falhar em edge functions Deno devido a problemas de schema cache. Se falhar, **nenhuma subscrição expirada será processada** — professores com subscrições expiradas continuam com acesso ao módulo financeiro.

**Severidade**: MÉDIA — se o schema cache invalidar, o processamento inteiro para.

**Ação**: Substituir por queries sequenciais:
1. Buscar `user_subscriptions` com filtros de status e data
2. Para cada subscrição, buscar `subscription_plans` e `profiles` separadamente

### 112. handle-teacher-subscription-cancellation não cancela Payment Intents ativos no Stripe — alunos podem pagar faturas já canceladas (Batch 4)

**Arquivo**: `supabase/functions/handle-teacher-subscription-cancellation/index.ts` (linhas 116-163)

Quando uma fatura pendente é cancelada (status `cancelada_por_professor_inativo`), a função anula a Invoice no Stripe (`stripe.invoices.voidInvoice`) mas **não cancela o Payment Intent** associado (campo `stripe_payment_intent_id`).

Se a fatura tinha um boleto ou PIX ativo, o aluno pode pagar antes do vencimento. O pagamento será processado pelo webhook, que tentará atualizar a fatura (agora com status `cancelada_por_professor_inativo`). Dependendo do handler, isso pode:
1. Reverter o status para `paid`/`paga` (criando fatura "zumbi")
2. Ignorar silenciosamente (dinheiro do aluno preso no Stripe sem reconciliação)

**Severidade**: ALTA — risco de dinheiro preso ou faturas canceladas reaparecendo como pagas.

**Ação**: Após atualizar o status da fatura local, cancelar o Payment Intent no Stripe:

```javascript
if (invoice.stripe_payment_intent_id) {
  try {
    await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id);
  } catch (e) {
    // Log but don't fail -- PI may already be cancelled or succeeded
  }
}
```

### 113. check-pending-boletos usa FK join e fallback "Premium" hardcoded (Batch 5)

**Arquivo**: `supabase/functions/check-pending-boletos/index.ts` (linhas 35-42)

A função usa FK join na query principal e se `subscription_plans` for null (plano deletado ou órfão), o acesso a `subscription.subscription_plans?.name` pode retornar `undefined`, resultando no fallback hardcoded `"Premium"` — potencialmente enganoso para o usuário.

**Severidade**: MÉDIA — FK join pode falhar; fallback "Premium" pode ser incorreto.

**Ação**: Substituir FK join por query sequencial e usar nome real do plano em vez de hardcoded "Premium".

---

## Nova Melhoria v5.8 (M46)

### M46. create-invoice não tem validação de whitelist para invoice_type — tipos inválidos podem ser inseridos (Batch 3)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 197)

O campo `invoice_type` é aceito diretamente do body sem validação. Os tipos válidos no sistema são: `'regular'`, `'manual'`, `'automated'`, `'monthly_subscription'`, `'prepaid_class'`, `'cancellation'`, `'orphan_charges'`. Tipos inválidos podem quebrar badges de interface, filtros e lógica de faturamento.

**Ação**: Adicionar validação de whitelist antes da inserção:

```javascript
const VALID_INVOICE_TYPES = ['regular', 'manual', 'automated', 'monthly_subscription', 'prepaid_class', 'cancellation', 'orphan_charges'];
const invoiceType = body.invoice_type || 'manual';
if (!VALID_INVOICE_TYPES.includes(invoiceType)) {
  throw new Error(`Tipo de fatura inválido: ${invoiceType}`);
}
```

---

## Pontas Soltas v5.9 (#114-#118)

### 114. change-payment-method usa FK joins que falham no Deno (Batch 5)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 47-51)

A função usa FK joins na query de faturas:

```javascript
.select(`
  *,
  student:profiles!invoices_student_id_fkey(id, name, email),
  teacher:profiles!invoices_teacher_id_fkey(id, name)
`)
```

Este padrão é inconsistente com a regra do projeto de usar queries sequenciais em edge functions Deno. Se o schema cache invalidar, o aluno não conseguirá mudar o método de pagamento de nenhuma fatura.

**Severidade**: ALTA — funcionalidade crítica para o fluxo de pagamento do aluno.

**Ação**: Substituir por queries sequenciais: buscar fatura, depois buscar perfis do aluno e professor separadamente.

### 115. change-payment-method autorização de responsável/guardião completamente quebrada (Batch 1)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 72-108)

A verificação de autorização para guardiões tem dois bugs críticos:

1. **Linha 84**: A query encadeia `.eq('responsible_id', invoice.student_id).eq('responsible_id', user.id)` — dois filtros `eq` no mesmo campo `responsible_id`. Isso só retorna resultado se `invoice.student_id === user.id`, que já foi verificado por `isStudent`. Guardiões cujo ID difere do `student_id` da fatura NUNCA passam.

2. **Linhas 95-108**: O bloco `isResponsible` verifica `if (invoice.student_id === user.id)` — idêntica à verificação `isStudent` (linha 68). Isso é redundante e nunca ativa `isResponsible` para um caso diferente.

Resultado: **Responsáveis e guardiões de dependentes NÃO conseguem alterar o método de pagamento** de faturas emitidas para seus dependentes. Apenas o próprio aluno (student_id da fatura) consegue.

**Severidade**: ALTA — responsáveis não podem gerenciar pagamentos de dependentes.

**Ação**: Reescrever a lógica de autorização:
1. Verificar se `user.id === invoice.student_id` (aluno direto)
2. Verificar se o usuário é responsável de algum dependente via `dependents.responsible_id = user.id` E a fatura pertence ao responsável
3. Verificar via `teacher_student_relationships` se há vínculo de responsável

### 116. check-subscription-status usa FK join em checkNeedsStudentSelection (Batch 5)

**Arquivo**: `supabase/functions/check-subscription-status/index.ts` (linhas 30-39)

A função auxiliar `checkNeedsStudentSelection` usa FK join:

```javascript
.select(`
  id, student_id, student_name, created_at,
  profiles!teacher_student_relationships_student_id_fkey(name, email)
`)
```

Se o schema cache invalidar, o modal de seleção de alunos no downgrade não aparecerá. O professor poderá fazer downgrade sem remover alunos excedentes, mantendo acesso acima do limite do plano.

**Severidade**: MÉDIA — se falhar, professores mantêm alunos além do limite.

**Ação**: Substituir por queries sequenciais.

### 117. create-subscription-checkout não cancela Payment Intents ao mudar de plano (Batch 4)

**Arquivo**: `supabase/functions/create-subscription-checkout/index.ts` (linhas 213-249)

Quando o professor muda para um plano sem módulo financeiro, a função cancela faturas pendentes locais (`status: 'cancelada_por_mudanca_plano'`) mas **não cancela os Payment Intents** no Stripe.

Mesmo padrão de bug de #112: boletos e PIX ativos permanecem pagáveis. Se o aluno pagar, o webhook processará o pagamento e potencialmente reverterá o status da fatura.

**Severidade**: ALTA — risco de pagamentos em faturas canceladas por mudança de plano.

**Ação**: Antes de cancelar faturas, iterar sobre cada uma, buscar `stripe_payment_intent_id`, e cancelar no Stripe:

```javascript
for (const invoice of pendingInvoices) {
  if (invoice.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(invoice.stripe_payment_intent_id);
    } catch (e) { /* log */ }
  }
}
```

### 118. validate-business-profile-deletion sem autenticação (Batch 2)

**Arquivo**: `supabase/functions/validate-business-profile-deletion/index.ts` (linhas 9-25)

A função aceita `business_profile_id` do body sem verificar autenticação do usuário. Qualquer requisição autenticada pode consultar informações de qualquer business profile (contagem de faturas e alunos vinculados).

Embora não exponha dados sensíveis diretamente, viola o princípio de menor privilégio e permite enumeração de perfis de negócios.

**Severidade**: BAIXA — exposição limitada, mas deveria validar ownership.

**Ação**: Adicionar autenticação e verificar que o `business_profile_id` pertence ao usuário autenticado (`user_id = auth.uid()`).

---

## Melhorias v5.9 (M47-M48)

### M47. handle-student-overage insere em tabela student_overage_charges potencialmente inexistente (Batch 6)

**Arquivo**: `supabase/functions/handle-student-overage/index.ts` (linhas 131-139)

A função insere registros em `student_overage_charges`, mas esta tabela não aparece no schema fornecido pelo banco de dados. Se a tabela não existir, o insert falha silenciosamente (o erro é logado mas não interrompe o fluxo).

**Ação**: Verificar existência da tabela. Se não existir, criar migration. Se existir, documentar no schema.

### M48. end-recurrence não cancela faturas prepaid de aulas deletadas (Batch 4)

**Arquivo**: `supabase/functions/end-recurrence/index.ts` (linhas 67-73)

Quando a recorrência é encerrada, aulas futuras materializadas são deletadas. Porém, se alguma dessas aulas já tinha fatura prepaid gerada (via `create-invoice`), a fatura permanece ativa e cobrável para uma aula que não existe mais.

**Ação**: Antes de deletar as aulas, buscar faturas com `class_id` correspondente e status `pendente`, e cancelá-las.

---

## Pontas Soltas v5.10 (#119-#123)

### 119. create-payment-intent-connect usa 3 FK joins simultâneos — função central de pagamento frágil (Batch 5)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 37-51)

A função usa **3 FK joins** simultâneos na query principal:

```javascript
.select(`
  *,
  student:profiles!invoices_student_id_fkey(...),
  teacher:profiles!invoices_teacher_id_fkey(...),
  business_profile:business_profiles!invoices_business_profile_id_fkey(...)
`)
```

Esta função é o ponto central de geração de pagamentos (Boleto, PIX, Cartão) e é chamada por:
- `create-invoice` (faturas manuais/prepaid)
- `automated-billing` (faturas automatizadas)
- `generate-boleto-for-invoice` (geração manual de boleto)
- `change-payment-method` (troca de método de pagamento)

Se o schema cache invalidar, **NENHUM pagamento será gerado** em todo o sistema.

**Severidade**: ALTA — função crítica que é ponto único de falha para todos os pagamentos.

**Ação**: Refatorar para 4 queries sequenciais: invoices, profiles (aluno), profiles (professor), business_profiles.

### 120. send-class-reminders usa FK joins em classes e class_participants (Batch 5)

**Arquivo**: `supabase/functions/send-class-reminders/index.ts` (linhas 28-43, 85-97)

A função usa dois FK joins implícitos (`class_services`, `profiles`). Se falharem, **nenhum lembrete de aula será enviado** nas próximas 24h.

**Severidade**: MÉDIA — impacta experiência do aluno mas não impacta financeiro.

**Ação**: Refatorar para queries sequenciais.

### 121. generate-boleto-for-invoice usa FK joins e não tem autenticação (Batch 2)

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (linhas 34-45, 22-29)

Dois problemas:

1. **FK joins** (linhas 38-43): `profiles!invoices_student_id_fkey` e `profiles!invoices_teacher_id_fkey`.

2. **Sem autenticação** (linhas 22-29): A função usa `SUPABASE_SERVICE_ROLE_KEY` sem verificar quem está chamando. Qualquer requisição pode gerar boletos para qualquer `invoice_id`, permitindo enumeração de faturas, abuso de API Stripe e exposição de dados pessoais (CPF, endereço).

**Severidade**: ALTA — exposição de dados pessoais e abuso potencial de API Stripe.

**Ação**: Adicionar autenticação (verificar student_id ou teacher_id da fatura) e refatorar FK joins.

### 122. cancel-payment-intent não verifica status do PI antes de cancelar (Batch 4)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 138-166)

A função tenta cancelar o Payment Intent sem antes verificar seu status. Se o PI estiver `succeeded` (aluno pagou momentos antes), o cancel falha mas a função marca a fatura como `payment_origin: 'manual'`. O professor pensa que marcou manualmente, enquanto o Stripe já transferiu o dinheiro — risco de cobrança dupla.

**Severidade**: MÉDIA — dados inconsistentes, risco de cobrança dupla manual.

**Ação**: Fazer `stripe.paymentIntents.retrieve()` antes de cancelar. Se `succeeded`, marcar `payment_origin: 'automatic'`.

### 123. process-orphan-cancellation-charges usa FK joins em class_participants e profiles (Batch 5)

**Arquivo**: `supabase/functions/process-orphan-cancellation-charges/index.ts` (linhas 44-56)

FK join `profiles!class_participants_student_id_fkey` na query principal. Se o schema cache invalidar, nenhuma cobrança órfão será processada.

**Severidade**: MÉDIA — mesma classe de bugs de FK join.

**Ação**: Refatorar para queries sequenciais.

---

## Melhorias v5.10 (M49-M51)

### M49. send-boleto-subscription-notification usa plan_name fallback "Premium" hardcoded (Batch 6)

**Arquivo**: `supabase/functions/send-boleto-subscription-notification/index.ts` (linha 294)

Se o caller não passar `plan_name`, o email exibirá "Premium" independente do plano real.

**Ação**: Buscar nome do plano via query ao banco ou rejeitar requisição sem o campo.

### M50. cancel-payment-intent usa status 'paid' em inglês — confirmação de #98 (Batch 3)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 111, 172)

Confirmação: ambos os branches usam `status: 'paid'` (inglês). Correção deve ser aplicada em AMBOS os updates.

### M51. Webhook payment_intent.succeeded apaga boleto_url e pix_copy_paste — confirmação de #86 (Batch 4)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 474-481)

Confirmação do código exato: `pix_qr_code`, `pix_copy_paste`, `boleto_url`, `linha_digitavel`, `barcode`, `stripe_hosted_invoice_url` são todos zerados. Correção: remover NULLs, manter apenas `pix_expires_at: null` e `boleto_expires_at: null`.

### M52. auto-verify-pending-invoices retorna HTTP 500 em caso de erro — inconsistente com padrão cron (Batch 6)

**Arquivo**: `supabase/functions/auto-verify-pending-invoices/index.ts` (linhas 157-160)

O catch geral retorna `status: 500`. Para funções invocadas via cron, o padrão do projeto é `200+success:false`.

**Ação**: Alterar para `status: 200` com body `{ success: false, error: message }`.

---

## Pontas Soltas v5.11 (#124-#126)

### 124. automated-billing copia boleto_url para stripe_hosted_invoice_url em 3 locais — emails automatizados com rótulo errado (Batch 4)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 537, 864, 979)

Em três updates de faturas, o `automated-billing` copia `paymentResult.boleto_url` para `stripe_hosted_invoice_url`. O `send-invoice-notification` então renderiza "Pagar com Cartão" apontando para URL de boleto. Extensão direta de M38. A correção deve ser aplicada em ambos os arquivos simultaneamente.

**Severidade**: MÉDIA

**Ação**: Em todos os 3 updates, NÃO copiar `boleto_url` para `stripe_hosted_invoice_url`. Manter `stripe_hosted_invoice_url: null`.

### 125. create-payment-intent-connect referencia campo inexistente guardian_name em profiles (Batch 6)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 308, 433)

O código referencia `invoice.student?.guardian_name`, que não existe na tabela `profiles`. O fallback `invoice.student?.name` funciona, mas ignora o nome do responsável. A função já calcula `finalPayerName` (linha 268) corretamente.

**Severidade**: BAIXA

**Ação**: Substituir `invoice.student?.guardian_name || invoice.student?.name` por `finalPayerName` nas linhas 308 e 433.

### 126. check-overdue-invoices usa status 'overdue' em inglês em vez de 'vencida' (Batch 3)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linha 58)

A função usa `.update({ status: "overdue" })` em vez de `"vencida"`. Deve ser corrigida junto com #104 (webhooks). Se #104 for corrigido sem incluir esta função, haverá dois status diferentes para faturas vencidas.

**Severidade**: MÉDIA

**Ação**: Alterar `status: "overdue"` para `status: "vencida"`. Coordenar com #104.

---

## Pontas Soltas v5.13 (#127-#131)

### 127. smart-delete-student usa FK joins `classes!inner(teacher_id)` (Batch 5)

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (linhas 132-136, 160-164)

A função `checkPendingClasses` usa a sintaxe de FK join em dois locais:

```javascript
.select(`id, status, classes!inner(teacher_id)`)
.eq('classes.teacher_id', teacherId)
```

FK joins falham intermitentemente no Deno por cache de schema. Se falharem, a verificação de aulas pendentes retorna erro silencioso (o erro é logado mas `studentPending` cai para 0), permitindo a exclusão de um aluno que **ainda tem aulas pendentes**.

**Severidade**: ALTA

**Ação**: Refatorar para queries sequenciais — buscar `class_participants` por `student_id` com status pendente/confirmado, depois filtrar por `teacher_id` via query separada em `classes`.

### 128. smart-delete-student sem autenticação — qualquer usuário pode deletar alunos de outro professor (Batch 1)

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (linhas 274-303)

A função não verifica o token de autenticação. Aceita `teacher_id` diretamente do corpo da requisição sem validar se o chamador é realmente aquele professor. Qualquer usuário autenticado (ou função interna) pode passar qualquer `teacher_id` e excluir alunos de outro professor.

A função é chamada por:
- Frontend (via `supabaseClient.functions.invoke`)
- `handle-plan-downgrade-selection` (via `functions.invoke`)
- `process-payment-failure-downgrade` (já documentado em #109)

**Severidade**: ALTA (risco de segurança)

**Ação**: Adicionar verificação de `auth.getUser(token)` e validar que `teacher_id` do body corresponde ao `user.id` autenticado. Para chamadas internas (server-to-server via service_role), aceitar também `service_role`.

### 129. handle-plan-downgrade-selection audit_logs com colunas inexistentes — logs silenciosamente perdidos (Batch 3)

**Arquivo**: `supabase/functions/handle-plan-downgrade-selection/index.ts` (linhas 29-44, 97-104, 226-231, 286-296)

A função `logAuditEvent` insere em `audit_logs` usando colunas que **não existem na tabela**:

- **Colunas usadas no código**: `user_id`, `action`, `details`, `metadata`
- **Colunas reais da tabela**: `actor_id`, `operation`, `table_name`, `record_id`, `old_data`, `new_data`, `target_teacher_id`

Resultado: TODOS os 3 inserts de auditoria (`PLAN_DOWNGRADE_INITIATED`, `STUDENT_DELETED_DOWNGRADE`, `PLAN_DOWNGRADE_COMPLETED`) falham silenciosamente. Nenhum registro de downgrade de plano é salvo no log de auditoria, tornando impossível rastrear quem excluiu alunos e quando.

**Severidade**: ALTA

**Ação**: Corrigir o mapeamento de colunas:
- `user_id` → `actor_id`
- `action` → `operation`
- Adicionar `table_name: 'user_subscriptions'`, `record_id` (UUID do subscription ou user), `target_teacher_id: userId`
- `details`/`metadata` → serializar em `new_data` (jsonb)

### 130. validate-payment-routing cria e deleta faturas reais no banco (Batch 6)

**Arquivo**: `supabase/functions/validate-payment-routing/index.ts` (linhas 245-264)

O "Teste 5" da função de validação **insere uma fatura real** no banco de dados e depois tenta apagar. Se a função falhar entre o insert e o delete (timeout, erro de rede), uma fatura órfã de R$1.00 fica no sistema com descrição "Teste de validação de roteamento".

Além disso, a função usa FK join na linha 108 (`profiles:student_id(...)`) — mesmo padrão problemático documentado nas demais pontas.

**Severidade**: MÉDIA

**Ação**: Substituir o insert/delete real por uma validação dry-run (ex: verificar se o RLS permitiria o insert via query de permissão, sem inserir dados reais). Refatorar FK join para query sequencial.

### 131. cancel-subscription usa `.single()` em lookup de assinatura (Batch 5)

**Arquivo**: `supabase/functions/cancel-subscription/index.ts` (linha 67)

```javascript
.eq('status', 'active')
.single();
```

Se o professor não tiver assinatura ativa, `.single()` lança exceção e retorna HTTP 500. Deveria usar `.maybeSingle()` e retornar mensagem amigável.

**Severidade**: BAIXA

**Ação**: Trocar para `.maybeSingle()` e tratar cenário de assinatura inexistente com mensagem clara (HTTP 404).

---

## Pontas Soltas v5.14 (#132-#137) — ✅ TODAS IMPLEMENTADAS

### 132. create-student sem autenticação — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/create-student/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

A função aceitava `teacher_id` diretamente do corpo da requisição sem verificação de autenticação. Qualquer requisição HTTP podia criar alunos vinculados a qualquer professor, incluindo criação de usuários em `auth.users`, relacionamentos, cobranças e envio de emails.

**Correção aplicada**: Adicionado `auth.getUser(token)` no início da função e validação `authUser.id !== body.teacher_id` retornando HTTP 403.

### 133. update-student-details sem autenticação — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/update-student-details/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

A função aceitava `teacher_id` do body sem verificar autenticação, permitindo modificação de dados financeiros (billing_day, CPF, business_profile_id) de alunos de qualquer professor.

**Correção aplicada**: Mesmo padrão do #132 — `auth.getUser(token)` + validação `authUser.id !== body.teacher_id`.

### 134. create-dependent FK join `subscription_plans(student_limit, slug)` — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/create-dependent/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

FK join `.select('plan_id, subscription_plans(student_limit, slug)')` refatorado para duas queries sequenciais: buscar `user_subscriptions`, depois `subscription_plans` separadamente.

### 135. delete-dependent FK joins `classes!inner(class_date, status)` — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/delete-dependent/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

Dois FK joins (`classes!inner(class_date, status)` e `classes!inner(class_date)`) refatorados para queries sequenciais: buscar `class_participants`, depois `classes` por array de IDs.

### 136. manage-class-exception FK join `dependents!class_participants_dependent_id_fkey` — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/manage-class-exception/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

FK join de autorização de responsável refatorado para queries sequenciais: buscar `class_participants` com `dependent_id`, depois `dependents` separadamente para verificar `responsible_id`.

### 137. manage-future-class-exceptions FK join idêntico ao #136 — ✅ IMPLEMENTADO

**Arquivo**: `supabase/functions/manage-future-class-exceptions/index.ts`
**Status**: ✅ Implementado e deployado em 2026-02-14

Mesma correção do #136 aplicada.

### Confirmação 1: verify-payment-status usa `.single()` em lookup de fatura (já coberto por #102)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linha 40)

```javascript
.eq("id", invoice_id)
.single();
```

Se o `invoice_id` não existir, `.single()` lança exceção e retorna HTTP 500. Este padrão já está coberto pela ponta #102 (autenticação ausente) — a correção de #102 também deve incluir a troca para `.maybeSingle()`.

**Ação**: Incluir na correção de #102 (Batch 1). Nenhuma nova ponta necessária.

### Confirmação 2: Cron jobs usam ANON_KEY para funções com verify_jwt = true (padrão aceito)

**Arquivos**: `supabase/functions/setup-billing-automation/index.ts`, `supabase/functions/setup-expired-subscriptions-automation/index.ts`

Ambos os cron jobs enviam `SUPABASE_ANON_KEY` como Bearer token para `automated-billing` e `process-expired-subscriptions`, que não estão listadas em `config.toml` (defaulting to `verify_jwt = true`). Isso funciona porque o anon key é um JWT válido e essas funções usam `SUPABASE_SERVICE_ROLE_KEY` internamente (não chamam `auth.getUser()`). O padrão é frágil mas funcional.

**Recomendação**: Adicionar ao `config.toml`:
```toml
[functions.automated-billing]
verify_jwt = false

[functions.process-expired-subscriptions]
verify_jwt = false
```

### Confirmação 3: webhook-stripe-subscriptions segue padrões já documentados

**Arquivo**: `supabase/functions/webhook-stripe-subscriptions/index.ts`

Embora categorizada como fora do escopo principal de cobrança híbrida (trata assinaturas do professor, não dos alunos), a função apresenta os mesmos padrões de pontas soltas já documentados:

1. **Retry loops desnecessários** (linhas 420, 513, 564, 601): Retorna HTTP 400 para "user not found", causando retries desnecessários do Stripe. Padrão idêntico ao #77 (webhook-stripe-connect).
2. **`.single()` em lookup de plano** (linha 346): Risco de exceção se o plano não existir. Padrão idêntico ao #49.
3. **HTTP 500 no catch global** (linha 715): Deveria retornar HTTP 200 com `success: false`. Padrão idêntico ao #76.

**Ação**: Nenhuma nova ponta necessária — extensões naturais de #49, #76 e #77. Incluir na implementação dos respectivos batches como aplicação transversal dos mesmos padrões. Recomendado como item pós-implementação (Batch 6).

---

## Pontas Soltas v5.15 (#138-#141)

### 138. request-class não persiste `is_paid_class` — cobranças indesejadas no modelo prepaid (Fase 3)

**Arquivo**: `supabase/functions/request-class/index.ts` (linhas 135-148)

```javascript
const { data: newClass, error: insertError } = await supabase
  .from('classes')
  .insert({
    teacher_id: teacherId,
    class_date: new Date(datetime).toISOString(),
    duration_minutes: service.duration_minutes,
    service_id: serviceId,
    status: 'pendente',
    notes: notes?.trim() || null,
    is_experimental: false,
    is_group_class: false
    // FALTA: is_paid_class não definido — default do DB é TRUE
  })
```

A função `request-class` é o **terceiro caminho de criação de aulas** (junto com `handleClassSubmit` e `materialize-virtual-class`), mas não define `is_paid_class` no insert. Como o default do banco é `true`, aulas solicitadas por alunos e confirmadas pelo professor podem disparar cobranças imediatas no modelo `prepaid` sem que o professor tenha decidido se a aula é paga.

**Severidade**: ALTA (impacto financeiro direto)

**Ação**:
1. Adicionar `is_paid_class: false` como default seguro no insert (aulas solicitadas por alunos não devem gerar cobrança automaticamente)
2. OU: Adicionar parâmetro opcional no payload para o professor definir na confirmação
3. Integrar à Fase 3 do roadmap, alinhando com `handleClassSubmit` (#62) e `materialize-virtual-class` (#63)

### 139. update-dependent usa `.single()` após update — exceção se dependent não existir (Batch 8)

**Arquivo**: `supabase/functions/update-dependent/index.ts` (linhas 116-121)

```javascript
const { data: updatedDependent, error: updateError } = await supabaseAdmin
  .from('dependents')
  .update(updateData)
  .eq('id', body.dependent_id)
  .select()
  .single();
```

Embora a função já valide existência antes do update (linha 70-74 com `.maybeSingle()`), o `.single()` no resultado do update pode lançar exceção em condições de corrida (dependent deletado entre a verificação e o update).

**Severidade**: BAIXA (race condition improvável)

**Ação**: Trocar para `.maybeSingle()` e tratar cenário de resultado vazio com HTTP 404.

### 140. create-connect-onboarding-link retorna HTTP 500 genérico no catch (Batch 8)

**Arquivo**: `supabase/functions/create-connect-onboarding-link/index.ts` (linhas 96-103)

```javascript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logStep("ERROR in create-onboarding-link", { message: errorMessage });
  return new Response(JSON.stringify({ error: errorMessage }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 500,
  });
}
```

Erros de validação (account not found, missing params) retornam HTTP 500 em vez de códigos específicos (400, 404). Padrão idêntico ao M52.

**Severidade**: BAIXA

**Ação**: Diferenciar erros de validação (HTTP 400/404) de erros internos (HTTP 500).

### 141. list-subscription-invoices retorna HTTP 500 genérico no catch (Batch 8)

**Arquivo**: `supabase/functions/list-subscription-invoices/index.ts` (linhas 112-119)

```javascript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logStep("ERROR in list-subscription-invoices", { message: errorMessage });
  return new Response(JSON.stringify({ error: errorMessage }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 500,
  });
}
```

Padrão idêntico ao #140 e M52.

**Severidade**: BAIXA

**Ação**: Diferenciar erros de validação de erros internos. Nota: a autenticação já é tratada corretamente com HTTP 401 (linhas 42-66).

---

## Pontas Soltas v5.16 (#142-#144)

### 142. check-business-profile-status — `stripe_connect_id` não validado antes de chamar Stripe API (Batch 8)

**Arquivo**: `supabase/functions/check-business-profile-status/index.ts` (linhas 47-57)

```javascript
const { stripe_connect_id } = await req.json();
// ...
const account = await stripe.accounts.retrieve(stripe_connect_id);
```

A função recebe `stripe_connect_id` do corpo da requisição e chama `stripe.accounts.retrieve()` **antes** de validar que o ID pertence ao usuário autenticado. A validação de ownership só ocorre na linha 76 (`pending_business_profiles WHERE user_id = user.id`), após a chamada ao Stripe. Qualquer usuário autenticado pode consultar o status de onboarding de qualquer conta Stripe Connect, expondo informações como `charges_enabled`, `payouts_enabled` e `details_submitted`.

**Severidade**: MÉDIA (vazamento de informação)

**Ação**: Mover a validação de ownership para **antes** da chamada Stripe. Buscar `pending_business_profiles` ou `stripe_connect_accounts` filtrando por `user_id = user.id` E `stripe_connect_id` antes de chamar `stripe.accounts.retrieve()`. Rejeitar com HTTP 403 se não pertencer ao usuário.

### 143. create-connect-account — `.single()` para check de account existente (Batch 8)

**Arquivo**: `supabase/functions/create-connect-account/index.ts` (linhas 72-76)

```javascript
const { data: existingAccount } = await supabaseClient
  .from("stripe_connect_accounts")
  .select("*")
  .eq("payment_account_id", payment_account_id)
  .single();
```

Usa `.single()` para verificar se já existe uma conta Stripe Connect vinculada. Quando não existe (caso normal de primeira criação), `.single()` retorna erro. O código funciona porque apenas `data` é destructured (erro ignorado), mas `.maybeSingle()` é semanticamente correto e evita logs de erro desnecessários.

**Severidade**: BAIXA (funcional mas semanticamente incorreto)

**Ação**: Trocar `.single()` por `.maybeSingle()`.

### 144. send-class-confirmation-notification — `.single()` em 3 lookups sem tratamento explícito de erro (Batch 8)

**Arquivo**: `supabase/functions/send-class-confirmation-notification/index.ts` (linhas 41, 65, 79)

```javascript
// Linha 41: student profile
.eq("id", payload.student_id).single();

// Linha 65: dependent
.eq("id", payload.dependent_id).single();

// Linha 79: relationship
.eq("student_id", payload.student_id).single();
```

Três lookups usam `.single()`:
1. **Linha 41** (student): Tratado corretamente — `if (studentError || !student?.email)` captura o erro.
2. **Linha 65** (dependent): Erro ignorado — `const { data: dependent }` sem check de erro. Funciona mas `.maybeSingle()` é mais correto.
3. **Linha 79** (relationship): Erro ignorado — `const { data: relationship }` sem check de erro. Funciona mas `.maybeSingle()` é mais correto, pois a ausência de relationship é um cenário válido (aluno sem responsável).

**Severidade**: BAIXA

**Ação**: Trocar `.single()` por `.maybeSingle()` nas linhas 65 e 79. Linha 41 já tem tratamento adequado.

### 145. check-stripe-account-status — `.single()` em ownership check + HTTP 500 genérico (Batch 8)

**Arquivo**: `supabase/functions/check-stripe-account-status/index.ts` (linha 59)

```javascript
.eq("stripe_account_id", account_id)
.eq("teacher_id", user.id)
.single();
```

Usa `.single()` para verificar ownership da conta Stripe Connect. Se a conta não existir no banco, `.single()` lança exceção capturada pelo catch genérico → HTTP 500 com mensagem técnica em vez de 404 semântico. Adicionalmente, o catch retorna HTTP 500 genérico para todos os erros.

**Severidade**: BAIXA

**Ação**: Trocar `.single()` por `.maybeSingle()`. Adicionar check explícito para retornar 404 com mensagem amigável. Adicionar tratamento específico no catch para erros de validação (400) vs erros internos (500).

### 146. create-business-profile — sem verificação de duplicatas (Batch 6)

**Arquivo**: `supabase/functions/create-business-profile/index.ts`

A função cria uma conta Stripe Connect Express e um `pending_business_profiles` sem verificar se já existe um pending profile para o mesmo usuário. Se o usuário clicar no botão de criação múltiplas vezes (ou recarregar a página), múltiplas contas Stripe Connect serão criadas e ficará órfãs no Stripe, gerando custos e confusão administrativa.

**Severidade**: MÉDIA (contas Stripe órfãs com potencial impacto financeiro)

**Ação**: Antes de criar a conta Stripe, verificar se já existe um `pending_business_profiles` para o `user_id`. Se existir, retornar o onboarding link existente (regenerando via `stripe.accountLinks.create`) em vez de criar nova conta.

### 147. customer-portal — busca por email frágil + HTTP 500 genérico (Batch 8)

**Arquivo**: `supabase/functions/customer-portal/index.ts` (linha 49)

```javascript
const customers = await stripe.customers.list({ email: user.email, limit: 1 });
```

Busca o Stripe Customer por email em vez de usar `stripe_customer_id` do profile do usuário. Se o email do usuário mudar no Supabase Auth, o portal apontará para o customer errado ou não encontrará nenhum. O catch retorna HTTP 500 genérico.

**Severidade**: BAIXA (funcional na maioria dos casos, mas frágil)

**Ação**: Buscar `stripe_customer_id` do profile do usuário no Supabase, e usar diretamente `stripe.billingPortal.sessions.create({ customer: stripe_customer_id })`. Fallback para busca por email se `stripe_customer_id` for null. Adicionar tratamento específico no catch.

### Funções Fora de Escopo (27 funções — auditadas v5.17)

As seguintes funções foram auditadas e classificadas como fora do escopo do plano de cobrança híbrida por serem utilitárias, de setup, de notificação sem impacto financeiro, ou de infraestrutura:

| Categoria | Funções |
|-----------|---------|
| Setup/Cron | `setup-billing-automation`, `setup-class-reminders-automation`, `setup-expired-subscriptions-automation`, `setup-invoice-auto-verification`, `setup-orphan-charges-automation` |
| Notificação (sem billing) | `send-class-request-notification`, `send-class-report-notification`, `send-material-shared-notification`, `send-student-invitation`, `send-password-reset` |
| Auth/Onboarding | `create-teacher`, `resend-confirmation`, `resend-student-invitation`, `check-email-availability`, `check-email-confirmation` |
| Stripe Infra | `refresh-stripe-connect-account`, `stripe-events-monitor` |
| Dados/Arquivamento | `archive-old-data`, `fetch-archived-data`, `audit-logger` |
| Segurança | `security-rls-audit` |
| Consulta | `list-business-profiles`, `list-pending-business-profiles`, `get-teacher-availability`, `generate-teacher-notifications` |
| Dev/Test | `dev-seed-test-data`, `validate-monthly-subscriptions` |

Nenhuma ponta solta adicional identificada nestas funções dentro do escopo de cobrança híbrida.

---

## Tabela de Cobertura Completa (v5.17)

| Função | Pontas Documentadas | Cobertura |
|--------|-------------------|-----------|
| create-invoice | #24, #25, #57, #72, #78, M28, M35, M38 | ✅ |
| automated-billing | #31, #35, #36, #40, #52, #58, #60, #68, #69, #75, #76, #85, #88, #92, #93, #108, #124 | ✅ |
| process-cancellation | #30, #59, #80, #83, #84, #96, #107 | ✅ |
| webhook-stripe-connect | #49, #64, #74, #77, #86, #87, #104, #184, #185, M51 | ✅ |
| cancel-payment-intent | ~~#98~~, #122, M44, M50 | ✅ |
| create-payment-intent-connect | #119, #125, M45 | ✅ |
| change-payment-method | #114, #115 | ✅ |
| generate-boleto-for-invoice | #103, #121 | ✅ |
| check-overdue-invoices | #41, #47, #56, #71, #81, #95, #126 | ✅ |
| auto-verify-pending-invoices | #102, M52 | ✅ |
| verify-payment-status | #102 | ✅ |
| send-invoice-notification | #32, #53, #54, #73, #91, #99, #186 | ✅ |
| send-cancellation-notification | #43, M33 | ✅ (v5.14) |
| handle-teacher-subscription-cancellation | #110, #112 | ✅ |
| process-payment-failure-downgrade | #109 | ✅ |
| process-expired-subscriptions | #111 | ✅ |
| create-subscription-checkout | #117 | ✅ |
| check-subscription-status | #116 | ✅ |
| check-pending-boletos | #113 | ✅ |
| process-orphan-cancellation-charges | #105, #106, #123 | ✅ |
| validate-business-profile-deletion | #118 | ✅ |
| send-class-reminders | #120 | ✅ |
| send-boleto-subscription-notification | M49 | ✅ |
| end-recurrence | M48 | ✅ |
| handle-student-overage | M47, #167 | ✅ |
| materialize-virtual-class | #61, #70 | ✅ |
| webhook-stripe-subscriptions | Extensões de #49, #76, #77 | ✅ (Confirmação 3) |
| smart-delete-student | #127, #128 | ✅ (v5.13) |
| handle-plan-downgrade-selection | #129 | ✅ (v5.13) |
| validate-payment-routing | #130 | ✅ (v5.13) |
| cancel-subscription | #131 | ✅ (v5.13) |
| create-student | #132 | ✅ IMPLEMENTADO (v5.14) |
| update-student-details | #133 | ✅ IMPLEMENTADO (v5.14) |
| create-dependent | #134 | ✅ IMPLEMENTADO (v5.14) |
| delete-dependent | #135 | ✅ IMPLEMENTADO (v5.14) |
| manage-class-exception | #136 | ✅ IMPLEMENTADO (v5.14) |
| manage-future-class-exceptions | #137 | ✅ IMPLEMENTADO (v5.14) |
| request-class | #138 | ✅ (v5.15) |
| update-dependent | #139 | ✅ (v5.15) |
| create-connect-onboarding-link | #140 | ✅ (v5.15) |
| list-subscription-invoices | #141 | ✅ (v5.15) |
| check-business-profile-status | #142 | ✅ (v5.16) |
| create-connect-account | #143 | ✅ (v5.16) |
| send-class-confirmation-notification | #144 | ✅ (v5.16) |
| check-stripe-account-status | #145 | ✅ (v5.17) |
| create-business-profile | #146 | ✅ (v5.17) |
| customer-portal | #147 | ✅ (v5.17) |

### Padrões Transversais Verificados

| Padrão | Funções Verificadas | Status |
|--------|-------------------|--------|
| FK joins no Deno | 36+ funções auditadas | ✅ Todos documentados (#25, #35, #52, #57, #58, #69, #103, #111, #113, #114, #116, #119, #120, #121, #123, #127, #130, #134✅, #135✅, #136✅, #137✅, #163, #164, #165, #171, #172, #176, #179, #180) |
| `.single()` vs `.maybeSingle()` | 24+ funções auditadas | ✅ (#49, #53, #64, #73, #78, #84, #102, #131, #139, #143, #144, #145, #148✅, #149✅, #157, #159, #161, #162, #167, #168, #173, #174, #177, #179) |
| Status inglês vs português | webhook, cancel-payment-intent, check-overdue | ✅ (~~#98~~, #104⊂#169, #126, #169) |
| Race conditions (guard clauses) | check-overdue, auto-verify, verify-payment | ✅ (#81, #155, #156, #158) |
| Auth/Authorization bypass | create-payment-intent-connect, change-payment-method | ✅ (#170, #175) |
| payment_origin em handlers de falha | webhook-stripe-connect | ✅ (#160) |
| HTTP 500 vs 200+success:false | create-invoice, automated-billing, process-cancellation, check-overdue, auto-verify, create-connect-onboarding-link, list-subscription-invoices, check-stripe-account-status, customer-portal | ✅ (#72, #76, #83, #140, #141, #145, #147, M32, M52) |
| Autenticação ausente | verify-payment, auto-verify, generate-boleto, validate-business-profile, smart-delete-student, create-student, update-student-details, create-payment-intent-connect | ✅ (#102, #118, #121, #128, #132✅, #133✅, #175) |
| Ownership validation tardia | check-business-profile-status (Stripe API antes de ownership check) | ✅ (#142) |
| Duplicatas / contas órfãs | create-business-profile (múltiplas contas Stripe Connect) | ✅ (#146) |
| Busca frágil por email | customer-portal (busca Stripe Customer por email em vez de ID) | ✅ (#147) |
| Payment Intent órfão | handle-teacher-subscription-cancellation, create-subscription-checkout | ✅ (#112, #117) |
| Service role como Bearer | process-cancellation | ✅ (#80) |
| boleto_url → stripe_hosted_invoice_url | create-invoice, automated-billing (3 locais) | ✅ (M38, #124) |
| Audit logs com schema incorreto | handle-plan-downgrade-selection | ✅ (#129) |
| `is_paid_class` não persistido | request-class (3º caminho de criação) | ✅ (#138) |
| Schema semântico violado | check-overdue-invoices (class_notifications para faturas) | ✅ (#178) |
| FK constraint não tratada | end-recurrence (class_participants bloqueiam delete) | ✅ (#181) |
| Guard clause ausente em webhook | invoice.voided (pode sobrescrever status terminal) | ✅ (#182) |
| createClient sem persistSession:false | process-cancellation, cancel-payment-intent | ✅ (#183) |
| Handler de webhook ausente | webhook-stripe-connect (payment_intent.payment_failed) | ✅ (#184) |
| SDK version drift | webhook-stripe-connect (Stripe v14.24.0 vs v14.21.0) | ✅ (#185) |
| `.single()` adicional | send-invoice-notification (monthly_subscriptions lookup) | ✅ (#186) |

---

## Novas Pontas Soltas v5.29 (#181-#183)

### 181. end-recurrence não deleta class_participants antes de deletar classes — FK constraint bloqueia deleção (Fase 8)

**Arquivo**: `supabase/functions/end-recurrence/index.ts` (linhas 67-73)

A função deleta aulas materializadas futuras com `.delete().eq('class_template_id', templateId).gte('class_date', endDate).neq('status', 'concluida')`. Porém, se essas aulas tiverem participantes registrados na tabela `class_participants`, a FK constraint `class_participants_class_id_fkey` (default RESTRICT) **bloqueará a deleção**, e o erro será propagado ao usuário como "Failed to delete future classes".

Além disso, se houver registros em `class_exceptions` referenciando essas classes, a FK `class_exceptions_original_class_id_fkey` também bloqueará a deleção.

**Severidade**: ALTA — encerrar recorrência falha silenciosamente para aulas com participantes.

**Ação**: Antes de deletar as classes, buscar os IDs das aulas a serem removidas via SELECT, deletar `class_participants` e `class_exceptions` associados, e então deletar as classes:
```javascript
// 1. Buscar IDs das classes a deletar
const { data: classesToDelete } = await supabase
  .from('classes')
  .select('id')
  .eq('class_template_id', templateId)
  .gte('class_date', endDate)
  .neq('status', 'concluida');

const classIds = classesToDelete?.map(c => c.id) || [];
if (classIds.length > 0) {
  // 2. Deletar dependências
  await supabase.from('class_participants').delete().in('class_id', classIds);
  await supabase.from('class_exceptions').delete().in('original_class_id', classIds);
  // 3. Deletar classes
  await supabase.from('classes').delete().in('id', classIds);
}
```

### 182. invoice.voided webhook handler sem guard clause no UPDATE — pode sobrescrever status terminal (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 425-431)

O handler `invoice.voided` atualiza a fatura para `status: 'cancelada'` usando `.eq('stripe_invoice_id', voidedInvoice.id)` sem verificar o status atual. Se por alguma razão uma fatura já estiver `paga` ou em outro estado terminal, o update sobrescreveria para `cancelada`.

Embora o risco seja baixo (Stripe não costuma void faturas pagas), o padrão é inconsistente com as guard clauses adicionadas nos handlers `check-overdue-invoices` (#155), `auto-verify-pending-invoices` (#156) e `verify-payment-status` (#158).

**Severidade**: BAIXA — edge case improvável mas inconsistência de padrão.

**Ação**: Adicionar guard clause `.in('status', ['pendente', 'overdue', 'vencida', 'falha_pagamento'])` ao UPDATE.

### 183. process-cancellation e cancel-payment-intent: createClient sem `{ auth: { persistSession: false } }` (Fase 8)

**Arquivos**: 
- `supabase/functions/process-cancellation/index.ts` (linhas 28-31)
- `supabase/functions/cancel-payment-intent/index.ts` (linha 37)

Ambas as funções criam o cliente Supabase com `createClient(url, key)` sem passar `{ auth: { persistSession: false } }`. Embora em Deno Edge Functions a persistência de sessão não cause bugs visíveis (cada invocação é isolada), a omissão é inconsistente com o padrão seguido por todas as outras funções do projeto.

**Severidade**: BAIXA — inconsistência de padrão, sem impacto funcional direto.

**Ação**: Adicionar `{ auth: { persistSession: false } }` como terceiro argumento do `createClient` em ambas as funções.

---

## Novas Pontas Soltas v5.30 (#184-#186)

### 184. webhook-stripe-connect: handler `payment_intent.payment_failed` ausente — falhas de boleto/PIX não processadas (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`

O webhook processa `payment_intent.succeeded` (linhas 441-501) mas **não possui handler para `payment_intent.payment_failed`**. Quando um boleto expira sem pagamento ou um PIX falha, o Stripe envia `payment_intent.payment_failed`, mas o sistema não o processa.

Consequência: a fatura permanece com status `pendente` no banco até que `check-overdue-invoices` a marque como `overdue`/`vencida` baseado na `due_date`, o que pode levar dias. Enquanto isso, o aluno vê a fatura como "pendente" com link de pagamento expirado.

O handler `invoice.payment_failed` (linhas 372-393) existe mas busca por `stripe_invoice_id` (bug #87), então também nunca encontra faturas internas criadas via Payment Intent.

**Severidade**: ALTA — status de fatura não reflete realidade do pagamento por dias.

**Ação**: Adicionar handler `payment_intent.payment_failed` no switch do webhook:
```javascript
case 'payment_intent.payment_failed': {
  const failedPI = eventObject as Stripe.PaymentIntent;
  logStep("Payment intent failed", { paymentIntentId: failedPI.id });

  const { error } = await supabaseClient
    .from('invoices')
    .update({ 
      status: 'falha_pagamento',
      updated_at: new Date().toISOString()
    })
    .eq('stripe_payment_intent_id', failedPI.id)
    .in('status', ['pendente']); // Guard clause

  if (error) {
    logStep("Error updating invoice for failed PI", error);
  }
  break;
}
```

### 185. webhook-stripe-connect: Stripe SDK v14.24.0 inconsistente com padrão v14.21.0 do projeto (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linha 2)

```javascript
import Stripe from "https://esm.sh/stripe@14.24.0";
```

O padrão do projeto é `stripe@14.21.0` (documentado na memória `infrastructure/stripe-sdk-version-standard-refined`). O webhook usa v14.24.0, criando risco de comportamento divergente na função mais crítica do sistema de pagamentos.

**Severidade**: BAIXA — provavelmente compatível, mas cria drift de versão.

**Ação**: Alinhar para `stripe@14.21.0` ou atualizar o padrão para v14.24.0 em todas as funções.

### 186. send-invoice-notification: `.single()` em lookup de monthly_subscriptions (Fase 8)

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linha 161)

```javascript
const { data: subscription, error: subError } = await supabase
  .from("monthly_subscriptions")
  .select("name, price, max_classes, overage_price")
  .eq("id", invoice.monthly_subscription_id)
  .single();
```

Se a mensalidade for desativada ou deletada entre a criação da fatura e o envio da notificação, `.single()` lança exceção. O código posterior (`if (!subError && subscription)`) mitiga parcialmente, mas a exceção do `.single()` pode interromper o fluxo antes de chegar ao check.

Diferente de #53 (invoice lookup) e #73 (student/teacher lookups), esta é uma terceira instância de `.single()` na mesma função que não foi coberta.

**Severidade**: BAIXA — mitigado pelo try/catch geral, mas inconsistente com o padrão.

**Ação**: Substituir por `.maybeSingle()`. Se `subscription` for null, enviar email sem seção de detalhes do plano.

### 187. check-overdue-invoices: sem guard de status terminal — pode sobrescrever `paga` para `overdue` (Fase 0)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linhas 55-59)

```javascript
// PROBLEMA: atualiza para "overdue" sem verificar se já foi paga manualmente
await supabase
  .from("invoices")
  .update({ status: "overdue" })
  .eq("id", invoice.id);
```

Se o professor marcar uma fatura como paga manualmente (`payment_origin: 'manual'`) e o boleto vencer depois, o cron job sobrescreve o status `paga` para `overdue`. Isso é uma regressão de dados crítica que invalida confirmações manuais.

Diferente de #155 (que cobre o conceito genérico de guards), esta é uma instância concreta e crítica no cron job `check-overdue-invoices` que roda automaticamente sem supervisão humana.

**Severidade**: ALTA — pode reverter faturas pagas sem intervenção humana.

**Ação**: Adicionar guard clause no UPDATE: `.not('status', 'in', '("paga","cancelada")').not('payment_origin', 'eq', 'manual')`. Também alinhar com #169 para usar status em português (`vencida` em vez de `overdue`).

### 188. cancel-payment-intent: marca `payment_origin: 'manual'` mesmo quando PI já `succeeded` no Stripe (Fase 8)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 138-183)

Quando o cancelamento do Payment Intent falha porque já está em estado `succeeded` (pagamento já realizado via Stripe), a função ainda marca a fatura como `payment_origin: 'manual'` (linha 173). Isso cria uma inconsistência: o pagamento foi automático (Stripe), mas o registro diz "manual".

**Severidade**: MÉDIA — não causa falha funcional, mas corrompe dados de auditoria e relatórios financeiros que distinguem pagamentos manuais de automáticos.

**Ação**: Após o catch do `stripe.paymentIntents.cancel()`, verificar o status real do PI. Se `status === 'succeeded'`, marcar como `payment_origin: 'automatic'` em vez de `'manual'`. Considerar retornar erro ao frontend informando que o pagamento já foi recebido pelo Stripe.

### 189. automated-billing: processMonthlySubscriptionBilling sem proteção contra fatura duplicada no mesmo ciclo (Fase 8)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 652-828)

A função `processMonthlySubscriptionBilling` cria uma fatura de mensalidade (`monthly_base`) sem verificar se já existe uma fatura para o mesmo `monthly_subscription_id` no mesmo ciclo de faturamento. Se o cron job `automated-billing` executar duas vezes no mesmo dia (falha e retry, deploy duplicado, etc.), duas faturas de mensalidade serão criadas para o mesmo aluno.

O item `monthly_base` (linha 737) é criado incondicionalmente — não depende de aulas não faturadas como no fluxo tradicional, então a RPC `create_invoice_and_mark_classes_billed` não protege contra duplicatas neste caso.

**Severidade**: ALTA — cobrança duplicada de mensalidade pode causar disputas financeiras e perda de confiança.

**Ação**: Antes de criar a fatura, verificar:
```sql
SELECT id FROM invoices 
WHERE student_id = p_student_id 
  AND teacher_id = p_teacher_id 
  AND invoice_type = 'monthly_subscription' 
  AND monthly_subscription_id = p_subscription_id
  AND due_date >= cycle_start::date
  AND due_date <= (cycle_end + interval '30 days')::date
  AND status NOT IN ('cancelada')
LIMIT 1;
```
Se existir, pular a criação e logar como "já faturado neste ciclo".

### 190. webhook-stripe-connect: `.single()` em lookups de faturas nos handlers invoice.paid/payment_succeeded/payment_intent.succeeded (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 310, 346, 457)

```javascript
// invoice.paid (linha 310)
const { data: existingInvoice } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', paidInvoice.id)
  .single(); // ← Lança exceção se fatura não existe

// invoice.payment_succeeded (linha 346)
const { data: existingSucceeded } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_invoice_id', succeededInvoice.id)
  .single(); // ← Mesma vulnerabilidade

// payment_intent.succeeded (linha 457)
const { data: existingPI } = await supabaseClient
  .from('invoices')
  .select('payment_origin')
  .eq('stripe_payment_intent_id', paymentIntent.id)
  .single(); // ← Mesma vulnerabilidade
```

Quando o Stripe envia um evento para uma fatura que não existe no banco de dados local (evento órfão, fatura de outra integração, ou fatura deletada), `.single()` lança PGRST116, que propaga até o catch global e retorna HTTP 500. Isso faz o Stripe iniciar retentativas, potencialmente criando um loop de 5-7 tentativas por evento.

**Severidade**: MÉDIA — causa loops de retentativa do Stripe e polui logs de erro.

**Ação**: Substituir por `.maybeSingle()` nos 3 lookups. Se `existingInvoice` for `null`, logar "No local invoice found for Stripe event" e retornar 200 (evento órfão).

### 191. process-expired-subscriptions: FK joins + `.single()` violando padrões do projeto (Fase 8)

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (linhas 38-57, 122)

```javascript
// FK joins proibidos (linhas 38-57)
const { data: expiredSubscriptions } = await supabaseAdmin
  .from('user_subscriptions')
  .select(`
    id, user_id, plan_id, stripe_subscription_id, current_period_end,
    subscription_plans!inner (...),  // ← FK join
    profiles!user_id (...)           // ← FK join
  `)

// .single() para free plan (linha 122)
const { data: freePlan } = await supabaseAdmin
  .from('subscription_plans')
  .select('*')
  .eq('slug', 'free')
  .single(); // ← Lança se plano free não existe
```

A query principal usa FK joins que podem falhar silenciosamente devido ao cache de schema do Deno, retornando dados parciais ou nulos. O `.single()` na linha 122 pode crashar o processamento de uma assinatura se o plano free não existir, deixando o usuário com status inconsistente (assinatura expirada mas profile não atualizado).

**Severidade**: MÉDIA — pode causar falha silenciosa no processamento de expiração de assinaturas.

**Ação**: Refatorar para queries sequenciais independentes. Trocar `.single()` por `.maybeSingle()` e tratar ausência do plano free com log de alerta.

### 192. webhook-stripe-connect: retorna HTTP 500 no catch global, causando retry storms do Stripe (Fase 8)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 551-558)

```javascript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logStep("ERROR in webhook-stripe-connect", { message: errorMessage });
  
  return new Response(JSON.stringify({ error: errorMessage }), {
    status: 500,  // ← Viola padrão de resiliência
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
```

Per memória `infrastructure/stripe-webhook-resilience-pattern`, webhooks devem retornar HTTP 200 para falhas não-críticas para evitar que o Stripe inicie loops de retentativa infinitos. O catch global é atingido por erros de processamento interno (ex: PGRST116 de `.single()`) que não justificam retentativas do Stripe.

**Severidade**: BAIXA — já mitigado parcialmente pela idempotência, mas agrava os efeitos de #190.

**Ação**: Retornar HTTP 200 com `{ received: true, error: errorMessage }` no catch global. Manter HTTP 400 apenas para falha de verificação de assinatura do webhook (linha 135), que indica evento potencialmente fraudulento.

---

### 193. create-invoice: FK joins violam padrão de queries sequenciais (Fase 8)

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 145-154, 228-241)

A função usa FK join syntax em dois locais:
1. Linha 145-153: `business_profiles!teacher_student_relationships_business_profile_id_fkey(enabled_payment_methods)` no lookup de relacionamento
2. Linha 228-241: `classes!inner(...)` com nested `class_services(name, price)` no fetch de participantes

Ambos violam o padrão `constraints/edge-functions-pattern-sequential-queries` e estão sujeitos a falhas por schema cache do Deno. Adicionalmente, linha 154 usa `.single()` em vez de `.maybeSingle()`, e linha 382 repete o mesmo padrão.

**Severidade**: MÉDIA — pode causar falhas silenciosas na criação de faturas em ambiente de produção após atualizações de schema.

**Ação**: Substituir FK joins por queries sequenciais independentes. Trocar `.single()` por `.maybeSingle()` e tratar ausência de relacionamento com mensagem amigável.

---

### 194. create-payment-intent-connect: FK joins + `.single()` + sem guard de status (Fase 8)

**Arquivo**: `supabase/functions/create-payment-intent-connect/index.ts` (linhas 37-51)

```javascript
const { data: invoice, error: invoiceError } = await supabaseClient
  .from("invoices")
  .select(`
    *,
    student:profiles!invoices_student_id_fkey(...),
    teacher:profiles!invoices_teacher_id_fkey(...),
    business_profile:business_profiles!invoices_business_profile_id_fkey(...)
  `)
  .eq("id", invoice_id)
  .single(); // ← .single() + FK joins
```

3 problemas: (1) FK joins violam padrão sequencial, (2) `.single()` lança exceção se fatura não existir, (3) **não verifica se a fatura está em status `pendente`** antes de gerar novo Payment Intent — pode gerar pagamento para fatura já paga ou cancelada.

**Severidade**: MÉDIA — pode gerar cobranças duplicadas para faturas já pagas.

**Ação**: Substituir FK joins por queries sequenciais. Trocar `.single()` por `.maybeSingle()`. Adicionar guard: `if (invoice.status !== 'pendente') return HTTP 200 com erro amigável`.

---

### 195. verify-payment-status: sem autenticação/autorização — qualquer usuário pode atualizar status de qualquer fatura (Fase 0)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (linhas 15-123)

A função não possui NENHUMA verificação de autenticação ou autorização. Qualquer requisição com um `invoice_id` válido pode:
1. Consultar detalhes de fatura de qualquer professor/aluno
2. Forçar atualização do status da fatura baseado no Stripe

Adicionalmente, usa `.single()` (linha 40) e não possui guard de status terminal — pode sobrescrever `paga` (manual) para `falha_pagamento` se o PI no Stripe estiver em estado de falha.

**Severidade**: ALTA — vulnerabilidade de autorização que permite acesso a dados financeiros de outros usuários e manipulação indireta de status.

**Ação**: Adicionar validação de `auth.getUser(token)`. Verificar que o usuário é o `teacher_id` ou `student_id` da fatura. Trocar `.single()` por `.maybeSingle()`. Adicionar guard de status terminal.

---

### 196. change-payment-method: autorização de guardian quebrada por sobreposição de `.eq()` (Fase 0)

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 83-86)

```javascript
const { data: responsibleRelation } = await supabaseClient
  .from('dependents')
  .select('id')
  .eq('responsible_id', invoice.student_id)  // ← Sobrescrito pela próxima linha!
  .eq('responsible_id', user.id)             // ← Só este filtro é aplicado
  .limit(1);
```

Dois `.eq()` consecutivos na mesma coluna (`responsible_id`) — o PostgREST aplica apenas o último filtro (documentado em memória `constraints/sobreposicao-filtros-query-supabase`). Isso torna a verificação de guardian **SEMPRE falsa**, impedindo que responsáveis financeiros alterem o método de pagamento de faturas de seus dependentes.

**Severidade**: ALTA — funcionalidade de troca de método de pagamento completamente quebrada para responsáveis/guardiões. Afeta fluxo crítico de pagamento.

**Ação**: Substituir os dois `.eq()` por `.or(`responsible_id.eq.${invoice.student_id},responsible_id.eq.${user.id}`)` ou, preferencialmente, usar lógica de verificação independente conforme memória `payment/family-invoice-authorization-logic`.

---

### 197. create-connect-onboarding-link: bypass de validação de propriedade quando `stripe_account_id` é fornecido diretamente (Fase 8)

**Arquivo**: `supabase/functions/create-connect-onboarding-link/index.ts` (linhas 53-56)

```javascript
if (stripe_account_id) {
  connectAccount = { stripe_account_id };  // ← Nenhuma validação de propriedade!
  logStep("Using provided stripe_account_id", { stripe_account_id });
}
```

Quando `stripe_account_id` é fornecido diretamente (em vez de `payment_account_id`), a função pula a validação de propriedade (`.eq("teacher_id", user.id)` na linha 63) e gera um link de onboarding para qualquer conta Stripe Connect, independente de quem a possui.

**Severidade**: MÉDIA — permite que qualquer professor autenticado gere links de onboarding para contas Stripe de outros professores. O impacto é mitigado porque o link apenas permite completar o setup, não dá acesso a fundos.

**Ação**: Sempre validar propriedade: buscar na tabela `stripe_connect_accounts` com `.eq("stripe_account_id", stripe_account_id).eq("teacher_id", user.id)` antes de gerar o link.

---

### 209. check-overdue-invoices — status 'overdue' em inglês (Fase 0)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linha 58)
Cron job marca faturas como `"overdue"` em vez de `"vencida"`. Todas as faturas vencidas ficam com status incorreto.
**Severidade**: ALTA — corrupção de dados em lote via cron.
**Ação**: Substituir `"overdue"` por `"vencida"`.

### 210. handle-plan-downgrade-selection — audit log com schema errado (Fase 8)

**Arquivo**: `supabase/functions/handle-plan-downgrade-selection/index.ts` (linhas 29-44)
A função `logAuditEvent` insere com campos `user_id`, `action`, `details`, `metadata` que não existem na tabela `audit_logs` (que usa `actor_id`, `target_teacher_id`, `table_name`, `record_id`, `operation`, `old_data`, `new_data`). Todas as entradas de auditoria de downgrade falham silenciosamente.
**Severidade**: MÉDIA — sem trilha de auditoria para downgrades voluntários.
**Ação**: Refatorar `logAuditEvent` para usar os campos corretos da tabela `audit_logs`.

### 211. handle-student-overage — referência a tabela inexistente `student_overage_charges` (Fase 8)

**Arquivo**: `supabase/functions/handle-student-overage/index.ts` (linha 132)
A função tenta inserir em `student_overage_charges` que não existe nos tipos do Supabase. O insert falha silenciosamente, impedindo o rastreamento de cobranças por excedente de alunos.
**Severidade**: MÉDIA — cobranças de overage não são rastreadas no banco.
**Ação**: Criar tabela `student_overage_charges` ou remover insert e usar `audit_logs` como alternativa.

### 212. Múltiplas funções com `.single()` sem `.maybeSingle()` (Fase 8)

**Funções afetadas**:
- `handle-student-overage/index.ts` (linha 79)
- `handle-plan-downgrade-selection/index.ts` (linha 111)
- `cancel-subscription/index.ts` (linhas 47, 67)
- `process-expired-subscriptions/index.ts` (linha 122)
- `change-payment-method/index.ts` (linha 53)
- `create-student/index.ts` (linha 297)
- `process-cancellation/index.ts` (linha 107)
**Severidade**: BAIXA a MÉDIA — exceções HTTP 500 quando registros não existem.
**Ação**: Trocar todas por `.maybeSingle()` com tratamento gracioso.

### 213. process-expired-subscriptions — FK join syntax (Fase 8)

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (linhas 40-57)
Usa FK join syntax `subscription_plans!inner(...)` e `profiles!user_id(...)` que viola o padrão de queries sequenciais documentado em memória.
**Severidade**: MÉDIA — risco de falha por schema cache.
**Ação**: Refatorar para queries sequenciais independentes.

### 214. process-cancellation — `.single()` em lookup de dependent (Fase 8)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (linha 107)
Usa `.single()` para buscar dependente por ID. Se o dependente não existir, lança exceção.
**Severidade**: BAIXA.
**Ação**: Trocar por `.maybeSingle()`.

### 215. handle-teacher-subscription-cancellation — referência a campo inexistente `guardian_email` (Fase 8)

**Arquivo**: `supabase/functions/handle-teacher-subscription-cancellation/index.ts` (linha 262)
Query de profiles seleciona campo `guardian_email` que não existe na tabela `profiles`. Dados de guardian estão em `teacher_student_relationships`. A query não falha (PostgREST ignora campos inexistentes no select), mas o campo retorna como `undefined`, impedindo notificações a responsáveis.
**Severidade**: MÉDIA — responsáveis não recebem notificação de suspensão de cobranças.
**Ação**: Remover `guardian_email` do select e buscar dados do responsável via `teacher_student_relationships`.

---

### 216. create-subscription-checkout — cancela assinatura ANTES do checkout (Perda de Plano) (Fase 0)

**Arquivo**: `supabase/functions/create-subscription-checkout/index.ts` (linhas 184-188)
Quando o usuário troca de plano, a função cancela IMEDIATAMENTE a assinatura existente no Stripe (linha 186: `stripe.subscriptions.cancel(...)`) ANTES do checkout ser concluído. Se o usuário abandonar o checkout, ele fica sem plano e sem caminho de recuperação. A assinatura local é marcada como `'cancelled'` e o perfil não é restaurado.
**Severidade**: ALTA — perda de plano do usuário por abandono de checkout. Não há reversão automática.
**Ação**: Substituir cancelamento imediato por `cancel_at_period_end: true` ou mover o cancelamento para o webhook `checkout.session.completed`. Alternativa: guardar o `subscription_id` antigo e re-ativar se o checkout expirar.

### 217. check-subscription-status — 846 linhas, 5+ `.single()` e FK joins (Fragilidade)

**Arquivo**: `supabase/functions/check-subscription-status/index.ts` (846 linhas)
Função monolítica com 5+ usos de `.single()` (linhas 378, 460, 585, 703, 760) e FK join syntax (linhas 32-38 `profiles!teacher_student_relationships_student_id_fkey`, linhas 131-139 `subscription_plans (*)`). Qualquer falha de lookup causa HTTP 500, quebrando o carregamento da página de planos.
**Severidade**: MÉDIA — função crítica extremamente frágil.
**Ação**: Refatorar para queries sequenciais, trocar `.single()` por `.maybeSingle()`, considerar dividir em subfunções.

### 218. send-student-invitation — sem autenticação (Spam)

**Arquivo**: `supabase/functions/send-student-invitation/index.ts`
Função de envio de email não possui NENHUMA verificação de autenticação. Qualquer pessoa com a URL da função pode invocar o endpoint e enviar emails arbitrários usando o template do Tutor Flow.
**Severidade**: BAIXA — não modifica dados, mas pode ser usado para spam ou phishing usando o branding do Tutor Flow.
**Ação**: Validar que o chamador é outra edge function (verificar Service-Role key) ou adicionar autenticação de professor.

### 219. automated-billing — FK join syntax no cron job crítico

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 70-90, 213-226)
Cron job de faturamento usa FK join syntax extenso: `teacher:profiles!teacher_id(...)`, `student:profiles!student_id(...)` (linhas 78-88) e `classes!inner(teacher_id)` (linhas 213-226). Em caso de schema cache stale, o faturamento de TODOS os alunos falha.
**Severidade**: MÉDIA — risco de falha total do ciclo de faturamento.
**Ação**: Refatorar para queries sequenciais independentes, pelo menos para os lookups de profiles.

### 220. resend-student-invitation — `.single()` em profile lookups

**Arquivo**: `supabase/functions/resend-student-invitation/index.ts` (linhas 75, 90, 128)
Usa `.single()` para buscar relação professor-aluno (linha 75), perfil do aluno (linha 90) e perfil do professor (linha 128). Se qualquer registro não existir, lança exceção HTTP 500.
**Severidade**: BAIXA — erros de UX em cenários edge.
**Ação**: Trocar por `.maybeSingle()` com mensagens amigáveis.

### 221. create-subscription-checkout — `.single()` e FK joins

**Arquivo**: `supabase/functions/create-subscription-checkout/index.ts` (linhas 138, 172)
Usa `.single()` para plan lookup (linha 138) e FK join syntax `subscription_plans(*)` (linha 172).
**Severidade**: BAIXA — complementa #216.
**Ação**: Trocar `.single()` por `.maybeSingle()`, refatorar FK join.

### 222. smart-delete-student — `.single()` em subscription lookups

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (linhas 52, 91)
Usa `.single()` para buscar `user_subscriptions` (linha 52) e `subscription_plans` (linha 91). Se assinatura ou plano não existirem, lança exceção que interrompe a deleção do aluno.
**Severidade**: BAIXA-MÉDIA — impede deleção de aluno quando professor não tem assinatura.
**Ação**: Trocar por `.maybeSingle()` com fallback gracioso.

---

### 223. validate-business-profile-deletion — sem autenticação (Information Disclosure)

**Arquivo**: `supabase/functions/validate-business-profile-deletion/index.ts`
Função não possui NENHUMA verificação de autenticação. Qualquer pessoa pode consultar se um `business_profile_id` tem faturas ativas, alunos vinculados e detalhes financeiros.
**Severidade**: MÉDIA — vazamento de informações financeiras e de alunos. Não modifica dados.
**Ação**: Adicionar autenticação e verificar que o `business_profile_id` pertence ao `auth.uid()`.

### 224. resend-confirmation — listUsers() carrega TODOS os usuários em memória

**Arquivo**: `supabase/functions/resend-confirmation/index.ts` (linha 45)
Chama `supabaseAdmin.auth.admin.listUsers()` SEM filtro ou paginação para encontrar um único usuário por email. Com milhares de usuários, a função timeout ou crashea por exceder limite de memória.
**Severidade**: ALTA — DoS por escala. Degradação de performance proporcional ao número de usuários.
**Ação**: Substituir `listUsers()` por lookup via `profiles` table (`.eq('email', email).maybeSingle()`) seguido de `getUserById()`, ou usar `listUsers({ filter: ... })` com paginação.

### 225. send-class-reminders — FK join ambíguo em class_participants→profiles (PGRST201)

**Arquivo**: `supabase/functions/send-class-reminders/index.ts` (linhas 87-94)
Query de class_participants usa `profiles (name, email)` SEM especificar a foreign key. Tabela `class_participants` tem DUAS FKs para `profiles`: `student_id` e `cancelled_by`. Isso pode causar erro `PGRST201` de ambiguidade, quebrando o envio de lembretes para TODOS os alunos.
**Severidade**: MÉDIA — quebra total de lembretes de aula. Também viola o padrão de queries sequenciais.
**Ação**: Refatorar para queries sequenciais (buscar participantes, depois buscar profiles separadamente).

### 226. audit-logger — schema mismatch total (Todas as escritas falham) (Fase 0)

**Arquivo**: `supabase/functions/audit-logger/index.ts` (linhas 23-31)
Função insere com campos `user_id`, `action`, `details`, `metadata` — mas a tabela `audit_logs` usa `actor_id`, `operation`, `record_id`, `table_name`, `old_data`, `new_data`. NENHUM campo corresponde. Todas as inserções falham silenciosamente.
**Severidade**: ALTA — sistema de auditoria completamente inoperante. Nenhum evento de auditoria é registrado.
**Ação**: Corrigir o mapeamento de campos: `user_id`→`actor_id`, `action`→`operation`, e incluir `record_id` e `table_name` como obrigatórios.

### 227. stripe-events-monitor — sem autenticação (Information Disclosure)

**Arquivo**: `supabase/functions/stripe-events-monitor/index.ts`
Função de monitoramento de eventos Stripe não possui autenticação. Qualquer pessoa pode consultar estatísticas de processamento, taxas de erro e eventos recentes do Stripe.
**Severidade**: BAIXA — expõe padrões de atividade financeira, mas sem dados sensíveis diretos.
**Ação**: Adicionar autenticação e verificar papel de `professor`.

### 228. check-email-availability — sem autenticação (Email Enumeration)

**Arquivo**: `supabase/functions/check-email-availability/index.ts`
Qualquer pessoa pode verificar se um email existe no sistema sem autenticação. Vetor de ataque de enumeração de emails.
**Severidade**: BAIXA — permite descobrir quais emails estão cadastrados no Tutor Flow.
**Ação**: Adicionar rate limiting ou autenticação.

### 229. generate-teacher-notifications — dependência cruzada com #209 (overdue_invoices vazio)

**Arquivo**: `supabase/functions/generate-teacher-notifications/index.ts` (linha 187)
Categoria `overdue_invoices` busca por `status = 'overdue'`. Porém, #209 documenta que `check-overdue-invoices` marca faturas com status 'overdue' (inglês) em vez de 'vencida' (português). Resultado: ou o status existe como 'overdue' e a notificação funciona, ou o padrão é 'vencida' e a query retorna vazio. Há inconsistência entre as funções.
**Severidade**: MÉDIA — notificações de faturas vencidas podem estar completamente vazias ou dependem de um bug (#209) para funcionar.
**Ação**: Unificar todos os status para português. Atualizar query para `status = 'vencida'` após correção de #209.

### 230. send-class-report-notification — 6 `.single()` sem tratamento

**Arquivo**: `supabase/functions/send-class-report-notification/index.ts` (linhas 37, 49, 74, 107, 128, 142)
Usa `.single()` em 6 lookups diferentes (classes, teacher profile, report, student profile, dependent, relationship). Qualquer registro ausente causa HTTP 500, abortando a notificação para TODOS os participantes.
**Severidade**: BAIXA-MÉDIA — um único registro ausente impede notificação para toda a turma.
**Ação**: Trocar por `.maybeSingle()` com `continue` para pular participantes com dados incompletos.

---

### 198. refresh-stripe-connect-account e check-stripe-account-status: `.single()` em lookups de Connect account (Fase 8)

**Arquivos**: 
- `supabase/functions/refresh-stripe-connect-account/index.ts` (linha 66)
- `supabase/functions/check-stripe-account-status/index.ts` (linha 59)

Ambas usam `.single()` para buscar `stripe_connect_accounts`. Se a conta não existir, lançam exceção HTTP 500 em vez de mensagem amigável.

**Severidade**: BAIXA — ownership validation já presente, erro é apenas de UX.

**Ação**: Trocar `.single()` por `.maybeSingle()` e retornar HTTP 200 com `{ success: false, error: "..." }`.

---

### 231. process-cancellation — aceita `cancelled_by` do body sem validar JWT (Identity Spoofing) (Fase 0)

**Arquivo**: `supabase/functions/process-cancellation/index.ts` (500 linhas)
Função não extrai o usuário autenticado do JWT. Aceita `cancelled_by` diretamente do corpo da requisição e o usa para verificação de permissão (linhas 172-194). Um usuário autenticado (User A) pode enviar `cancelled_by: userB_id` e, se userB for participante da aula, o cancelamento será processado como se fosse userB. Isso permite spoofing de identidade em cancelamentos, incluindo geração de multas no nome de outros.
**Severidade**: ALTA — identity spoofing em operação financeira (cancelamento com multa). Qualquer usuário autenticado pode cancelar aulas de outros.
**Ação**: Extrair `auth.uid()` do JWT e usar como fonte de verdade para `cancelled_by`. O body só deve conter `class_id`, `reason`, `cancelled_by_type` e opcionalmente `dependent_id`.

### 232. verify-payment-status — sem ownership validation (IDOR)

**Arquivo**: `supabase/functions/verify-payment-status/index.ts` (124 linhas)
Função não verifica autenticação nem propriedade. Qualquer usuário autenticado (verify_jwt=true no gateway) pode consultar e ATUALIZAR o status de qualquer fatura fornecendo seu `invoice_id`. Linha 40: `.single()` sem filtro de propriedade. Linhas 89-93: atualiza status sem checar se o invoker é o professor ou aluno da fatura.
**Severidade**: MÉDIA — IDOR: qualquer usuário pode forçar status de fatura alheia para 'paga' se tiver o payment_intent correto no Stripe.
**Ação**: Adicionar extração do JWT user e verificar que `invoice.teacher_id === user.id` ou `invoice.student_id === user.id`.

### 233. create-invoice — FK joins aninhados em class_participants

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linhas 228-238)
Query de `class_participants` usa FK joins aninhados: `classes!inner (id, class_date, service_id, class_services (name, price))`. Se o schema cache estiver obsoleto, a query inteira falha e a fatura é estornada (rollback).
**Severidade**: BAIXA — já tem tratamento de rollback robusto, mas viola o padrão de queries sequenciais.
**Ação**: Refatorar para buscar class_participants, classes e class_services em queries separadas.

### 234. cancel-payment-intent — CONFIRMA #199: status 'paid' em inglês (Corrupção de Dados Recorrente) (Fase 0)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 111, 172)
Função marca faturas com `status: 'paid'` em inglês (linhas 111, 172). Todo o sistema financeiro filtra por status em português ('pendente', 'paga', 'vencida'). Faturas marcadas como 'paid' ficam INVISÍVEIS ao financeiro, ao dashboard e a todas as queries de status. Este é o MESMO padrão do #199 mas num ponto de código diferente, confirmando que é um padrão recorrente e não um caso isolado.
**Severidade**: ALTA — corrupção silenciosa de dados financeiros. Faturas pagas manualmente desaparecem do sistema.
**Ação**: Substituir `status: 'paid'` por `status: 'paga'` em ambas as ocorrências (linhas 111 e 172).

### 235. validate-payment-routing — cria faturas REAIS em produção como "teste"

**Arquivo**: `supabase/functions/validate-payment-routing/index.ts` (linhas 245-264)
Teste 5 ("Invoice Creation Simulation") cria uma fatura REAL no banco de dados de produção e depois tenta deletá-la por `description = 'Teste de validação de roteamento'`. Problemas: (1) se a deleção falhar, faturas fantasma permanecem; (2) o filtro de deleção pode apagar faturas legítimas com mesma descrição; (3) a fatura criada pode disparar webhooks e notificações antes de ser deletada.
**Severidade**: MÉDIA — risco de faturas fantasma e deleção acidental.
**Ação**: Remover Teste 5 ou substituir por dry-run (validate insert permissions via RPC sem INSERT real).

### 236. CORREÇÃO: Reclassificação de findings de "sem auth" (#218, #223, #227, #228)

Análise cruzada do `supabase/config.toml` revelou que as funções #218 (`send-student-invitation`), #223 (`validate-business-profile-deletion`), #227 (`stripe-events-monitor`) e #228 (`check-email-availability`) NÃO estão listadas no config.toml, portanto o padrão `verify_jwt = true` é aplicado pelo gateway do Supabase. Isso significa que essas funções REQUEREM um JWT válido e não são acessíveis anonimamente. A vulnerabilidade real é a falta de OWNERSHIP validation (qualquer usuário autenticado pode acessar dados de outros), não a ausência total de autenticação. Severidade reclassificada de MÉDIA/BAIXA para BAIXA em todos os 4 casos.

---

### 237. webhook-stripe-connect — status `"paid"` em inglês em TRÊS handlers (Corrupção de Dados em Massa) (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (560 linhas)
**O finding mais crítico de toda a auditoria.** O webhook de pagamentos Stripe Connect marca faturas com `status: "paid"` (inglês) em TRÊS handlers diferentes:
- `invoice.paid` (linha 320): `status: 'paid'`
- `invoice.payment_succeeded` (linha 357): `status: 'paid'`
- `payment_intent.succeeded` (linha 469): `status: "paid"`

Todo o sistema financeiro (dashboard, filtros, cron jobs, relatórios) filtra por status em português (`'paga'`, `'pendente'`, `'vencida'`). Isso significa que **TODOS os pagamentos processados automaticamente via Stripe são marcados com status invisível ao sistema**. Faturas pagas desaparecem do financeiro, aparecem como "pendentes" e podem ser cobradas novamente pelo cron de check-overdue-invoices.
**Severidade**: CRÍTICA — corrupção silenciosa e massiva de dados financeiros em produção. Afeta a maioria dos pagamentos do sistema.
**Ação**: Substituir `status: 'paid'` e `status: "paid"` por `status: 'paga'` em todas as 3 ocorrências (linhas 320, 357, 469).

### 238. webhook-stripe-subscriptions — HTTP 400/500 para "user not found" causa retries desnecessários (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-subscriptions/index.ts` (802 linhas)
Múltiplos handlers retornam HTTP 400 quando o usuário não é encontrado (linhas 427, 519, 572, 608). O Stripe interpreta qualquer resposta não-200 como falha e retenta o webhook (até 3x por tipo de evento). Isso causa:
1. Carga desnecessária no servidor (3x mais chamadas)
2. Logs poluídos com "User not found" repetidos
3. Risco de processamento duplicado se o usuário for criado entre retentativas
O catch global (linha 715) também retorna HTTP 500, causando retries para erros internos.
**Severidade**: ALTA — retries desnecessários do Stripe + risco de duplicação.
**Ação**: Substituir todos os retornos HTTP 400/500 para "User not found" por HTTP 200 com `{ received: true, skipped: true, reason: "user_not_found" }`.

### 239. process-expired-subscriptions — FK joins em cron job

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (233 linhas)
Linhas 46-57 usam FK joins: `subscription_plans!inner (...)` e `profiles!user_id (...)`. Se o schema cache estiver obsoleto, o cron inteiro falha e nenhuma assinatura expirada é processada.
**Severidade**: MÉDIA — falha silenciosa do cron de expiração.
**Ação**: Refatorar para queries sequenciais independentes.

### 240. smart-delete-student — missing ownership validation

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (547 linhas)
Função aceita `student_id`, `teacher_id`, `relationship_id` do body sem validar que o usuário autenticado (via JWT) corresponde ao `teacher_id`. Como `verify_jwt=true` por padrão, qualquer professor autenticado pode deletar alunos de OUTRO professor fornecendo IDs válidos.
**Severidade**: MÉDIA — IDOR em operação destrutiva (deleção de aluno + dependentes + dados).
**Ação**: Extrair `auth.uid()` do JWT e validar que `auth.uid() === teacher_id`.

### 241. check-subscription-status — monolito 846 linhas com 6+ `.single()`

**Arquivo**: `supabase/functions/check-subscription-status/index.ts` (846 linhas)
Função monolítica com pelo menos 6 chamadas `.single()` em lookups de planos (linhas 375, 460, 585, 703, 734, 760). Qualquer plano ausente ou inativo causa HTTP 500 para o usuário, impedindo-o de ver seu status de assinatura.
**Severidade**: BAIXA — já parcialmente coberto por #217. Consolidado aqui para completude.
**Ação**: Substituir todos os `.single()` por `.maybeSingle()` e adicionar tratamento gracioso.

### 242. generate-boleto-for-invoice — missing ownership validation

**Arquivo**: `supabase/functions/generate-boleto-for-invoice/index.ts` (187 linhas)
Função não verifica que o usuário autenticado é o professor ou aluno da fatura. Qualquer usuário autenticado pode gerar boleto para qualquer fatura fornecendo o `invoice_id`. Embora o boleto beneficie o dono da fatura, isso expõe dados pessoais (CPF, endereço) do pagador.
**Severidade**: MÉDIA — IDOR com exposição de dados pessoais sensíveis.
**Ação**: Adicionar extração do JWT e verificar ownership (`invoice.teacher_id === user.id` ou `invoice.student_id === user.id`).

### 243. check-overdue-invoices — UPDATE sem guard de status terminal (Fase 0)

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (linha 58)
O UPDATE `status: "overdue"` não possui cláusula de guarda `.eq('status', 'pendente')`. Se uma fatura foi paga (status `'paga'`) mas o cron executa antes da atualização de status do webhook, a fatura paga é revertida para `'overdue'`. **Combinação explosiva com #237**: faturas com status `'paid'` (inglês, invisíveis) são automaticamente promovidas a `'overdue'`, gerando cobranças duplicadas.
**Severidade**: ALTA — reversão de status terminal + duplicação de cobrança.
**Ação**: Adicionar `.eq('status', 'pendente')` ao UPDATE (linha 58).

### 244. automated-billing — invocação server-to-server (INFORMATIVO)

**Arquivo**: `supabase/functions/automated-billing/index.ts` (linhas 522-530)
Invocação via `supabaseAdmin.functions.invoke()` sem Authorization header explícito é correta — `supabaseAdmin` injeta automaticamente o `service_role_key`.
**Severidade**: INFORMATIVO — documentado para referência.

### 245. create-invoice — `.single()` em teacher_student_relationships

**Arquivo**: `supabase/functions/create-invoice/index.ts` (linha 154)
**Severidade**: MÉDIA — `.single()` causa HTTP 500 se relacionamento não existir.
**Ação**: Substituir por `.maybeSingle()` com mensagem amigável.

### 246. CONFIRMAÇÃO VISUAL de #196: change-payment-method `.eq()` sobreposição

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 84-85)
`.eq('responsible_id', invoice.student_id).eq('responsible_id', user.id)` — segundo filter sobrescreve primeiro. Qualquer responsável passa a verificação.

### 247. CONFIRMAÇÃO VISUAL de #181: end-recurrence sem cleanup de FKs

**Arquivo**: `supabase/functions/end-recurrence/index.ts` (linhas 67-73)
DELETE em `classes` sem limpar `class_participants` e `class_exceptions` primeiro. FK RESTRICT bloqueia deleção.

### 248. send-invoice-notification — 3× `.single()` sem fallback

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (linhas 57, 69, 99)
**Severidade**: BAIXA — crash de notificação se profile ausente.
**Ação**: Substituir por `.maybeSingle()`.

### 249. materialize-virtual-class — não herda `is_paid_class` do template

**Arquivo**: `supabase/functions/materialize-virtual-class/index.ts` (linhas 250-263)
INSERT omite `is_paid_class`. Aulas de reposição (`is_paid_class = false`) materializadas herdam DEFAULT `true`, gerando cobrança indevida.
**Severidade**: MÉDIA — cobrança indevida em aulas de reposição materializadas.
**Ação**: Adicionar `is_paid_class: template.is_paid_class` ao INSERT.

### 250. webhook-stripe-connect — 3× `.single()` em payment_origin check (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 310, 347, 457)
Antes de atualizar status de fatura para `'paid'`, os handlers `invoice.paid`, `invoice.payment_succeeded` e `payment_intent.succeeded` usam `.single()` para verificar `payment_origin`. Se a fatura não existir pelo `stripe_invoice_id`, lança HTTP 500 e Stripe retenta. **Fallback ausente**: não tenta buscar por `stripe_payment_intent_id`.
**Severidade**: ALTA — crash + retentativas infinitas do Stripe.
**Ação**: Substituir `.single()` por `.maybeSingle()`. Adicionar fallback por `stripe_payment_intent_id`.

### 251. webhook-stripe-connect — handlers de falha/void sem guard de status terminal (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linhas 380-386, 401-407, 425-431)
`invoice.payment_failed` atualiza para `'falha_pagamento'`, `invoice.marked_uncollectible` para `'overdue'`, `invoice.voided` para `'cancelada'` — **sem verificar o status atual**. Se a fatura já está `'paga'`, o status terminal é sobrescrito. Combinado com #237, faturas com status `'paid'` (inglês) também são vulneráveis.
**Severidade**: ALTA — reversão de pagamento confirmado.
**Ação**: Adicionar `.not('status', 'in', '("paga","paid")')` a cada UPDATE.

### 252. CONFIRMAÇÃO de #109: process-payment-failure-downgrade — parâmetros errados para smart-delete-student

**Arquivo**: `supabase/functions/process-payment-failure-downgrade/index.ts` (linhas 144-149)
Envia `{ studentId, reason }` mas `smart-delete-student` espera `{ student_id, teacher_id, relationship_id }`. A chamada SEMPRE falha com "Missing required fields". Alunos excedentes nunca são removidos automaticamente.
**Severidade**: CONFIRMAÇÃO de #109 — não incrementa contagem de únicas.

### 253. process-payment-failure-downgrade — 2× `.single()`

**Arquivo**: `supabase/functions/process-payment-failure-downgrade/index.ts` (linhas 55, 95)
**Severidade**: MÉDIA — crash se registro não existir.
**Ação**: Substituir por `.maybeSingle()`.

### 254. CONFIRMAÇÃO de #138: request-class — não define `is_paid_class`

**Arquivo**: `supabase/functions/request-class/index.ts` (linhas 137-146)
INSERT de classe não inclui `is_paid_class`. Herda DEFAULT `true`, disparando cobrança imediata no modelo prepaid.
**Severidade**: CONFIRMAÇÃO de #138 — não incrementa contagem de únicas.

### 255. handle-student-overage — `.single()` em user_subscriptions

**Arquivo**: `supabase/functions/handle-student-overage/index.ts` (linha 79)
**Severidade**: MÉDIA — crash se assinatura não encontrada.
**Ação**: Substituir por `.maybeSingle()`.

### 256. webhook-stripe-connect — catch block retorna HTTP 500 (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts` (linha 555)
O catch final retorna HTTP 500 para QUALQUER erro não tratado. Isso causa retentativas infinitas do Stripe para erros permanentes (ex: bug de código, schema inválido).
**Severidade**: ALTA — loop de retentativas infinito.
**Ação**: Retornar HTTP 200 com `{ received: true, error: message }`.

### 257. webhook-stripe-subscriptions — catch block retorna HTTP 500 (Fase 0)

**Arquivo**: `supabase/functions/webhook-stripe-subscriptions/index.ts` (linha 715)
Mesmo problema do #256. Parcialmente coberto por #238 (que documentava HTTP 400 nos returns explícitos), mas o catch final NÃO estava incluído.
**Severidade**: ALTA — loop de retentativas infinito.
**Ação**: Retornar HTTP 200 com `{ received: true, error: message }`.

### 258. handle-plan-downgrade-selection — audit_logs com colunas erradas (Fase 0)

**Arquivo**: `supabase/functions/handle-plan-downgrade-selection/index.ts` (linhas 29-44, 97, 226, 286)
A função `logAuditEvent` insere na tabela `audit_logs` usando colunas inexistentes: `user_id` (deveria ser `actor_id`), `action` (deveria ser `operation`), `details` e `metadata` (deveriam ser `old_data`/`new_data`). Também não inclui `table_name` e `record_id` (obrigatórios). **Todas as 3 chamadas de audit silenciosamente falham** — zero trilha de auditoria para downgrades.
**Severidade**: ALTA — perda total de auditoria para operações destrutivas (remoção de alunos).
**Ação**: Reescrever `logAuditEvent` para usar as colunas corretas da tabela `audit_logs`.

### 259. validate-payment-routing — cria fatura real como teste

**Arquivo**: `supabase/functions/validate-payment-routing/index.ts` (linhas 245-264)
Insere fatura real no banco como "teste de simulação", depois tenta deletar por `description = 'Teste de validação de roteamento'`. Se crash entre insert e delete → fatura órfã. Delete por description pode afetar faturas legítimas.
**Severidade**: MÉDIA — faturas fantasma em produção.
**Ação**: Remover teste de inserção real. Usar dry-run validation sem escrita.

### 260. CONFIRMAÇÃO de #195: verify-payment-status — sem validação de identidade

**Arquivo**: `supabase/functions/verify-payment-status/index.ts`
Não verifica se o chamador é dono da fatura. Qualquer JWT válido pode consultar e ATUALIZAR status de qualquer fatura. Pode reverter `'paga'` para `'falha_pagamento'`.
**Severidade**: CONFIRMAÇÃO de #195.

### 261. CONFIRMAÇÃO de #196: change-payment-method — double .eq() quebra guardian check

**Arquivo**: `supabase/functions/change-payment-method/index.ts` (linhas 83-86)
`.eq('responsible_id', invoice.student_id).eq('responsible_id', user.id)` — PostgREST usa o ÚLTIMO `.eq()`, anulando a verificação.
**Severidade**: CONFIRMAÇÃO de #196.

### 262. cancel-payment-intent — status 'paid' (inglês) — extensão de #237 (Fase 0)

**Arquivo**: `supabase/functions/cancel-payment-intent/index.ts` (linhas 112, 172)
Escreve `status: 'paid'` (inglês) em vez de `'paga'` (português). Faturas confirmadas manualmente ficam invisíveis no módulo financeiro. Mesmo bug que #237 em função diferente.
**Severidade**: ALTA — corrupção de dados financeiros.
**Ação**: Substituir `'paid'` por `'paga'` nas linhas 112 e 172.

### 263. create-connect-onboarding-link — IDOR quando stripe_account_id direto

**Arquivo**: `supabase/functions/create-connect-onboarding-link/index.ts` (linhas 53-56)
Quando `stripe_account_id` é fornecido diretamente, a função pula ownership validation. Atacante pode gerar link de onboarding para qualquer conta Stripe Connect.
**Severidade**: MÉDIA — IDOR para contas de pagamento.
**Ação**: Validar que o `stripe_account_id` pertence ao `user.id` autenticado.

### 264. handle-plan-downgrade-selection — não conta dependentes dos selecionados

**Arquivo**: `supabase/functions/handle-plan-downgrade-selection/index.ts` (linha 134)
Valida `selected_student_ids.length` contra `student_limit` mas não conta dependentes dos alunos selecionados. Professor pode manter alunos cujos dependentes excedem o limite.
**Severidade**: MÉDIA — violação de limite de plano.
**Ação**: Contar dependentes dos alunos selecionados e validar total contra `student_limit`.

### 265. Múltiplos .single() sem handling gracioso

**Funções**: cancel-subscription (L47/L67), create-subscription-checkout (L138), handle-plan-downgrade-selection (L111), create-connect-onboarding-link (L64).
**Severidade**: MÉDIA — crash HTTP 500 se registro não encontrado.
**Ação**: Substituir por `.maybeSingle()` com mensagens de erro claras.

### 266. validate-payment-routing — FK join syntax

**Arquivo**: `supabase/functions/validate-payment-routing/index.ts` (linhas 102-116)
Usa `profiles:student_id(...)` FK join syntax, violando a constraint de queries sequenciais para Edge Functions.
**Severidade**: BAIXA — potencial falha por schema cache stale.
**Ação**: Refatorar para queries sequenciais.

### 267. send-class-reminders — .single() em teacher dentro de loop

**Arquivo**: `supabase/functions/send-class-reminders/index.ts` (L77)
Usa `.single()` para buscar perfil do professor dentro do loop de aulas. Se o perfil estiver ausente → HTTP 500 para TODOS os lembretes restantes.
**Severidade**: MÉDIA — falha em cascata de notificações.
**Ação**: Substituir por `.maybeSingle()` com `continue`.

### 268. send-class-reminders — .single() em relationship

**Arquivo**: `supabase/functions/send-class-reminders/index.ts` (L156)
Usa `.single()` para buscar `teacher_student_relationships` dentro do loop de participantes.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 269. CONFIRMAÇÃO de #248: send-invoice-notification — 3× .single()

Confirmação visual de #248. Linhas 57, 69 e 99 usam `.single()` para invoice, student e teacher respectivamente.

### 270. send-invoice-notification — .single() em monthly_subscriptions

**Arquivo**: `supabase/functions/send-invoice-notification/index.ts` (L161)
Usa `.single()` para buscar detalhes da mensalidade. Se a subscription foi deletada entre a geração da fatura e o envio da notificação → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()` com fallback para dados genéricos.

### 271. send-cancellation-notification — .single() em dependentes dentro de loops

**Arquivo**: `supabase/functions/send-cancellation-notification/index.ts` (L117, L147, L277, L374)
Quatro chamadas `.single()` em lookups de dependentes dentro de loops de processamento.
**Severidade**: MÉDIA — crash de notificação individual propaga para o loop.
**Ação**: Substituir todas por `.maybeSingle()`.

### 272. send-class-report-notification — 5× .single()

**Arquivo**: `supabase/functions/send-class-report-notification/index.ts` (L37, L49, L107, L128, L142)
Cinco chamadas `.single()` para class, teacher, student profile, dependent e relationship. Qualquer registro ausente derruba a notificação inteira.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()` com continue/fallback.

### 273. send-class-request-notification — 3× .single() sequenciais

**Arquivo**: `supabase/functions/send-class-request-notification/index.ts` (L41, L52, L67)
Três `.single()` sequenciais para teacher, student e dependent. Qualquer ausência → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 274. send-material-shared-notification — 2× .single()

**Arquivo**: `supabase/functions/send-material-shared-notification/index.ts` (L40, L50)
`.single()` em material e teacher. Se material ou professor deletado entre request e processamento → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 275. send-boleto-subscription-notification — .single() em profile

**Arquivo**: `supabase/functions/send-boleto-subscription-notification/index.ts` (L283)
`.single()` em profile lookup. Se usuário deletado → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 276. create-dependent — inconsistência de overage com create-student

**Arquivo**: `supabase/functions/create-dependent/index.ts` (L155-166)
Quando o professor excede o limite do plano, `create-student` processa cobrança extra automaticamente via `handle-student-overage`, mas `create-dependent` simplesmente bloqueia a criação com HTTP 403. TODO na L156 nunca implementado.
**Severidade**: BAIXA — inconsistência de UX e lógica de negócio.
**Ação**: Implementar overage billing para dependentes ou unificar a mensagem de erro.

### 277. audit-logger — colunas erradas em audit_logs (extensão de #258)

**Arquivo**: `supabase/functions/audit-logger/index.ts` (L23-31)
A função exportada `logAuditEvent` insere com colunas `user_id`, `action`, `details`, `metadata` — mas a tabela `audit_logs` tem `actor_id`, `operation`, `table_name`, `record_id`. **TODOS os audit logs do sistema falham silenciosamente** porque esta é a função compartilhada usada por múltiplas edge functions.
**Severidade**: ALTA → Fase 0. Extensão sistêmica de #258.
**Ação**: Corrigir mapeamento de colunas.

### 278. check-overdue-invoices — status 'overdue' em inglês

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (L58)
Escreve `status: "overdue"` (inglês) em vez do padrão português do sistema. Faturas marcadas como 'overdue' ficam invisíveis para queries que filtram por status em português.
**Severidade**: ALTA → Fase 0 (extensão de #237).
**Ação**: Substituir por status em português consistente com o sistema.

### 279. check-overdue-invoices — tabela errada para deduplicação

**Arquivo**: `supabase/functions/check-overdue-invoices/index.ts` (L47-52, L100-105)
Usa `class_notifications` para deduplicate invoice notifications. `class_notifications` é semanticamente para aulas, não faturas. Pode causar colisões de IDs e falhas de dedup.
**Severidade**: MÉDIA.
**Ação**: Criar tabela dedicada para invoice notifications ou usar campo na própria fatura.

### 280. smart-delete-student — .single() em user_subscriptions

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (L47-52)
`updateStripeSubscriptionQuantity` usa `.single()` para buscar subscription ativa. Se professor não tem subscription → crash 500, Stripe quantity nunca é atualizada após deleção.
**Severidade**: ALTA → Fase 0 (aluno deletado mas Stripe fica dessincronizado).
**Ação**: Substituir por `.maybeSingle()` com early return.

### 281. smart-delete-student — .single() em plan lookup

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (L87-91)
`.single()` em `subscription_plans` dentro de `updateStripeSubscriptionQuantity`. Se plano deletado → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 282. smart-delete-student — SEM AUTENTICAÇÃO

**Arquivo**: `supabase/functions/smart-delete-student/index.ts` (L274-301)
Não verifica Authorization header nem valida identidade do chamador. Qualquer requisição com a URL da função pode deletar alunos arbitrariamente passando student_id/teacher_id/relationship_id.
**Severidade**: ALTA → Fase 0 (vulnerabilidade de segurança crítica).
**Ação**: Adicionar autenticação e validação de ownership (teacher_id deve ser auth.uid()).

### 283. check-subscription-status — múltiplos .single() em plans

**Arquivo**: `supabase/functions/check-subscription-status/index.ts` (L378, L460, L584, L703, L760)
Cinco chamadas `.single()` em `subscription_plans` ao longo da função. Se plano não encontrado por price_id → crash com throw.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()` com fallback para free plan.

### 284. check-pending-boletos — .single() em free plan

**Arquivo**: `supabase/functions/check-pending-boletos/index.ts` (L122)
`.single()` para buscar plano free durante expiração de boleto. Se plano free ausente → crash.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 285. process-expired-subscriptions — .single() em free plan

**Arquivo**: `supabase/functions/process-expired-subscriptions/index.ts` (L122)
`.single()` para buscar plano free. Se plano free ausente → crash para aquele usuário, loop continua mas com errorCount incrementado.
**Severidade**: MÉDIA.
**Ação**: Substituir por `.maybeSingle()`.

### 286. check-business-profile-status — .single() em pending profile

**Arquivo**: `supabase/functions/check-business-profile-status/index.ts` (L77)
`.single()` em `pending_business_profiles`. Se nenhum registro pendente → crash em vez de retornar status informativo.
**Severidade**: BAIXA.
**Ação**: Substituir por `.maybeSingle()`.

---

## 9ª Passagem: Análise Cruzada Profunda — Webhooks, Pagamentos, Cancelamento e Checkout

Funções auditadas nesta rodada (9ª passagem — análise cruzada):
- `webhook-stripe-connect/index.ts` (560 linhas) — status em inglês (#287, #288), .single() em invoice lookups (#297), sem guard em invoice.voided (#182 confirmado)
- `webhook-stripe-subscriptions/index.ts` (802 linhas) — HTTP 400 para user not found (#294), .single() em plans dentro de upsertUserSubscription L346 (#265 confirmado)
- `create-subscription-checkout/index.ts` (372 linhas) — .single() em user_subscriptions L175 (#295), cancela assinatura antes de confirmar pagamento (#296 confirma memória)
- `create-payment-intent-connect/index.ts` (659 linhas) — SEM AUTH (#175 confirmado), .single() em invoice L51 (#293 extensão)
- `process-cancellation/index.ts` (500 linhas) — SEM AUTH (#289 ALTA), confia em cancelled_by do body (#290), .single() em dependent L107 (#291)
- `create-invoice/index.ts` (575 linhas) — usa FK joins proibidos em class_participants L233 (#291), .single() em relationship L154 (#292)
- `verify-payment-status/index.ts` (124 linhas) — SEM AUTH (#293 confirma #195), .single() em invoice L40
- `change-payment-method/index.ts` (253 linhas) — double .eq() em L84-85 (#261 confirmado com código), audit_logs correto ✅
- `handle-student-overage/index.ts` (238 linhas) — insere em student_overage_charges que NÃO EXISTE (#298 confirma memória), .single() em user_subscriptions L79
- `resend-confirmation/index.ts` (202 linhas) — listUsers() sem filtro carrega TODOS os auth users (#299 confirma memória)
- `audit-logger/index.ts` (86 linhas) — colunas erradas (#277 confirmado com código)
- `smart-delete-student/index.ts` (547 linhas) — SEM AUTH (#282 confirmado com código), FK joins em class_participants L132-139

### Achados Críticos (→ Fase 0)

1. **#287 (ALTA)**: `webhook-stripe-connect` — handlers `invoice.paid` (L320) e `payment_intent.succeeded` (L469) escrevem `status: "paid"` em inglês. Faturas pagas via Stripe Connect ficam invisíveis no dashboard financeiro que filtra por `'paga'`. **Extensão sistêmica de #237.**

2. **#288 (ALTA)**: `webhook-stripe-connect` — handler `invoice.marked_uncollectible` (L404) escreve `status: "overdue"` em inglês. Faturas inadimplentes ficam invisíveis. **Extensão de #237.**

3. **#289 (ALTA)**: `process-cancellation` — **ZERO autenticação**. Aceita `cancelled_by` do body da request sem validar contra `auth.uid()`. Qualquer chamador com a URL e um class_id pode cancelar aulas e gerar faturas de multa.

4. **#290 (ALTA)**: `process-cancellation` — **Identity spoofing**: o campo `cancelled_by` (L35-36) vem do request body e é usado diretamente nos updates sem comparar com o JWT. Um atacante pode forjar a identidade de qualquer professor ou aluno para cancelar aulas. **Extensão de #289.**

5. **#294 (ALTA)**: `webhook-stripe-subscriptions` — retorna HTTP 400 para "User not found for customer" (L421-427, L513-521, L565-572, L601-607). O Stripe interpreta 400 como falha e retenta o evento infinitamente, causando overhead de processamento. Deve retornar 200 com `{ received: true, skipped: true }`.

6. **#296 (ALTA)**: `create-subscription-checkout` — cancela a assinatura Stripe existente ANTES de o usuário completar o checkout (L186-188). Se o usuário abandona a página, perde todos os benefícios do plano atual. Deve cancelar apenas após `checkout.session.completed`. **Confirma memória existente.**

7. **#297 (ALTA)**: `webhook-stripe-connect` — handlers `invoice.paid` (L310), `invoice.payment_succeeded` (L346), e `payment_intent.succeeded` (L456) usam `.single()` para buscar faturas. Se a fatura não existir no DB (evento órfão), o webhook inteiro retorna 500, causando retentativas infinitas do Stripe.

### Achados Moderados (→ Fase 2-3)

8. **#291 (MÉDIA)**: `create-invoice` — usa FK join proibido em `class_participants` (L233: `classes!inner(...)` e `class_services(...)`) que pode falhar por cache de schema do Deno. Deve usar queries sequenciais.

9. **#292 (MÉDIA)**: `create-invoice` — usa `.single()` em `teacher_student_relationships` (L154) para buscar relationship. Deve usar `.maybeSingle()` com erro descritivo.

10. **#293 (MÉDIA → confirma #195)**: `verify-payment-status` — **SEM autenticação**. Qualquer chamador com um `invoice_id` pode consultar e atualizar status de faturas arbitrárias via Stripe API.

11. **#295 (MÉDIA)**: `create-subscription-checkout` — `.single()` em `user_subscriptions` (L175). Se múltiplas subscriptions existirem para o mesmo usuário (edge case), crash.

12. **#298 (MÉDIA → confirma memória)**: `handle-student-overage` — insere em `student_overage_charges` (L132) que **não existe** no schema. Todas as cobranças de overage falham silenciosamente no tracking.

13. **#299 (MÉDIA → confirma memória)**: `resend-confirmation` — `listUsers()` sem filtro (L45) carrega TODA a tabela `auth.users` em memória. Risco de DoS e exhaustão de memória conforme a base cresce.

### Totais Atualizados (v5.46)
- 299 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 269 únicas
- 10 implementadas
- **257 pendentes**
- Fase 0: **38 itens** (+7: #287, #288, #289, #290, #294, #296, #297)
- **100% cobertura**: 75 funções auditadas (9 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (38 itens críticos), seguido por batch fix de `.single()` em funções de notificação (~30 substituições) e utilitários (~15 substituições).

---

## 11ª Passagem: Análise Cruzada Profunda — Notificações, Deduplicação e Setup

Funções auditadas nesta rodada (11ª passagem — análise cruzada profunda):
- `send-class-reminders/index.ts` (317 linhas) — FK join em class_services L36 (#309), 4× `.single()` em loops (#267-#268 confirmados)
- `send-invoice-notification/index.ts` (465 linhas) — 4× `.single()` (#269-#270 confirmados)
- `send-class-report-notification/index.ts` (294 linhas) — 6× `.single()` (#272 confirmado), throw em participants vazios L92
- `send-cancellation-notification/index.ts` (498 linhas) — 3× `.single()` em dependentes (#271 confirmado)
- `send-material-shared-notification/index.ts` (316 linhas) — 2× `.single()` (#274 confirmado)
- `send-boleto-subscription-notification/index.ts` (345 linhas) — SES direto sem shared helper (#312), `.single()` em profile L283 (#275 confirmado)
- `send-class-confirmation-notification/index.ts` (212 linhas) — 3× `.single()` (#306 extensão)
- `send-class-request-notification/index.ts` (210 linhas) — 3× `.single()` (#273 confirmado)
- `send-student-invitation/index.ts` (158 linhas) — sem auth (intencional), sem rate limiting (#313)
- `send-password-reset/index.ts` (244 linhas) — sem rate limiting (#314)
- `resend-student-invitation/index.ts` (186 linhas) — 3× `.single()` (L76, L90, L128)
- `validate-payment-routing/index.ts` (321 linhas) — 3× `.single()` (L56, L116, L154), FK join em profiles (#266 confirmado), insere fatura de teste real em produção (#307)
- `validate-monthly-subscriptions/index.ts` (355 linhas) — FK join `monthly_subscriptions!inner` L230 (#311)
- `check-overdue-invoices/index.ts` (152 linhas) — status 'overdue' inglês (#278 confirmado), deduplicação quebrada (#308), TOCTOU race condition (#310)
- `setup-billing-automation/index.ts` (69 linhas) — expõe ANON_KEY inline no cron command (#315)

### Achados Críticos (→ Fase 0)

1. **#307 (ALTA)**: `validate-payment-routing` — Na simulação de criação de fatura (L245-263), **INSERE uma fatura REAL** no banco de produção como "teste" e tenta deletar depois. Se a deleção falhar (RLS, timeout, erro de rede), faturas fantasma de R$1,00 permanecem no sistema e podem ser processadas pelo `automated-billing` ou aparecer no dashboard do aluno.

2. **#308 (ALTA)**: `check-overdue-invoices` — Deduplicação de notificações de faturas vencidas é **COMPLETAMENTE QUEBRADA**. A função verifica duplicatas em `class_notifications` usando `class_id = invoice.id` (L47-52), mas: (a) o campo `class_id` tem FK para `classes`, então IDs de faturas violam a constraint; (b) nenhuma função insere o registro de dedup após enviar a notificação de invoice; (c) resultado: **cada execução do cron re-envia notificações para TODAS as faturas vencidas**, gerando spam massivo.

### Achados Moderados

3. **#309 (MÉDIA)**: `send-class-reminders` L36 — Usa FK join inline `class_services(name)` no SELECT. Viola a constraint de queries sequenciais para Edge Functions.

4. **#310 (MÉDIA)**: `check-overdue-invoices` L56-59 — Race condition TOCTOU: o SELECT filtra `status = 'pendente'`, mas o UPDATE subsequente não inclui `.eq('status', 'pendente')` como guard clause. Se outra função marca a fatura como 'paga' entre o SELECT e o UPDATE, o status 'paga' é sobrescrito para 'overdue'.

5. **#311 (MÉDIA)**: `validate-monthly-subscriptions` L230 — Usa FK join `monthly_subscriptions!inner` na query de verificação de cascade. Viola constraint de queries sequenciais.

6. **#312 (MÉDIA)**: `send-boleto-subscription-notification` — Cria instância de `SESClient` diretamente (L304-309) em vez de usar o helper compartilhado `_shared/ses-email.ts`. Duplica configuração SES.

### Achados Baixos

7. **#313 (BAIXA)**: `send-password-reset` e `send-student-invitation` — Sem rate limiting. Chamador pode disparar emails ilimitados, habilitando spam/flooding via SES.

8. **#314 (BAIXA)**: `resend-student-invitation` — 3× `.single()` (L76, L90, L128). Menor risco pois tem auth e validação prévia.

9. **#315 (BAIXA)**: `setup-billing-automation` L31 — Expõe `SUPABASE_ANON_KEY` inline no comando SQL do cron job.

### Totais Atualizados (v5.50)
- 338 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 10 confirmações
- 308 únicas
- 10 implementadas + 2 confirmações de memória
- **296 pendentes**
- Fase 0: **50 itens** (+4: #329, #330, #334, #337)
- **100% cobertura**: 75 funções auditadas (13 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (50 itens críticos). Os 4 novos achados críticos da 13ª passagem: `webhook-stripe-connect` usa `'paid'` em vez de `'paga'` em TODOS os handlers de sucesso — pagamentos confirmados pelo Stripe ficam INVISÍVEIS no dashboard (#329); `webhook-stripe-connect` usa `'overdue'` em vez de `'vencida'` (#330); `cancel-payment-intent` usa `'paid'` em confirmação manual (#334); e `process-cancellation` invoca `create-invoice` com `SERVICE_ROLE_KEY` como Bearer, mas `create-invoice` rejeita por não ser JWT de usuário — todas as faturas de cancelamento falham silenciosamente (#337).

---

## 12ª Passagem (Análise Cruzada Profunda — Automação, Archiver, Monitoring e Setup)

Funções auditadas nesta rodada (12ª passagem — análise cruzada profunda):
- `auto-verify-pending-invoices/index.ts` (162 linhas) — sem auth (#324), sem TOCTOU guard (#319)
- `check-pending-boletos/index.ts` (239 linhas) — FK join (#320), `.single()` (#320)
- `archive-old-data/index.ts` (330 linhas) — coluna inexistente (#317), FK joins (#321), cascade incompleta (#318)
- `dev-seed-test-data/index.ts` (300 linhas) — FK join (#326), 5× `.single()` (#326)
- `stripe-events-monitor/index.ts` (124 linhas) — sem autenticação (#322)
- `check-email-availability/index.ts` (74 linhas) — sem autenticação, enumeração (#323)
- `generate-teacher-notifications/index.ts` (351 linhas) — status inglês 'overdue' (#316)
- `security-rls-audit/index.ts` (379 linhas) — `.single()` (#327)
- `list-subscription-invoices/index.ts` (120 linhas) — OK
- `refresh-stripe-connect-account/index.ts` (150 linhas) — `.single()` (#327)
- `check-stripe-account-status/index.ts` (156 linhas) — `.single()` (#327)
- `check-email-confirmation/index.ts` (139 linhas) — OK (bem implementada)
- `setup-invoice-auto-verification/index.ts` (89 linhas) — ANON_KEY inline (#328)
- `setup-class-reminders-automation/index.ts` (102 linhas) — ANON_KEY inline (#328)
- `setup-expired-subscriptions-automation/index.ts` (70 linhas) — ANON_KEY inline (#328), parâmetros RPC errados (#325)
- `setup-orphan-charges-automation/index.ts` (109 linhas) — ANON_KEY inline (#328)

### Achados Críticos (→ Fase 0)

1. **#316 (ALTA)**: `generate-teacher-notifications` L187 — Busca faturas com `status: 'overdue'` (inglês), mas o sistema usa `'vencida'` (português). Faturas vencidas **NUNCA** aparecem na inbox do professor na categoria `overdue_invoices`. Cross-referência com #287.

2. **#317 (ALTA)**: `archive-old-data` L130 — SELECT inclui `student_id` na query de `classes`, mas a tabela `classes` **NÃO TEM** coluna `student_id`. A query retorna `null` para este campo, corrompendo silenciosamente os dados nos arquivos JSON do Storage.

3. **#318 (ALTA)**: `archive-old-data` L251-284 — Cascade de deleção incompleta. Deleta apenas `class_reports`, `class_participants` e `classes`, mas ignora: `class_exceptions`, `class_notifications`, `invoice_classes`, `class_report_feedbacks`, `class_report_photos`. Constraints FK RESTRICT causam **falha total** da deleção, deixando arquivos JSON órfãos no Storage sem os dados correspondentes serem removidos do banco.

### Achados Moderados

4. **#319 (MÉDIA)**: `auto-verify-pending-invoices` L91-98 — UPDATE de status sem TOCTOU guard clause (`.eq('status', 'pendente')`). Pode sobrescrever confirmações manuais do professor (`payment_origin: 'manual'`).

5. **#320 (MÉDIA)**: `check-pending-boletos` L37-42 — FK join `subscription_plans (name)`. L122 — `.single()` para busca do plano gratuito (crash se plano não existir).

6. **#321 (MÉDIA)**: `archive-old-data` L127-162 — FK join syntax `class_participants(...)`, `class_reports(...)`. Viola constraint de queries sequenciais.

7. **#322 (MÉDIA)**: `stripe-events-monitor` — Sem autenticação. Qualquer chamador pode consultar **todos** os eventos Stripe processados, incluindo dados financeiros sensíveis (valores, IDs de pagamento, status).

8. **#323 (MÉDIA)**: `check-email-availability` — Sem autenticação. Permite **enumeração de emails** de todos os usuários registrados. Vetor de ataque para phishing/credential stuffing.

9. **#324 (MÉDIA)**: `auto-verify-pending-invoices` — Sem autenticação. Pode ser acionada por qualquer chamador, disparando chamadas à API do Stripe e atualizações no banco de dados.

10. **#325 (MÉDIA)**: `setup-expired-subscriptions-automation` L24 — Usa nomes de parâmetros **errados** para `cron_schedule` RPC (`job_name`/`schedule`/`command` em vez de `p_jobname`/`p_schedule`/`p_command`). O cron job **nunca é criado**.

### Achados Baixos

11. **#326 (BAIXA)**: `dev-seed-test-data` L251 — FK join `profiles!inner(name, email)`. 5× `.single()` (L71, L102, L132, L148, L179).

12. **#327 (BAIXA)**: `.single()` sistêmico: `security-rls-audit` L51, `refresh-stripe-connect-account` L66, `check-stripe-account-status` L59.

13. **#328 (BAIXA)**: Expansão sistêmica de #315 — Todas as 4 funções `setup-*` (`setup-invoice-auto-verification`, `setup-class-reminders-automation`, `setup-expired-subscriptions-automation`, `setup-orphan-charges-automation`) expõem `SUPABASE_ANON_KEY` inline no SQL de cron jobs.

---

## 13ª Passagem: Análise Cruzada Profunda — Webhook Connect, Lifecycle de Pagamento e Cancelamento

Funções auditadas nesta rodada (13ª passagem — análise cruzada profunda do lifecycle completo de faturamento):
- `webhook-stripe-connect/index.ts` (560 linhas) — status 'paid' inglês em 3 handlers (#329 ALTA), status 'overdue' inglês (#330 ALTA), `.single()` em 3 lookups (#333), sem status guard em failure handlers (#338)
- `create-invoice/index.ts` (575 linhas) — FK join proibido L148 (#331 confirma #25), FK join L228-241 (#331)
- `create-payment-intent-connect/index.ts` (659 linhas) — FK join proibido L37-49 com 3 FK joins aninhados (#332), `.single()` L51 (#332)
- `cancel-payment-intent/index.ts` (250 linhas) — status 'paid' inglês L113, L172 (#334 ALTA)
- `process-cancellation/index.ts` (500 linhas) — `.single()` L107 (#336), auth incompatível com create-invoice (#337 ALTA)
- `verify-payment-status/index.ts` (124 linhas) — `.single()` L40, sem IDOR protection (#339 confirma #195)
- `change-payment-method/index.ts` (253 linhas) — bug .eq() duplicado L85 (#340 confirma #196)
- `send-invoice-notification/index.ts` (465 linhas) — `.single()` L57, L69, L99 (#335)
- `automated-billing/index.ts` (1057 linhas) — FK join L71-89 (#342 confirma #300), FK join L1034 (#343), sem idempotência mensal (confirma #303)
- `handle-student-overage/index.ts` (238 linhas) — `.single()` L79, tabela inexistente L132 (confirma memória)

### Achados Críticos (→ Fase 0)

1. **#329 (ALTA — IMPACTO MASSIVO)**: `webhook-stripe-connect` — **TODOS** os handlers de pagamento bem-sucedido (`invoice.paid` L320, `invoice.payment_succeeded` L358, `payment_intent.succeeded` L469) atualizam o status da fatura para `'paid'` (inglês). O sistema inteiro (dashboard financeiro, faturas, filtros, cron jobs) usa `'paga'` (português). **Consequência**: NENHUM pagamento confirmado pelo Stripe é visível no dashboard do professor ou do aluno. As faturas permanecem como "pendente" visualmente, gerando confusão e potencialmente cobranças duplicadas.

2. **#330 (ALTA)**: `webhook-stripe-connect` L404 — Handler `invoice.marked_uncollectible` atualiza status para `'overdue'` (inglês) em vez de `'vencida'` (português). Cross-referência com #316 e #287.

3. **#334 (ALTA)**: `cancel-payment-intent` L113 e L172 — Confirmação de pagamento manual atualiza status para `'paid'` em vez de `'paga'`. Pagamentos confirmados manualmente pelo professor ficam invisíveis no dashboard.

4. **#337 (ALTA — FUNCIONALIDADE QUEBRADA)**: `process-cancellation` L450-457 — Invoca `create-invoice` passando `SUPABASE_SERVICE_ROLE_KEY` como Bearer token. Porém, `create-invoice` L44-46 usa `auth.getUser(token)` que **rejeita** tokens de service_role (não são JWTs de usuário). **Consequência**: TODAS as faturas de cancelamento com cobrança de multa falham silenciosamente. Professores nunca recebem a taxa de cancelamento.

### Achados Moderados

5. **#331 (MÉDIA → confirma #25/#291)**: `create-invoice` — FK join proibido em L148 (`business_profile:business_profiles!...`) e L228-241 (`classes!inner`, `class_services`). Viola constraint de queries sequenciais.

6. **#332 (MÉDIA)**: `create-payment-intent-connect` L37-49 — 3 FK joins aninhados (`student:profiles!...`, `teacher:profiles!...`, `business_profile:business_profiles!...`) + `.single()` L51. Viola constraint e crash se fatura não existir.

7. **#333 (MÉDIA → extensão #297)**: `webhook-stripe-connect` — `.single()` confirmado em lookups de fatura por `stripe_invoice_id` (L310, L346) e `stripe_payment_intent_id` (L457). Se a fatura não existir no DB (evento órfão), retorna 500 → retry storm.

8. **#335 (MÉDIA)**: `send-invoice-notification` — 3× `.single()` em lookups críticos: invoice (L57), student profile (L69), teacher profile (L99). Se qualquer registro estiver ausente, a função inteira falha, impedindo notificação de TODAS as faturas subsequentes no batch.

9. **#336 (MÉDIA)**: `process-cancellation` L107 — Usa `.single()` para buscar dependente. Se o dependente não existir, crash completo do cancelamento.

10. **#338 (MÉDIA)**: `webhook-stripe-connect` — Handlers de falha `invoice.payment_failed` (L380-386) e `payment_intent.payment_failed` (L514-521) atualizam status para `'falha_pagamento'` **SEM** status guard clause. Se o pagamento já foi confirmado manualmente (`payment_origin: 'manual'`, status: 'paga'), um evento de falha atrasado do Stripe sobrescreve o status 'paga', revertendo a confirmação do professor.

---

## Auditoria de 15ª Passagem (Análise Cruzada Profunda — Notificações, Dependentes, Assinaturas e Resiliência de Loops)

Funções auditadas nesta rodada (15ª passagem — análise cruzada profunda):
- `send-class-reminders/index.ts` (317 linhas) — FK joins proibidos (#347 ALTA), `.single()` em loops (#347)
- `send-invoice-notification/index.ts` (465 linhas) — `.single()` em 3 lookups críticos (#348 ALTA), `.single()` em monthly_subscriptions (confirma #335)
- `send-class-report-notification/index.ts` (294 linhas) — `.single()` em loop de participantes (#352)
- `send-cancellation-notification/index.ts` (498 linhas) — `.single()` em lookups de dependentes dentro de loops
- `send-class-confirmation-notification/index.ts` (212 linhas) — `.single()` em 3 lookups (#357)
- `send-class-request-notification/index.ts` (210 linhas) — `.single()` em 3 lookups (#357)
- `send-material-shared-notification/index.ts` (316 linhas) — `.single()` em material/teacher
- `send-boleto-subscription-notification/index.ts` (345 linhas) — `.single()` em profile (L283)
- `handle-teacher-subscription-cancellation/index.ts` (304 linhas) — ZERO auth (#350 ALTA), coluna inexistente `guardian_email` (#349), gate morto RESEND_API_KEY (#354)
- `process-payment-failure-downgrade/index.ts` (280 linhas) — `.single()` (#353), RPC inexistente `write_audit_log` (#356)
- `check-subscription-status/index.ts` (846 linhas) — FK joins proibidos (#351), múltiplos `.single()`
- `create-dependent/index.ts` (211 linhas) — SDK não pinado (#355)
- `update-dependent/index.ts` (148 linhas) — SDK não pinado (#355)
- `delete-dependent/index.ts` (240 linhas) — SDK não pinado (#355)
- `create-subscription-checkout/index.ts` (372 linhas) — `.single()` em existingSubscription (L175)
- `resend-confirmation/index.ts` (202 linhas) — sem auth (#358), `listUsers()` sem filtro (confirma memória)

### Achados Críticos (→ Fase 0)

1. **#347 (ALTA — BATCH DE LEMBRETES QUEBRADO)**: `send-class-reminders` L36-38 usa FK join `class_services (name)` e L91-94 usa `profiles (name, email)` em `class_participants`, violando a constraint de queries sequenciais. Combinado com `.single()` em teacher (L77), dependent (L114) e relationship (L156) dentro de loops, um ÚNICO registro ausente causa crash HTTP 500 que interrompe o envio de lembretes para TODOS os alunos restantes no batch.

2. **#348 (ALTA — NOTIFICAÇÕES DE FATURA SILENCIADAS)**: `send-invoice-notification` L57 (invoice), L69 (student), L99 (teacher) usam `.single()`. Quando chamada de processos automatizados (webhooks, cron), um aluno ou professor deletado causa HTTP 500, impedindo que TODAS as notificações de fatura sejam entregues.

3. **#350 (ALTA — IDOR EM CANCELAMENTO DE PROFESSOR)**: `handle-teacher-subscription-cancellation` NÃO possui autenticação. Aceita `teacher_id` diretamente do body da requisição sem validação JWT. Qualquer chamador com a anon key pode disparar void/cancelamento de TODAS as faturas pendentes de QUALQUER professor e registrar refunds falsos.

### Achados Médios

4. **#349**: `handle-teacher-subscription-cancellation` L263 referencia `student.guardian_email` na tabela `profiles`, mas essa coluna NÃO existe. O campo correto é `student_guardian_email` em `teacher_student_relationships`. Notificações de cancelamento de assinatura do professor NUNCA são enviadas ao responsável financeiro.

5. **#351**: `check-subscription-status` L35 usa FK join `profiles!teacher_student_relationships_student_id_fkey(...)` e L134 usa `subscription_plans (*)`. Viola constraint de queries sequenciais que previne problemas de schema cache no runtime Deno.

6. **#352**: `send-class-report-notification` L107 e L128 usam `.single()` dentro do loop de participantes para student profile e dependent. Um único aluno/dependente deletado crasheia notificações para TODOS os participantes restantes da aula.

7. **#353**: `process-payment-failure-downgrade` L55 usa `.single()` em `user_subscriptions` com filtro `status='active'`. Se nenhuma assinatura ativa existir (race condition com webhook), a função crasheia com HTTP 500.

8. **#354**: `handle-teacher-subscription-cancellation` L199 condiciona envio de notificações à existência de `RESEND_API_KEY`, mas a função `sendNotifications` usa AWS SES via `sendEmail` de `_shared/ses-email.ts`. Se `RESEND_API_KEY` não estiver configurada (o projeto usa SES, não Resend), notificações de cancelamento são SILENCIOSAMENTE ignoradas.

9. **#355**: `create-dependent`, `update-dependent`, `delete-dependent` importam SDK como `@supabase/supabase-js@2` (sem versão pinada), divergindo do padrão `@2.45.0` do projeto. Risco de incompatibilidade em runtime.

10. **#356**: `process-payment-failure-downgrade` L217-229 referencia RPC `write_audit_log` que pode não existir dado o mismatch conhecido do schema `audit_logs` (memória). Falha silenciosa no log de auditoria durante operações críticas de downgrade.

### Achados Baixos

11. **#357**: `send-class-confirmation-notification` L41/L65/L79 e `send-class-request-notification` L41/L53/L67 usam `.single()` para lookups de profile/dependent. Não-crítico pois são disparados por ações de usuário, mas causam erros confusos.

12. **#358**: `resend-confirmation` não possui autenticação. Qualquer chamador pode disparar reenvio de email de confirmação para qualquer endereço. Risco de abuso para spam de email.

### Totais Atualizados (v5.52)
- 358 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 12 confirmações
- 328 únicas
- 10 implementadas + 2 confirmações de memória
- **316 pendentes**
- Fase 0: **56 itens** (+3: #347, #348, #350)
- **100% cobertura**: 75 funções auditadas (15 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (56 itens críticos). Padrão SISTÊMICO: 8/9 funções `send-*` usam `.single()` em loops batch. Correção `.maybeSingle()` + `continue` deve ser aplicada como batch unificado.

---

## 16ª Passagem: Análise Cruzada Profunda — Automação de Cobrança, Faturas Vencidas, Arquivamento e Ciclo de Vida de Recorrência

Funções auditadas nesta rodada (16ª passagem — análise cruzada profunda):
- `automated-billing/index.ts` (1057 linhas) — FK joins em L71-89 e L1031-1038 (#362, #363), sem idempotência mensal (#364 ALTA), boleto→hosted_url mismatch (confirma #341)
- `check-overdue-invoices/index.ts` (152 linhas) — status 'overdue' inglês (#359 ALTA), tracking semântico quebrado (#360 ALTA), spam de notificações (#361 ALTA)
- `archive-old-data/index.ts` (330 linhas) — `student_id` inexistente em `classes` (confirma memória), cascade incompleta (confirma memória)
- `create-invoice/index.ts` (575 linhas) — FK join L148 e L233-238 (confirma #331), `.single()` L382 (#368)
- `handle-student-overage/index.ts` (238 linhas) — `.single()` L79, tabela inexistente `student_overage_charges` (confirma memória)
- `validate-payment-routing/index.ts` (321 linhas) — fatura fantasma R$1 (confirma memória), `.single()` L56/L116/L154 (#367)
- `setup-billing-automation/index.ts` (69 linhas) — ANON_KEY inline (confirma #315/#328)
- `end-recurrence/index.ts` (133 linhas) — cascade de deleção incompleta (#365 ALTA), client sem persistSession (#366)
- `resend-confirmation/index.ts` (202 linhas) — `listUsers()` sem filtro (confirma memória), sem auth (confirma #358)

### Achados Críticos (→ Fase 0)

1. **#359 (ALTA — FATURAS VENCIDAS INVISÍVEIS)**: `check-overdue-invoices` L58 atualiza status para `"overdue"` (inglês) em vez de `"vencida"` (português). Mesmo padrão sistêmico de #329/#330/#334. Dashboard financeiro, filtros e cron jobs dependem de `"vencida"`. **Consequência**: faturas marcadas como vencidas ficam invisíveis para professores e alunos, e cron jobs de cobrança subsequentes não as identificam corretamente.

2. **#360 (ALTA — TRACKING DE NOTIFICAÇÕES QUEBRADO)**: `check-overdue-invoices` L47-51 usa `class_notifications.class_id = invoice.id` para rastreamento de deduplicação. O campo `class_id` possui FK para `classes.id`, não para `invoices.id`. **Consequência dupla**: (a) inserir `invoice.id` em `class_id` viola a FK constraint; (b) a busca nunca encontra notificações anteriores porque o ID da fatura nunca coincide com um ID de classe.

3. **#361 (ALTA — SPAM DE NOTIFICAÇÕES)**: `check-overdue-invoices` NUNCA insere registro em `class_notifications` após enviar notificação (L54-70 envia mas não faz INSERT). Combinado com #360, a verificação de deduplicação (L47-51) sempre retorna null. **Consequência**: a cada execução do cron job, TODAS as faturas vencidas recebem notificação novamente, causando spam massivo de emails para alunos.

4. **#364 (ALTA — FATURAS MENSAIS DUPLICADAS)**: `automated-billing` → `processMonthlySubscriptionBilling` (L652-1024) NÃO verifica se já existe fatura `invoice_type = 'monthly_subscription'` para o ciclo atual antes de criar nova fatura. Se o cron job executar mais de uma vez no mesmo dia (retry, execução manual, falha parcial), faturas de mensalidade duplicadas são criadas para TODOS os alunos com assinatura ativa.

5. **#365 (ALTA — END-RECURRENCE SILENCIOSAMENTE FALHA)**: `end-recurrence` L67-73 deleta classes futuras materializadas SEM antes remover registros dependentes de `class_participants`, `class_exceptions` e `invoice_classes`. As FK constraints `RESTRICT` nessas tabelas bloqueiam a deleção, fazendo a função lançar erro e falhar silenciosamente para qualquer aula que tenha participantes ou exceções associados.

### Achados Médios

6. **#362**: `automated-billing` L71-89 — FK joins `profiles!teacher_id(id, name, email, payment_due_days)` e `profiles!student_id(id, name, email)` em `teacher_student_relationships`. Viola constraint de queries sequenciais que previne problemas de schema cache.

7. **#363**: `automated-billing` L1031-1038 — `validateTeacherCanBill` usa FK join `subscription_plans!inner(features)`. Viola mesma constraint.

8. **#368**: `create-invoice` L382 — `.single()` na busca de dados do responsável financeiro. Se o relacionamento não existir, crash da função inteira.

### Achados Baixos

9. **#366**: `end-recurrence` L20-23 — Cria Supabase client sem `{ auth: { persistSession: false } }`. Viola padrão de edge functions stateless.

10. **#367**: `validate-payment-routing` L56, L116, L154 — 3× `.single()` em lookups de diagnóstico. Função não-crítica, mas erros confusos para o professor.

### Totais Atualizados (v5.53)
- 368 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 12 confirmações
- 338 únicas
- 10 implementadas + 2 confirmações de memória
- **326 pendentes**
- Fase 0: **61 itens** (+5: #359, #360, #361, #364, #365)
- **100% cobertura**: 75 funções auditadas (16 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (61 itens críticos).

---

## 17ª Passagem: Análise Cruzada Profunda — Subscrições do Professor, Stripe Connect, Notificações de Relatório/Material/Convite/Confirmação/Boleto

Funções auditadas nesta rodada (17ª passagem — análise cruzada profunda):
- `cancel-subscription/index.ts` (118 linhas) — `.single()` L67 (#369 ALTA)
- `create-subscription-checkout/index.ts` (372 linhas) — `.single()` L138 (#370 ALTA), FK join + `.single()` L172-175 (#371 ALTA)
- `customer-portal/index.ts` (75 linhas) — Sem novos achados
- `list-subscription-invoices/index.ts` (120 linhas) — Sem novos achados
- `refresh-stripe-connect-account/index.ts` (150 linhas) — dual-client ANON_KEY (#383 BAIXO)
- `check-stripe-account-status/index.ts` (156 linhas) — Sem novos achados (ownership OK)
- `create-connect-account/index.ts` (148 linhas) — `.single()` L76 (#381 BAIXO)
- `create-connect-onboarding-link/index.ts` (104 linhas) — bypass ownership (#382 BAIXO)
- `send-class-report-notification/index.ts` (294 linhas) — SEM AUTH (#373 ALTA), `.single()` L37/L49/L74 (#377)
- `send-material-shared-notification/index.ts` (316 linhas) — SEM AUTH (#374 ALTA), sem persistSession + `.single()` (#375)
- `send-student-invitation/index.ts` (158 linhas) — SEM AUTH (#372 ALTA)
- `resend-student-invitation/index.ts` (186 linhas) — Sem novos achados (auth OK)
- `send-cancellation-notification/index.ts` (498 linhas) — sem persistSession (#376)
- `send-class-confirmation-notification/index.ts` (212 linhas) — `.single()` L41/L65/L79 (#378)
- `send-boleto-subscription-notification/index.ts` (345 linhas) — serve() duplicado (#380), `.single()` L282 (#379)

### Achados Críticos (→ Fase 0)

1. **#369 (ALTA — CANCEL-SUBSCRIPTION CRASH)**: `cancel-subscription` L67 usa `.single()` para buscar `user_subscriptions` ativas. Se o webhook `customer.subscription.deleted` processar antes desta chamada (race condition), a assinatura já estará 'cancelled' e `.single()` lança HTTP 500 em vez de mensagem amigável.

2. **#370 (ALTA — CHECKOUT CRASH POR PLANO INATIVO)**: `create-subscription-checkout` L138 usa `.single()` em `subscription_plans`. Se plano for desativado entre page load e clique em "Assinar", crash HTTP 500.

3. **#371 (ALTA — FK JOIN + .SINGLE() EM CHECKOUT)**: `create-subscription-checkout` L172 usa FK join `subscription_plans(*)` na query de `user_subscriptions` E `.single()`. Viola constraint de queries sequenciais E crasheia se múltiplas assinaturas existirem.

4. **#372 (ALTA — SEGURANÇA: PHISHING VIA CONVITE)**: `send-student-invitation` NÃO possui validação de identidade. Aceita `email`, `name`, `teacher_name` e `invitation_link` do body. Permite envio de emails de phishing com links maliciosos usando nome de qualquer professor como remetente.

5. **#373 (ALTA — SEGURANÇA: NOTIFICAÇÃO DE RELATÓRIO SEM AUTH)**: `send-class-report-notification` não possui autenticação. Aceita `classId` e `reportId` sem validar identidade. Permite disparo de notificações expondo dados do relatório (resumo, tarefas, feedback).

6. **#374 (ALTA — SEGURANÇA: NOTIFICAÇÃO DE MATERIAL SEM AUTH)**: `send-material-shared-notification` não possui autenticação E sem `persistSession: false`. Aceita `material_id` e `student_ids` — permite spam de notificações e exposição de dados.

### Achados Médios

7. **#375**: `send-material-shared-notification` L40/L50 `.single()` para material e teacher. Crash HTTP 500 se deletado.
8. **#376**: `send-cancellation-notification` L36-38 sem `{ auth: { persistSession: false } }`.
9. **#377**: `send-class-report-notification` L37/L49/L74 `.single()`. Registro ausente crasheia toda função.
10. **#378**: `send-class-confirmation-notification` L41/L65/L79 `.single()`.
11. **#379**: `send-boleto-subscription-notification` L282 `.single()` + usa SES client raw em vez de `_shared/ses-email.ts`.
12. **#380**: `send-boleto-subscription-notification` possui DOIS handlers `serve()` (L14 e L253). Primeiro handler é código morto.

### Achados Baixos

13. **#381**: `create-connect-account` L76 `.single()` onde `.maybeSingle()` é correto.
14. **#382**: `create-connect-onboarding-link` L53-56 aceita `stripe_account_id` direto sem ownership.
15. **#383**: `refresh-stripe-connect-account` L34 usa ANON_KEY para auth client (dual-client desnecessário).

### Totais Atualizados (v5.54)
- 383 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 12 confirmações
- 353 únicas
- 10 implementadas + 2 confirmações de memória
- **341 pendentes**
- Fase 0: **66 itens** (+5: #369, #372, #373, #374, #371)
- **100% cobertura**: 75 funções auditadas (17 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (66 itens críticos). Padrão SISTÊMICO novo identificado: 3 funções de notificação (`send-student-invitation`, `send-class-report-notification`, `send-material-shared-notification`) operam completamente sem autenticação, criando vetores de phishing e exposição de dados. `#372` é particularmente grave pois permite emails de phishing com nome de professor real como remetente. O fluxo de subscrições contém 3 crashs por `.single()` (#369-#371) que degradam a experiência de compra/cancelamento.

---

## 18ª Passagem: Análise Cruzada Profunda — Gerenciamento de Alunos/Dependentes, Expiração de Subscrições, Arquivamento

Funções auditadas nesta rodada (18ª passagem — análise cruzada profunda):
- `smart-delete-student/index.ts` (547 linhas) — SEM AUTH JWT (#384 ALTA SEGURANÇA), FK join proibido 2x (#385 ALTA), cascade incompleta (#389 ALTA, #390 ALTA), sem persistSession (#388), `.single()` plano (#387)
- `create-student/index.ts` (529 linhas) — `.single()` em plan lookup L297 (#391 MÉDIO)
- `update-student-details/index.ts` (144 linhas) — Sem novos achados (auth OK, ownership OK)
- `create-dependent/index.ts` (211 linhas) — Sem novos achados (auth OK, .maybeSingle() OK)
- `delete-dependent/index.ts` (240 linhas) — Sem novos achados (auth OK, .maybeSingle() OK, sequential queries OK)
- `update-dependent/index.ts` (148 linhas) — Sem novos achados (auth OK, .maybeSingle() OK)
- `process-expired-subscriptions/index.ts` (233 linhas) — FK join proibido 2x (#393 ALTA), `.single()` free plan (#394 MÉDIO)
- `handle-student-overage/index.ts` (238 linhas) — `.single()` subscription L79 (#395 MÉDIO), tabela inexistente `student_overage_charges` (#396 ALTA)
- `archive-old-data/index.ts` (330 linhas) — coluna inexistente `student_id` L132 (#397 ALTA), cascade incompleta (#398 ALTA)
- `resend-student-invitation/index.ts` (186 linhas) — `.single()` 3x L75/L90/L128 (#399 MÉDIO)
- `check-subscription-status/index.ts` (846 linhas) — FK join proibido 3x (#401 MÉDIO), `.single()` plan L378 (#402 MÉDIO)

### Achados Críticos (→ Fase 0)

1. **#384 (SEGURANÇA: DELEÇÃO SEM AUTH)**: `smart-delete-student` aceita `teacher_id` do body da requisição SEM validar contra o JWT do chamador. Usa `service_role` diretamente (L285). Qualquer usuário autenticado pode deletar alunos de outro professor forjando o `teacher_id`. **Impacto**: Deleção não autorizada de contas de alunos, incluindo exclusão permanente de `auth.users`.

2. **#385 (FK JOIN PROIBIDO)**: `smart-delete-student` usa `classes!inner(teacher_id)` nas linhas 133-138 e 160-167 dentro de `checkPendingClasses`. Viola a constraint de queries sequenciais, podendo falhar silenciosamente por cache de schema do Deno.

3. **#389 (CASCADE INCOMPLETA — UNLINK PATH)**: `deleteDependentsCascade` (L244-249) deleta `class_participants` sem primeiro limpar `invoice_classes.participant_id`. A FK `invoice_classes_participant_id_fkey` (RESTRICT) bloqueia a deleção para qualquer dependente que já possua faturas emitidas.

4. **#390 (CASCADE INCOMPLETA — DELETE PATH)**: Mesmo problema no caminho de deleção completa (L437-439). `class_participants` são deletados antes de `invoice_classes`, causando falha FK para alunos com histórico de faturamento.

5. **#393 (FK JOIN PROIBIDO — PROCESS-EXPIRED)**: `process-expired-subscriptions` L46-57 usa `subscription_plans!inner(...)` e `profiles!user_id(...)` — dois FK joins proibidos na mesma query. Falha silenciosa por cache de schema causa processamento parcial de assinaturas expiradas.

6. **#396 (TABELA INEXISTENTE)**: `handle-student-overage` L132 insere em `student_overage_charges` — tabela que NÃO EXISTE no schema atual. O INSERT falha silenciosamente, mas a cobrança no Stripe já foi processada. Resultado: pagamento cobrado sem rastreamento local.

### Achados Médios

7. **#387**: `smart-delete-student` L91 `.single()` no lookup de `subscription_plans`. Se plano for deletado, crash na atualização de quantity.
8. **#388**: `smart-delete-student` L285 `createClient` sem `{ auth: { persistSession: false } }`.
9. **#391**: `create-student` L297 `.single()` no lookup de `subscription_plans`. Se plano for desativado/deletado, crash HTTP 500 bloqueia criação de alunos.
10. **#394**: `process-expired-subscriptions` L122 `.single()` no lookup do plano free. Se plano free não existir, processamento de TODAS as assinaturas expiradas para.
11. **#395**: `handle-student-overage` L79 `.single()` no lookup de `user_subscriptions`. Race condition com webhook pode causar crash.
12. **#397 (CONFIRMAÇÃO)**: `archive-old-data` L132 seleciona `student_id` da tabela `classes` — coluna inexistente. Corrompe dados do arquivo JSON. (Já catalogado em memória `infrastructure/data-archiving-corruption-and-fk-blocks`.)
13. **#398 (CONFIRMAÇÃO)**: `archive-old-data` L253-289 cascade de deleção ignora `class_exceptions` e `invoice_classes`. FK RESTRICT bloqueia deleção. (Já catalogado em memória.)
14. **#399**: `resend-student-invitation` L75/L90/L128 usa `.single()` 3x (relationship, student profile, teacher profile). Qualquer registro ausente crasheia a função.

### Achados Baixos (18ª passagem)

15. **#401**: `check-subscription-status` L135 usa FK join `subscription_plans(*)`, L38 usa `profiles!teacher_student_relationships_student_id_fkey(name, email)` — queries sequenciais necessárias.
16. **#402**: `check-subscription-status` L378 `.single()` no lookup de plano por `stripe_price_id`. Se price_id não existir no DB local, crash impede sincronização.

---

## Auditoria de 19ª Passagem (Segurança, Validação, Diagnóstico, Auditoria e Stripe Connect)

Funções auditadas nesta rodada (19ª passagem):
- `validate-business-profile-deletion/index.ts` — SEM AUTH JWT (#400 ALTA SEGURANÇA)
- `stripe-events-monitor/index.ts` — SEM AUTH JWT + exposição de dados (#401 ALTA SEGURANÇA)
- `check-email-availability/index.ts` — SEM AUTH + enumeração de usuários (#402 MÉDIA SEGURANÇA)
- `audit-logger/index.ts` — Schema mismatch em audit_logs (#403)
- `handle-plan-downgrade-selection/index.ts` — Audit_logs schema mismatch (#404), `.single()` (#407)
- `security-rls-audit/index.ts` — RPC inexistente (#406), `.single()` (#408), `persistSession` ausente (#413)
- `validate-payment-routing/index.ts` — FK join proibido (#409), `.single()` 3x (#407)
- `get-teacher-availability/index.ts` — FK join proibido `classes!inner` (#405)
- `check-business-profile-status/index.ts` — `.single()` (#410), `persistSession` ausente (#414)
- `check-stripe-account-status/index.ts` — `.single()` (#411)
- `refresh-stripe-connect-account/index.ts` — `.single()` (#412)
- `check-email-confirmation/index.ts` — Sem novos achados (bem implementada)
- `customer-portal/index.ts` — Sem novos achados
- `list-business-profiles/index.ts` — Sem novos achados
- `list-pending-business-profiles/index.ts` — Sem novos achados
- `list-subscription-invoices/index.ts` — Sem novos achados

### Achados Críticos (→ Fase 0)

1. **#400 (SEGURANÇA: VALIDAÇÃO SEM AUTH)**: `validate-business-profile-deletion` não possui NENHUMA validação JWT. Aceita `business_profile_id` do body sem autenticação. Permite que atacantes anônimos enumerem faturas e nomes de alunos vinculados a qualquer perfil de negócio.
2. **#401 (SEGURANÇA: MONITOR SEM AUTH)**: `stripe-events-monitor` não possui NENHUMA validação JWT. Expõe histórico completo de eventos Stripe processados, incluindo dados de pagamento, taxas de falha, tempos de processamento e erros a chamadores anônimos.
3. **#402 (SEGURANÇA: ENUMERAÇÃO)**: `check-email-availability` não requer autenticação e revela se um email existe no sistema. Vetor clássico de enumeração de usuários para ataques de phishing ou brute force.
4. **#403 (INTEGRIDADE: AUDIT SILENTLY FAILS)**: `audit-logger` insere com colunas `user_id`, `action`, `details`, `metadata` — nenhuma existe na tabela `audit_logs` (schema real: `actor_id`, `operation`, `table_name`, `record_id`, `old_data`, `new_data`). TODOS os logs de auditoria falham silenciosamente.
5. **#404 (INTEGRIDADE: DOWNGRADE AUDIT FAILS)**: `handle-plan-downgrade-selection` L97/L226/L286 usa a mesma estrutura de audit_logs incorreta de #403. Eventos críticos de downgrade de plano não são registrados.
6. **#405 (FK JOIN PROIBIDO)**: `get-teacher-availability` L90 usa `classes!inner(class_date, duration_minutes, teacher_id)` — falha por cache de schema do Deno runtime.

### Achados Médios

7. **#406**: `security-rls-audit` L163 chama RPC `teacher_has_financial_module` — esta função não existe no database. Teste 3 (Financial Data Access) sempre crasheia, fazendo o relatório de segurança reportar falsos positivos.
8. **#407**: `handle-plan-downgrade-selection` L111 `.single()` no lookup de `subscription_plans`. Se plano não existir, toda a operação de downgrade crasheia em vez de retornar erro amigável.
9. **#408**: `security-rls-audit` L51 `.single()` no lookup de profile. Se perfil estiver em estado inconsistente, auditoria de segurança crasheia.
10. **#409**: `validate-payment-routing` L108 usa FK join `profiles:student_id(id, name, email)` — padrão proibido que pode falhar por cache de schema.
11. **#410**: `check-business-profile-status` L77 `.single()` no lookup de `pending_business_profiles`. Se registro não existir (ex: expirado e limpo pelo cron), função crasheia ao invés de retornar "não encontrado".
12. **#411**: `check-stripe-account-status` L59 `.single()` no lookup de `stripe_connect_accounts`. Se conta não existir, crash ao invés de erro amigável.
13. **#412**: `refresh-stripe-connect-account` L66 `.single()` no lookup de `stripe_connect_accounts`. Mesmo padrão de #411.

### Achados Baixos

14. **#413**: `security-rls-audit` L29-32 `supabaseAdmin` criado sem `{ auth: { persistSession: false } }`. Padrão obrigatório em Edge Functions.
15. **#414**: `check-business-profile-status` L26-29 `supabaseClient` criado sem `{ auth: { persistSession: false } }`. Padrão obrigatório.
16. **#415**: `validate-payment-routing` L26 `supabase` criado sem `{ auth: { persistSession: false } }`. Padrão obrigatório.

### 20ª Passagem — Geração de Boleto, Exceções, Materialização, Request-Class, Auto-Verificação, Cron Setup, Lembretes

1. **#416** (CRÍTICO - Segurança): `generate-boleto-for-invoice` **sem autenticação JWT**. Qualquer chamador anônimo pode gerar boletos para qualquer fatura por ID (IDOR). Permite ataque de enumeração e geração de cobranças indevidas.
2. **#417** (CRÍTICO): `generate-boleto-for-invoice` L36-43 usa FK join proibido (`profiles!invoices_student_id_fkey(...)`, `profiles!invoices_teacher_id_fkey(...)`). Risco de falha silenciosa por cache de schema.
3. **#418** (CRÍTICO - Integridade): `materialize-virtual-class` L252-263 **NÃO herda `is_paid_class`** do template. O campo reverte ao default `true`, causando cobranças indevidas para aulas de reposição/gratuitas materializadas.
4. **#419** (CRÍTICO - Integridade): `request-class` L137-146 **NÃO define `is_paid_class`** explicitamente. Default `true` pode disparar faturamento prepaid indesejado quando professor confirma a solicitação.
5. **#420** (CRÍTICO - Segurança): `auto-verify-pending-invoices` **sem autenticação JWT**. Qualquer chamador pode disparar verificação em massa e alterar status de faturas.
6. **#421** (CRÍTICO - Integridade): `auto-verify-pending-invoices` L90-98 atualiza status **sem guard clause para estados terminais**. Fatura confirmada manualmente como `paga` pode ser revertida para `falha_pagamento` se o PI no Stripe estiver cancelado.
7. **#422** (CRÍTICO - Integridade): `end-recurrence` L67-73 deleta aulas futuras **sem primeiro remover** `class_participants`, `class_exceptions` e `invoice_classes` dependentes. Causa falha total por FK RESTRICT.
8. **#423** (ALTO): `check-pending-boletos` L37-41 usa FK join proibido (`subscription_plans (name)`). Risco de falha silenciosa.
9. **#424** (ALTO): `send-class-reminders` L30-43 e L87-95 usam FK join proibido (`class_services (name)` e `profiles (...)`). Risco de falha silenciosa em loop de envio.
10. **#425** (ALTO - Segurança): `setup-billing-automation` L31 expõe `SUPABASE_ANON_KEY` inline na definição SQL do cron job. Chave visível em logs de sistema e definições de banco.
11. **#426** (MÉDIO): `end-recurrence` L20-22 `createClient` sem `{ auth: { persistSession: false } }`. Padrão obrigatório.
12. **#427** (MÉDIO): `end-recurrence` L50 usa `.single()` em busca de template. Crash se template não existir ou duplicata.
13. **#428** (MÉDIO): `manage-class-exception` L47 usa `.single()` em profiles e L134 usa `.single()` em resultado de upsert.
14. **#429** (MÉDIO): `manage-future-class-exceptions` L53 usa `.single()` em profiles.
15. **#430** (MÉDIO - Resiliência): `send-class-reminders` usa `.single()` em **4 locais** dentro de loops (L77 teacher, L114 dependent, L127 studentProfile, L156 relationship). Qualquer registro ausente crasha todo o loop de lembretes.
16. **#431** (MÉDIO): `check-pending-boletos` L122 usa `.single()` em busca de plano free. Crash se plano free não existir.
17. **#432** (MÉDIO): `auto-verify-pending-invoices` L75-77 usa chave Stripe da plataforma para recuperar Payment Intents criados em contas Connect. Requer parâmetro `stripeAccount` para acessar PI correto.
18. **#433** (MÉDIO): `materialize-virtual-class` L28 `createClient` sem `{ auth: { persistSession: false } }`. Padrão obrigatório.

### Padrão Sistêmico Novo: Funções de Diagnóstico/Validação sem Auth

Identificado um padrão transversal: funções de **diagnóstico, validação e monitoramento** (`validate-business-profile-deletion`, `stripe-events-monitor`, `check-email-availability`) foram implementadas sem autenticação, presumivelmente por serem consideradas "utilitárias". No entanto, estas funções expõem dados sensíveis (nomes de alunos, dados financeiros, existência de emails) e devem obrigatoriamente requerer JWT ou, no mínimo, validação de service_role para chamadas internas.

### Padrão Sistêmico Confirmado: audit_logs Schema Mismatch

O schema mismatch em `audit_logs` (#403/#404) é SISTÊMICO — afeta `audit-logger`, `handle-plan-downgrade-selection`, e potencialmente qualquer outra função que importe ou replique a função `logAuditEvent`. O resultado é que **ZERO logs de auditoria estão sendo gravados** em todo o sistema, apesar do código existir e não lançar erros visíveis.

### Totais Atualizados (v5.56)
- 415 pontas soltas totais
- 18 duplicatas + 2 subsumidas + 12 confirmações + 2 confirmações de memória
- 385 únicas
- 10 implementadas
- **373 pendentes**
- Fase 0: **78 itens** (+6: #400, #401, #402, #403, #404, #405)
- **100% cobertura**: 75 funções auditadas (19 passagens completas)

### Status Final
Prioridade de execução: Fase 0 (78 itens críticos). Padrão SISTÊMICO novo identificado: funções de diagnóstico/validação (`validate-business-profile-deletion`, `stripe-events-monitor`, `check-email-availability`) operam sem autenticação, expondo dados sensíveis. O schema mismatch de `audit_logs` (#403/#404) é confirmado como sistêmico — NENHUM log de auditoria é gravado em todo o projeto, apesar do código dedicado existir em múltiplas funções. A combinação de zero logging + funções sem auth cria um ponto cego total de segurança.

---

| Versão | Data | Mudanças |
|--------|------|----------|
| v4.0 | 2026-02-12 | Simplificação radical: charge_timing + is_paid_class |
| v4.1 | 2026-02-13 | 16 pontas soltas identificadas e incorporadas |
| v4.2 | 2026-02-13 | +7 pontas soltas (#17-#23), +4 melhorias (M1-M4), reordenação de fases |
| v4.3 | 2026-02-13 | +6 pontas soltas (#24-#29), +3 melhorias (M5-M7) |
| v4.4 | 2026-02-13 | +6 pontas soltas (#30-#35), +3 melhorias (M8-M10) |
| v4.5 | 2026-02-13 | +5 pontas soltas (#36-#40), +2 melhorias (M11-M12) |
| v4.6 | 2026-02-13 | +6 pontas soltas (#41-#46), +3 melhorias (M13-M15) |
| v4.7 | 2026-02-13 | +5 pontas soltas (#47-#51), +2 melhorias (M16-M17), 2 resolvidas |
| v4.8 | 2026-02-13 | +5 pontas soltas (#52-#56), +2 melhorias (M18-M19) |
| v4.9 | 2026-02-13 | +5 pontas soltas (#57-#61), +3 melhorias (M20-M22) |
| v5.0 | 2026-02-13 | +6 pontas soltas (#62-#67), +3 melhorias (M23-M25), 1 duplicata resolvida |
| v5.1 | 2026-02-13 | +6 pontas soltas (#68-#73), +3 melhorias (M26-M28) |
| v5.2 | 2026-02-13 | +6 pontas soltas (#74-#79), +3 melhorias (M29-M31) |
| v5.3 | 2026-02-13 | +6 pontas soltas (#80-#85), +4 melhorias (M32-M35) |
| v5.4 | 2026-02-13 | +6 pontas soltas (#86-#91), +3 melhorias (M36-M38) |
| v5.5 | 2026-02-13 | +6 pontas soltas (#92-#97), +3 melhorias (M39-M41) |
| v5.6 | 2026-02-13 | +6 pontas soltas (#98-#103), +3 melhorias (M42-M44) |
| v5.7 | 2026-02-14 | +5 pontas soltas (#104-#108), +1 melhoria (M45) |
| v5.8 | 2026-02-14 | +5 pontas soltas (#109-#113), +1 melhoria (M46) |
| v5.9 | 2026-02-14 | +5 pontas soltas (#114-#118), +2 melhorias (M47-M48) |
| v5.10 | 2026-02-14 | +5 pontas soltas (#119-#123), +3 melhorias (M49-M51). Cobertura exaustiva concluída. |
| v5.11-v5.40 | 2026-02-14/16 | Auditorias incrementais: +119 pontas soltas (#124-#242). Detalhes no changelog anterior. |
| v5.41 | 2026-02-16 | **4ª passagem: funções financeiras core — análise cruzada**. +7 pontas soltas (#243-#249). 1 item adicionado à Fase 0 (22 itens). Totais: **249 pontas soltas**, **227 únicas**, **215 pendentes**. |
| v5.42 | 2026-02-16 | **5ª passagem: webhooks, subscrições e student management**. +8 pontas soltas (#250-#257). 4 itens adicionados à Fase 0 (26 itens). Totais: **257 pontas soltas**, **233 únicas**, **221 pendentes**. |
| v5.43 | 2026-02-16 | **6ª passagem: subscription management, payment flows e Connect**. +9 pontas soltas (#258-#266). 2 itens adicionados à Fase 0 (28 itens). Totais: **266 pontas soltas**, **238 únicas**, **226 pendentes**. |
| v5.44 | 2026-02-16 | **7ª passagem: notificações, entity management e CRUD**. +10 pontas soltas (#267-#276). Nenhum item adicionado à Fase 0 (28 itens mantidos). Totais: **276 pontas soltas**, **247 únicas**, **235 pendentes**. |
| v5.45 | 2026-02-16 | **8ª passagem: automação, verificação e utilitários**. +10 pontas soltas (#277-#286). 3 itens adicionados à Fase 0 (31 itens). Totais: **286 pontas soltas**, **257 únicas**, **245 pendentes**. |
| v5.46 | 2026-02-17 | **9ª passagem: análise cruzada profunda — webhooks, pagamentos, cancelamento e checkout**. +13 pontas soltas (#287-#299). 7 itens adicionados à Fase 0 (38 itens). Totais: **299 pontas soltas**, **269 únicas**, **257 pendentes**. |
| v5.47 | 2026-02-17 | **10ª passagem: análise cruzada — billing automation, materialização, recorrência e exceções**. +7 pontas soltas (#300-#306). 3 itens adicionados à Fase 0 (41 itens). Totais: **306 pontas soltas**, **276 únicas**, **264 pendentes**. |
| v5.48 | 2026-02-17 | **11ª passagem: análise cruzada profunda — notificações, deduplicação e setup**. +9 pontas soltas (#307-#315). 2 itens adicionados à Fase 0 (43 itens). Totais: **315 pontas soltas**, **285 únicas**, **273 pendentes**. |
| v5.49 | 2026-02-17 | **12ª passagem: análise cruzada profunda — automação, archiver, monitoring e setup**. +13 pontas soltas (#316-#328). 3 itens adicionados à Fase 0 (46 itens). Totais: **328 pontas soltas**, **298 únicas**, **286 pendentes**. |
| v5.50 | 2026-02-17 | **13ª passagem: análise cruzada profunda — webhook-connect, create-invoice, payment-intent, cancellation e billing lifecycle**. +10 pontas soltas (#329-#338). 4 itens adicionados à Fase 0 (50 itens). Totais: **338 pontas soltas**, **308 únicas**, **296 pendentes**. |
| v5.51 | 2026-02-17 | **14ª passagem: análise cruzada profunda — materialização, deleção de alunos e integração de pagamento**. +8 pontas soltas (#339-#346). 3 itens adicionados à Fase 0 (53 itens). Totais: **346 pontas soltas**, **316 únicas**, **304 pendentes**. |
| v5.52 | 2026-02-17 | **15ª passagem: análise cruzada profunda — notificações, dependentes, assinaturas do professor e resiliência de loops**. +12 pontas soltas (#347-#358). 3 itens adicionados à Fase 0 (56 itens). Totais: **358 pontas soltas**, **328 únicas**, **316 pendentes**. |
| v5.53 | 2026-02-17 | **16ª passagem: análise cruzada profunda — automação de cobrança, faturas vencidas, arquivamento e ciclo de vida de recorrência**. +10 pontas soltas (#359-#368). 5 itens adicionados à Fase 0 (61 itens). Totais: **368 pontas soltas**, **338 únicas**, **326 pendentes**. |
| v5.54 | 2026-02-17 | **17ª passagem: análise cruzada profunda — subscrições do professor, Stripe Connect, notificações de relatório/material/convite/confirmação/boleto**. +15 pontas soltas (#369-#383). 5 itens adicionados à Fase 0 (66 itens). Totais: **383 pontas soltas**, **353 únicas**, **341 pendentes**. |
| v5.55 | 2026-02-17 | **18ª passagem: análise cruzada profunda — gerenciamento de alunos/dependentes, expiração de subscrições, arquivamento**. +16 pontas soltas (#384-#399). 6 itens adicionados à Fase 0 (72 itens). Totais: **399 pontas soltas**, **369 únicas**, **357 pendentes**. |
| v5.56 | 2026-02-17 | **19ª passagem: análise cruzada profunda — segurança, validação, diagnóstico, auditoria e Stripe Connect**. +16 pontas soltas (#400-#415). 6 itens adicionados à Fase 0 (78 itens). Totais: **415 pontas soltas**, **385 únicas**, **373 pendentes**. |
| v5.57 | 2026-02-17 | **20ª passagem: análise cruzada profunda — geração de boleto, exceções de aula, materialização, request-class, auto-verificação, cron setup, lembretes e boletos pendentes**. +18 pontas soltas (#416-#433). 8 itens adicionados à Fase 0 (86 itens). Totais: **433 pontas soltas**, **403 únicas**, **391 pendentes**. |
| v5.58 | 2026-02-17 | **21ª passagem: análise cruzada profunda — status mismatch sistêmico, destruição de dados de pagamento, webhook resilience, FK joins em funções core**. +18 pontas soltas (#434-#451). 8 itens adicionados à Fase 0 (94 itens). Totais: **451 pontas soltas**, **421 únicas**, **409 pendentes**. |

## Memórias do Projeto a Atualizar

Após implementação, atualizar:
1. `constraints/concorrencia-faturamento-pre-post-pago` — referencia `process-class-billing`
2. `features/billing/arquitetura-implementacao-hibrida` — referencia `process-class-billing` como "roteador central"
3. `features/billing/prepaid-cancellation-refund-policy` — menciona "void automático no Stripe"
4. `payment/stripe-pix-configuration-logic` — menciona taxa fixa de R$3,49 por boleto (atualizar para taxas variáveis)
5. `features/teacher-inbox/amnesty-flow-calendar` — deve documentar a limitação da anistia para faturas consolidadas (#37/M11)
6. `features/billing/prazo-vencimento-padrao-consistencia` — deve documentar que create-invoice agora respeita payment_due_days (#44/M13)
7. `database/invoice-overdue-notification-tracking` — deve documentar solução da ponta #47/#71 (bug de idempotência crítico)
8. `infrastructure/supabase-query-patterns` — deve listar #52, #57, #58, #69, #119, #120, #121, #123 como exemplos de FK joins a corrigir
9. `features/billing/ui-feedback-constraints` — deve documentar que stripe_hosted_invoice_url armazena boleto_url (M22)
10. `database/billing-rpc-filters-experimental-dependents` — deve documentar adição de filtro `is_paid_class = true` (#65)
11. `style/invoice-display-badges` — deve documentar consolidação do InvoiceTypeBadge com 7 tipos (M24)
12. `features/monthly-subscriptions/billing-logic` — deve documentar processamento de cancelamentos com cobrança dentro da mensalidade (#68/M26)
13. `constraints/error-handling-user-friendly-messages` — deve listar create-invoice (#72), automated-billing (#76) e webhook-stripe-connect (#77) como exemplos de correção
14. `infrastructure/stripe-webhook-error-handling` — NOVA: documentar padrão de retorno HTTP 200 para falhas de update vs 500 para falhas de validação (#77/M29)
15. `infrastructure/cron-automation-security` — NOVA: documentar padrão de funções de automação sem auth (#322-#324) e ANON_KEY inline sistêmico (#315, #328)
16. `infrastructure/archive-data-integrity` — NOVA: documentar coluna inexistente `student_id` em `classes` (#317) e cascade de deleção incompleta (#318)
17. `security/student-management-auth-constraints` — ATUALIZAR: documentar que smart-delete-student (#384) aceita teacher_id do body sem validação JWT
18. `database/student-deletion-cascade-order-bug` — ATUALIZAR: documentar que invoice_classes deve ser limpa antes de class_participants (#389/#390)
19. `database/audit-logs-schema-mismatch` — ATUALIZAR: confirmar que o schema mismatch é sistêmico (#403/#404) — ZERO logs de auditoria sendo gravados
20. `security/diagnostic-functions-no-auth` — NOVA: documentar que validate-business-profile-deletion (#400), stripe-events-monitor (#401) e check-email-availability (#402) operam sem autenticação
