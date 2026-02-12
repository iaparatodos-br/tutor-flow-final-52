# Plano de Cobrança Híbrida — v4.0

**Data**: 2026-02-12
**Status Fase 1 (Migração SQL)**: ✅ Concluída

---

## Contexto

O plano anterior (v3.10, 228 gaps, ~2939 linhas) foi substituído por regras de negócio simplificadas. As principais mudanças:

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
- No local onde o professor escolhe "paga antes" ou "paga depois", exibir card explicativo detalhando cada modelo, fluxo e tratamento de cancelamento

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

### 2. Frontend — ClassForm.tsx

#### 2.1 Novo campo "Aula Paga"
- Switch/checkbox "Esta aula será cobrada?" entre Tipo de Aula e Seleção de Serviço
- Visível apenas quando `is_experimental = false`
- Default: `true`

#### 2.2 Bloqueio de recorrência
- Quando `charge_timing = 'prepaid'` E `is_paid_class = true`: desabilitar recorrência + tooltip
- Quando `is_paid_class = false`: recorrência sempre liberada

#### 2.3 Dados necessários
- ClassForm precisa receber `charge_timing` do professor (via props ou query)
- ClassFormData inclui `is_paid_class: boolean`

### 3. Frontend — BillingSettings.tsx

#### 3.1 Card "Modelo de Cobrança"
- Dois cards selecionáveis: "Cobrar Antes" e "Cobrar Depois"
- Card informativo explicando cada modelo

#### 3.2 Carregamento e salvamento
- Buscar `charge_timing` do `business_profiles` no `loadSettings`
- Salvar via `UPDATE business_profiles SET charge_timing = ...`

### 4. Backend — Geração de fatura pré-paga

#### 4.1 Quando gerar
- No submit do ClassForm, após criar a aula
- Condições: `charge_timing = 'prepaid'` E `is_paid_class = true` E `is_experimental = false` E professor tem `business_profile`

#### 4.2 Como gerar
- Reutilizar lógica do `create-invoice`
- `invoice_type = 'prepaid_class'`, status `pendente`
- Método de pagamento segue hierarquia existente (Boleto > PIX > Nenhum)

### 5. Backend — Cancelamento

#### 5.1 Aula não paga (`is_paid_class = false`)
- Cancelamento normal sem impacto financeiro

#### 5.2 Aula paga antes (pré-paga)
- Cancelar aula normalmente
- NÃO cancelar/void a fatura, NÃO gerar reembolso/anistia
- Mensagem no CancellationModal

#### 5.3 Aula paga depois (pós-paga)
- Cancelamento com política de cobrança (já funciona)
- Anistia disponível via AmnestyButton com nova validação

### 6. Frontend — AmnestyButton.tsx

#### 6.1 Verificação de faturamento
- Consultar `invoice_classes WHERE class_id = :classId`
- **Não faturada**: mostrar botão de anistia
- **Já faturada**: mostrar label "Não é possível conceder anistia. Esta aula já foi incluída em uma fatura."
- **Aula pré-paga cancelada**: NÃO mostrar botão

### 7. Backend — automated-billing

#### 7.1 Filtrar aulas gratuitas
- `get_unbilled_participants_v2` deve adicionar `AND c.is_paid_class = true`

### 8. i18n — Novas chaves (PT e EN)
- `billing.chargeTiming.*`
- `classes.isPaidClass` / `classes.isPaidClassDescription`
- `classes.recurrenceBlockedPrepaid`
- `cancellation.prepaidWarning`
- `amnesty.alreadyInvoiced`

---

## Fases de Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| 0 | Correções críticas no webhook existente (Gaps 82-115 do plano original) | Pendente |
| 1 | Migração SQL: `charge_timing` + `is_paid_class` | ✅ Concluída |
| 2 | BillingSettings: card de seleção charge_timing com card informativo | Pendente |
| 3 | ClassForm: campo "aula paga" + bloqueio de recorrência condicional | Pendente |
| 4 | Agenda.tsx: gerar fatura pré-paga no submit (reutilizar create-invoice) | Pendente |
| 5 | Cancelamento: simplificar process-cancellation + CancellationModal | Pendente |
| 6 | AmnestyButton: verificação de faturamento + label de aviso | Pendente |
| 7 | automated-billing: filtrar is_paid_class + i18n | Pendente |
| 8 | Testes e validação end-to-end | Pendente |

---

## O que foi REMOVIDO do plano v3.10

1. Edge function `process-class-billing`
2. Lógica de Invoice Items + Invoice + Finalize no Stripe Connect para pré-pago
3. Lógica de void/cancel de faturas Stripe no cancelamento
4. Lógica de reembolso (pending_refunds para pré-pago)
5. Complexidade de materialização com billing no frontend
6. ~60% dos 228 gaps originais

## O que foi ADICIONADO

1. Campo `is_paid_class` na tabela `classes`
2. Switch "Aula paga" no ClassForm
3. Card informativo no BillingSettings explicando cada modelo
4. Verificação de faturamento no AmnestyButton
5. Label "já faturada" no modal da aula
6. Mensagem no CancellationModal para aulas pré-pagas
