# Plano de Cobrança Híbrida — v4.2

**Data**: 2026-02-13
**Status Fase 1 (Migração SQL)**: ✅ Concluída

---

## Contexto

O plano anterior (v3.10, 228 gaps, ~2939 linhas) foi substituído por regras de negócio simplificadas na v4.0. A v4.1 incorporou 16 pontas soltas. Esta v4.2 adiciona 7 novas pontas soltas (#17-#23) e 4 melhorias (M1-M4) identificadas em revisão profunda do código.

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
    const { error } = await supabase.functions.invoke('create-invoice', {
      body: { student_id, class_id, invoice_type: 'prepaid_class', ... }
    })
    if (error) toast({ title: t('...'), variant: 'destructive' })
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

### 5. Backend — Cancelamento

#### 5.1 Aula não paga (Pontas #5.1, #19)
- `process-cancellation` deve buscar `is_paid_class` na query da aula
- Quando `is_paid_class = false`: forçar `shouldCharge = false`

#### 5.2 Aula pré-paga (Pontas #5.2, #19)
- `process-cancellation` deve buscar `charge_timing` do `business_profiles` do professor
- Quando `charge_timing = 'prepaid'` E `is_paid_class = true`: forçar `shouldCharge = false`
- Mensagem: "Esta aula já foi cobrada antecipadamente. Eventuais ajustes devem ser combinados diretamente com o aluno."

#### 5.3 CancellationModal (Pontas #19, #20)
- Query da aula (~linha 113) deve incluir `is_paid_class`
- Buscar `charge_timing` do `business_profiles` do professor
- Lógica de `willBeCharged` (~linha 179):
  - Se `is_paid_class = false`: `willBeCharged = false` (igual a experimental)
  - Se `charge_timing = 'prepaid'` e `is_paid_class = true`: `willBeCharged = false` com mensagem distinta

#### 5.4 Aula pós-paga
- Cancelamento com política de cobrança (já funciona)
- Anistia disponível via AmnestyButton com nova validação

### 6. Frontend — AmnestyButton.tsx

#### 6.1 Verificação de faturamento (Ponta #6.1)
- Antes de exibir o botão, consultar `invoice_classes WHERE class_id = :classId`
- **Não faturada**: mostrar botão de anistia
- **Já faturada**: mostrar label "Não é possível conceder anistia. Esta aula já foi incluída em uma fatura."
- **Aula pré-paga cancelada**: NÃO mostrar botão (precisa de `is_paid_class` e `charge_timing`)

### 7. Backend — automated-billing + materialize-virtual-class

#### 7.1 Filtrar aulas gratuitas (Ponta #7.1)
- RPC `get_unbilled_participants_v2`: adicionar `AND c.is_paid_class = true` ao lado de `AND c.is_experimental = false`

#### 7.2 Propagar is_paid_class na materialização (Pontas #8.1, #17)
- Edge function `materialize-virtual-class` (~linha 252): adicionar `is_paid_class: template.is_paid_class`
- Frontend `materializeVirtualClass` (Agenda.tsx, ~linha 1288): adicionar `is_paid_class` ao `realClassData`

#### 7.3 Teste de regressão (M3)
- Após alterar a RPC, executar `automated-billing` para professor existente
- Verificar que nenhuma aula existente (todas com `is_paid_class = true` por default) é perdida

### 8. Frontend — InvoiceTypeBadge + i18n

#### 8.1 Consolidar InvoiceTypeBadge (Ponta #21)
- `InvoiceTypeBadge.tsx` (componente compartilhado) suporta apenas 3 tipos: `monthly_subscription`, `automated`, `manual`
- `Financeiro.tsx` (inline) já suporta 5 tipos: inclui `cancellation` e `orphan_charges`
- **Decisão**: migrar `Financeiro.tsx` para usar `InvoiceTypeBadge` como fonte única de verdade
- Adicionar ao `InvoiceTypeBadge`: `prepaid_class`, `cancellation`, `orphan_charges`

#### 8.2 Chaves i18n necessárias (Ponta #10.1)
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
| 3 | ClassForm: campo `is_paid_class` + bloqueio recorrência | #2.3, M1 | Pendente |
| 4 | automated-billing RPC + materialize (filtro `is_paid_class`) | #7.1, #8.1, #17, M3 | Pendente |
| 5 | Agenda.tsx: persistir `is_paid_class` + gerar fatura pré-paga | #2.4, #17, #18, #4.3, #23 | Pendente |
| 6 | Cancelamento: process-cancellation + CancellationModal | #5.1, #5.2, #19, #20 | Pendente |
| 7 | AmnestyButton: verificação de faturamento + label | #6.1 | Pendente |
| 8 | InvoiceTypeBadge consolidação + i18n + testes | #9.1, #21, #10.1, #16 | Pendente |

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

## Memórias do Projeto a Atualizar

Após implementação, atualizar:
1. `constraints/concorrencia-faturamento-pre-post-pago` — referencia `process-class-billing`
2. `features/billing/arquitetura-implementacao-hibrida` — referencia `process-class-billing` como "roteador central"
3. `features/billing/prepaid-cancellation-refund-policy` — menciona "void automático no Stripe"
