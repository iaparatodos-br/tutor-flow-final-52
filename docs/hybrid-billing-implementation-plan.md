# Plano de Implementação: Cobrança Híbrida Global (Pré-paga / Pós-paga)

> **Versão**: 1.1 (Revisada)
> **Data**: 2026-02-07
> **Status**: Aprovado - Pronto para Implementação

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura da Solução](#2-arquitetura-da-solução)
3. [Estrutura de Dados](#3-estrutura-de-dados)
4. [Implementação Frontend](#4-implementação-frontend)
5. [Implementação Backend](#5-implementação-backend)
6. [Internacionalização (i18n)](#6-internacionalização-i18n)
7. [Cancelamento e Edição](#7-cancelamento-e-edição)
8. [Webhooks e Reconciliação](#8-webhooks-e-reconciliação)
9. [Compatibilidade com Sistema Existente](#9-compatibilidade-com-sistema-existente)
10. [Riscos e Mitigações](#10-riscos-e-mitigações)
11. [Sequência de Implementação](#11-sequência-de-implementação)
12. [Arquivos a Criar/Modificar](#12-arquivos-a-criarmodificar)
13. [Checklist de Deploy](#13-checklist-de-deploy)

---

## 1. Visão Geral

### 1.1 Contexto do Problema

O sistema Tutor Flow atualmente possui dois modelos de cobrança:

- **Mensalidades (Assinaturas)**: Cobradas automaticamente via `automated-billing` no `billing_day` do aluno. São **estritamente pré-pagas** e seguem o padrão Stripe Subscriptions interno.
- **Serviços (Aulas Avulsas/Extras)**: Atualmente acumuladas e cobradas apenas no ciclo de faturamento (`automated-billing`), sem opção de cobrança imediata.

**Problema**: O professor não tem controle sobre QUANDO cobrar aulas avulsas. Alguns professores querem cobrar imediatamente ao agendar (pré-pago), enquanto outros preferem acumular para o próximo ciclo (pós-pago). Atualmente, todas as aulas são pós-pagas por padrão.

### 1.2 Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Professor pode configurar globalmente se aulas avulsas são pré-pagas ou pós-pagas | Alta |
| RF02 | A configuração fica em Configurações > Cobranças (BillingSettings) | Alta |
| RF03 | O padrão é **pré-paga** (cobrar no agendamento) | Alta |
| RF04 | Mensalidades NÃO são afetadas (sempre seguem ciclo próprio) | Alta |
| RF05 | O valor das aulas vem do cadastro de Serviços (sem edição manual) | Alta |
| RF06 | Pré-paga: Gera fatura imediata ao agendar a aula | Alta |
| RF07 | Pós-paga: Apenas registra a aula, será cobrada no próximo ciclo | Alta |
| RF08 | Recorrências: cobrança individual na materialização (não em lote) | Alta |
| RF09 | Aulas com fatura emitida (pré-paga) bloqueiam edição de serviço/preço | Média |
| RF10 | Cancelamento de aula com fatura emitida anula a fatura no Stripe | Alta |
| RF11 | Cancelamento de aula sem fatura apenas marca como cancelada | Alta |
| RF12 | Webhook `invoice.paid` atualiza status da aula | Alta |

### 1.3 Requisitos Não-Funcionais

| ID | Requisito | Métrica |
|----|-----------|---------|
| RNF01 | Configuração deve ser salva instantaneamente | < 500ms |
| RNF02 | Geração de fatura pré-paga deve ser atômica | Rollback se Stripe falhar |
| RNF03 | Retrocompatibilidade total com cobrança existente | 100% mantida |
| RNF04 | Internacionalização completa | PT e EN |

### 1.4 Decisões de Design

| Decisão | Opções Consideradas | Escolha | Justificativa |
|---------|---------------------|---------|---------------|
| Escopo da configuração | Por aula / Global | **Global** | Simplifica UX, evita decisão a cada agendamento |
| Local da configuração | ClassForm / Configurações | **Configurações** | Decisão de negócios, não operacional |
| Padrão | Pré-paga / Pós-paga | **Pré-paga** | Mais seguro para o professor (cobra antes) |
| Armazenamento | profiles / business_profiles | **business_profiles** | Vinculado ao negócio/Stripe do professor |
| Mensalidades afetadas? | Sim / Não | **Não** | Mensalidades têm ciclo próprio |
| Edição de preço na aula | Permitir / Não permitir | **Não permitir** | Preço vem do cadastro de Serviços |
| Status da aula pré-paga | awaiting_payment / confirmada | **confirmada** | Mantém consistência; fatura é separada da aula |
| invoice_type para pré-paga | prepaid_class / automated | **prepaid_class** | Tipo distinto para filtragem e display |
| Roteamento de business_profile | Fixo / Via relationship | **Via relationship** | Usa `teacher_student_relationships.business_profile_id` (padrão existente) |
| Reuso de create-invoice | Chamar / Duplicar lógica | **Lógica própria** | Invoices Stripe são criadas diretamente; `create-invoice` usa Payment Intents |
| Materialização de recorrência | Billing no frontend / No edge function | **No frontend (Agenda.tsx)** | Materialização server-side (aluno) não gera cobrança; billing é do professor |

---

## 2. Arquitetura da Solução

### 2.1 Diagrama de Fluxo de Cobrança

```text
                      ┌──────────────────────────────────────────────────┐
                      │         PROFESSOR AGENDA AULA(S)                  │
                      └───────────────────────┬──────────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │  Aula é experimental?    │
                                 └─────────┬───────────────┘
                                           │
                               ┌───────────┴───────────┐
                               │ SIM                    │ NÃO
                               ▼                       ▼
                     ┌──────────────────┐    ┌──────────────────────────┐
                     │ Registrar apenas  │    │ Professor tem            │
                     │ no banco          │    │ business_profile?        │
                     │ (sem cobrança)    │    └──────────┬───────────────┘
                     └──────────────────┘               │
                                              ┌─────────┴──────────┐
                                              │ NÃO                │ SIM
                                              ▼                    ▼
                                   ┌────────────────┐   ┌──────────────────────────┐
                                   │ Registrar       │   │ Buscar charge_timing do  │
                                   │ apenas no banco │   │ business_profiles        │
                                   │ (sem Stripe)    │   └──────────┬───────────────┘
                                   └────────────────┘              │
                                              ┌─────────┴──────────┐
                                              │                    │
                                     charge_timing           charge_timing
                                     = 'prepaid'             = 'postpaid'
                                              │                    │
                                              ▼                    ▼
                                ┌──────────────────┐   ┌──────────────────────┐
                                │  FLUXO PRÉ-PAGO   │   │  FLUXO PÓS-PAGO      │
                                ├──────────────────┤   ├──────────────────────┤
                                │ 1. Criar aulas    │   │ 1. Criar aulas       │
                                │    no banco       │   │    no banco          │
                                │ 2. Criar Invoice  │   │ 2. FIM               │
                                │    Items Stripe   │   │                      │
                                │    (Connected)    │   │ Aulas serão          │
                                │ 3. Criar Invoice  │   │ capturadas pelo      │
                                │    imediata       │   │ automated-billing    │
                                │ 4. Finalizar      │   │ no próximo ciclo     │
                                │    Invoice        │   └──────────────────────┘
                                │ 5. Salvar IDs     │
                                │    no banco       │
                                │ 6. Criar registro │
                                │    em `invoices`  │
                                └──────────────────┘
```

### 2.2 Matriz de Cenários

| # | Tipo Aluno | charge_timing | Ação | Interação Stripe |
|---|-----------|---------------|------|-----------------|
| 1 | Assinante | prepaid | Cria fatura avulsa imediata | Invoice Items + Invoice + Finalize (Connected Account) |
| 2 | Assinante | postpaid | Acumula para próximo ciclo | Nenhuma (automated-billing cuida) |
| 3 | Não-assinante | prepaid | Cria fatura avulsa imediata | Invoice Items + Invoice + Finalize (Connected Account) |
| 4 | Não-assinante | postpaid | Apenas registra no banco | Nenhuma (professor cobra manualmente ou automated-billing) |
| 5 | Qualquer | experimental | Apenas registra no banco | Nenhuma (aula experimental = sem cobrança) |
| 6 | Qualquer | sem business_profile | Apenas registra no banco | Nenhuma (sem Stripe configurado) |

**Nota sobre Cenário 2**: Para assinantes com pós-pago, NÃO criamos Invoice Items avulsos no Stripe. As aulas serão contabilizadas pelo `automated-billing` junto com a mensalidade, utilizando a RPC `get_unbilled_participants_v2` que já funciona corretamente.

### 2.3 Fluxo de Recorrência

```text
Professor agenda aula recorrente (ex: semanal, 4 ocorrências)
              │
              ▼
    Template criado no banco (is_template=true)
    + Participantes vinculados
              │
              ▼
    NÃO COBRAR AGORA (independente de charge_timing)
    Template não gera cobrança.
              │
              ▼
    Aulas virtuais são materializadas individualmente
    quando professor confirma/conclui cada uma.
              │
              ▼
    ┌────────────────────────────┐
    │  charge_timing = prepaid?  │
    │  + professor materializa?  │
    └────────┬───────────────────┘
             │
    ┌────────┴────────┐
    │ SIM              │ NÃO
    ▼                  ▼
  Cobrar aula       Não cobrar
  individual        (pós-pago ou
  materializada     aluno materializou)
```

**DECISÕES CRÍTICAS sobre recorrência:**

1. Para recorrências, mesmo com `prepaid`, NÃO cobramos todas de uma vez no momento da criação. O template apenas registra a intenção.
2. A cobrança ocorre quando cada aula é materializada (confirmada ou concluída pelo professor). Isso evita cobrar aulas que serão canceladas.
3. **Materialização pelo aluno** (via `materialize-virtual-class` edge function) NÃO dispara cobrança. A cobrança pré-paga só ocorre quando o **professor** materializa via `Agenda.tsx`. Razão: o professor é quem controla o billing, não o aluno.

---

## 3. Estrutura de Dados

### 3.1 Alteração: business_profiles

```sql
-- Adicionar configuração global de timing de cobrança
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS charge_timing TEXT NOT NULL DEFAULT 'prepaid'
  CHECK (charge_timing IN ('prepaid', 'postpaid'));

COMMENT ON COLUMN public.business_profiles.charge_timing IS
  'Momento da cobrança de aulas avulsas: prepaid (imediata ao agendar) ou postpaid (próximo ciclo de faturamento)';
```

**RLS**: A tabela `business_profiles` já possui RLS ativo. As políticas existentes cobrem SELECT/UPDATE para o `user_id` do professor. A nova coluna `charge_timing` é coberta automaticamente — **nenhuma política adicional necessária**.

### 3.2 Alteração: invoice_classes

```sql
-- Rastrear Invoice Items pendentes no Stripe para gerenciar cancelamentos
ALTER TABLE public.invoice_classes
  ADD COLUMN IF NOT EXISTS stripe_invoice_item_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.invoice_classes.stripe_invoice_item_id IS
  'ID do Invoice Item no Stripe Connect para rastreamento e cancelamento';
```

### 3.3 Índices

```sql
-- Índice para buscas eficientes por stripe_invoice_item_id
CREATE INDEX IF NOT EXISTS idx_invoice_classes_stripe_item
  ON public.invoice_classes(stripe_invoice_item_id)
  WHERE stripe_invoice_item_id IS NOT NULL;
```

---

## 4. Implementação Frontend

### 4.1 BillingSettings - Card "Momento da Cobrança"

**Arquivo**: `src/components/Settings/BillingSettings.tsx`

Adicionar um novo Card **entre** o card de "Configurações de Cobrança" (linhas 214-288) e o card de "Métodos de Pagamento" (linhas 291-355). Este card só aparece se o professor tiver `businessProfileId`.

**Design Visual:**
```text
┌──────────────────────────────────────────────────────────────┐
│ ⚡ Momento da Cobrança                                       │
│ Defina quando seus alunos serão cobrados pelas aulas         │
│                                                              │
│ ┌─────────────────────────────────────┐                      │
│ │ (●) Pré-paga                        │  <- Card selecionável│
│ │ ⚡ Cobra automaticamente ao agendar │                      │
│ │ a aula. O aluno recebe a fatura     │                      │
│ │ imediatamente.                      │                      │
│ └─────────────────────────────────────┘                      │
│                                                              │
│ ┌─────────────────────────────────────┐                      │
│ │ ( ) Pós-paga                        │  <- Card selecionável│
│ │ 🕐 Acumula as aulas e cobra tudo   │                      │
│ │ junto na próxima fatura do ciclo    │                      │
│ │ de cobrança.                        │                      │
│ └─────────────────────────────────────┘                      │
│                                                              │
│ ℹ️ Mensalidades não são afetadas por esta configuração.     │
│ Elas seguem o ciclo de cobrança próprio.                     │
│                                                              │
│ [Salvar]                                                     │
└──────────────────────────────────────────────────────────────┘
```

**Alterações no código:**

```typescript
// Novos estados
const [chargeTiming, setChargeTiming] = useState<'prepaid' | 'postpaid'>('prepaid');
const [savingTiming, setSavingTiming] = useState(false);

// Em loadSettings() (linha ~73), alterar select do business_profiles:
// DE: .select('id, enabled_payment_methods')
// PARA: .select('id, enabled_payment_methods, charge_timing')
//
// E adicionar após setBusinessProfileId:
// if (businessProfile.charge_timing) {
//   setChargeTiming(businessProfile.charge_timing as 'prepaid' | 'postpaid');
// }

// Nova função para salvar
const saveChargeTiming = async () => {
  if (!businessProfileId) return;
  setSavingTiming(true);
  try {
    const { error } = await supabase
      .from('business_profiles')
      .update({ charge_timing: chargeTiming })
      .eq('id', businessProfileId);
    if (error) throw error;
    toast({ title: t('chargeTiming.saveSuccess') });
  } catch (error) {
    toast({ title: t('chargeTiming.saveError'), variant: 'destructive' });
  } finally {
    setSavingTiming(false);
  }
};
```

### 4.2 Agenda.tsx - Integração handleClassSubmit

**Arquivo**: `src/pages/Agenda.tsx`

**4.2.1 Após criação de aulas avulsas** (dentro de `handleClassSubmit`, após inserir aulas e participantes, ~linha 1500):

```typescript
// NÃO processar cobrança para:
// 1. Templates de recorrência (cobrança ocorre na materialização)
// 2. Aulas experimentais (nunca cobradas)
// 3. Aulas sem serviço (sem preço definido)
if (!formData.recurrence && !formData.is_experimental && formData.service_id) {
  try {
    const classIds = insertedClasses.map(c => c.id);
    await supabase.functions.invoke('process-class-billing', {
      body: {
        class_ids: classIds,
        teacher_id: profile.id
      }
    });
  } catch (billingError) {
    console.error('Erro ao processar cobrança (não crítico):', billingError);
    // Não falhar a criação da aula por erro de cobrança
  }
}
```

**4.2.2 Após materialização de aula virtual** (dentro de `materializeVirtualClass`, ~linha 1350, ANTES do `return newClass.id`):

```typescript
// Processar cobrança apenas para aulas não-experimentais com serviço
if (!virtualClass.is_experimental && virtualClass.service_id) {
  try {
    await supabase.functions.invoke('process-class-billing', {
      body: {
        class_ids: [newClass.id],
        teacher_id: profile.id
      }
    });
  } catch (billingError) {
    console.error('Erro ao processar cobrança de aula materializada:', billingError);
    // Não falhar a materialização por erro de cobrança
  }
}
```

**NOTA IMPORTANTE**: A edge function `materialize-virtual-class` (server-side, chamada pelo aluno) **NÃO** é modificada. O billing pré-pago só é disparado quando o professor materializa via `Agenda.tsx`. Se o aluno materializar, a aula será capturada pelo `automated-billing` no próximo ciclo (pós-pago efetivo).

### 4.3 CancellationModal.tsx - Cancelamento Condicional

**Arquivo**: `src/components/CancellationModal.tsx`

Adicionar lógica **antes** de chamar `process-cancellation` para verificar se a aula tem fatura pré-paga vinculada:

```typescript
// Nova função auxiliar para verificar billing pré-pago
const checkPrepaidBilling = async (classId: string) => {
  // 1. Buscar invoice_classes vinculados a esta aula
  const { data: invoiceClasses } = await supabase
    .from('invoice_classes')
    .select(`
      id,
      invoice_id,
      stripe_invoice_item_id,
      invoices!inner (
        id,
        status,
        stripe_invoice_id,
        invoice_type
      )
    `)
    .eq('class_id', classId)
    .eq('invoices.invoice_type', 'prepaid_class');

  if (!invoiceClasses || invoiceClasses.length === 0) {
    return { hasPrepaidBilling: false };
  }

  const invoice = invoiceClasses[0].invoices;
  return {
    hasPrepaidBilling: true,
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    stripeInvoiceId: invoice.stripe_invoice_id,
    stripeInvoiceItemId: invoiceClasses[0].stripe_invoice_item_id,
    canVoid: ['pendente', 'open'].includes(invoice.status), // Só pode anular faturas não-pagas
  };
};
```

Integrar na lógica do `handleCancel`: se `hasPrepaidBilling && canVoid`, passar `void_prepaid_invoice: true` + `stripe_invoice_id` no body do `process-cancellation`.

### 4.4 InvoiceTypeBadge.tsx - Novo tipo `prepaid_class`

**Arquivo**: `src/components/InvoiceTypeBadge.tsx`

Adicionar o novo tipo ao mapeamento `typeConfig`:

```typescript
prepaid_class: {
  label: t('invoiceTypes.prepaidClass'),
  icon: Zap,
  className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
},
cancellation: {
  label: t('invoiceTypes.cancellation'),
  icon: FileText, // ou AlertTriangle
  className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
},
```

**NOTA**: O tipo `cancellation` já existe no sistema mas não está mapeado no `InvoiceTypeBadge`. Aproveitar para adicionar ambos.

### 4.5 ClassForm.tsx - Nenhuma Alteração

O ClassForm já exibe os serviços e seus preços. Nenhuma alteração é necessária no modal de agendamento. A configuração pré/pós-paga é global e não aparece no ClassForm. O preço do serviço já é mostrado como read-only (vem do cadastro de serviços).

---

## 5. Implementação Backend

### 5.1 Edge Function: process-class-billing

**Arquivo**: `supabase/functions/process-class-billing/index.ts`

**NOVA Edge Function** - Router central de cobrança chamado após criação de aulas.

```typescript
// Parâmetros de entrada
interface ProcessClassBillingRequest {
  class_ids: string[];   // IDs das aulas criadas (já no banco)
  teacher_id: string;    // ID do professor
}

// Resposta
interface ProcessClassBillingResponse {
  success: boolean;
  processed: number;      // Número de aulas processadas
  skipped: number;        // Número de aulas ignoradas (sem serviço, etc.)
  charge_timing: string;  // 'prepaid', 'postpaid', ou 'no_business_profile'
  invoices_created?: string[]; // IDs das faturas criadas (se prepaid)
}
```

**Lógica principal detalhada:**

```
1. Autenticar professor (auth.uid() === teacher_id)

2. Buscar business_profile do professor:
   SELECT id, charge_timing, stripe_connect_id, enabled_payment_methods
   FROM business_profiles
   WHERE user_id = teacher_id
   LIMIT 1
   
   → Se NÃO tem business_profile: retornar { charge_timing: 'no_business_profile' }
   → Se charge_timing === 'postpaid': retornar { charge_timing: 'postpaid' }

3. Se charge_timing === 'prepaid':
   
   3a. Para cada class_id, buscar dados completos:
       - class_services (preço, nome)
       - class_participants (student_id, dependent_id)
       - Excluir aulas experimentais (is_experimental = true)
       - Excluir aulas que já têm invoice_classes (evitar duplicidade)
   
   3b. Agrupar participantes por student_id (responsável):
       - Se participante tem dependent_id, buscar responsible_id
       - Agrupar todas as aulas do mesmo responsável em uma única fatura
   
   3c. Para cada responsável/aluno único:
       i.   Buscar business_profile_id via teacher_student_relationships
       ii.  Buscar/criar customer no Connected Account:
            - stripe.customers.list({ email }, { stripeAccount })
            - Se não existe: stripe.customers.create({ email, name }, { stripeAccount })
       iii. Para cada aula desse aluno:
            - stripe.invoiceItems.create({
                customer: connectedCustomerId,
                amount: Math.round(price * 100),
                currency: 'brl',
                description: `Aula de ${serviceName} - ${classDate}`,
                metadata: { lesson_id: classId, participant_id: participantId }
              }, { stripeAccount: connectAccountId })
       iv.  stripe.invoices.create({
              customer: connectedCustomerId,
              auto_advance: true,
              collection_method: 'send_invoice',
              days_until_due: paymentDueDays,
              metadata: { teacher_id, invoice_source: 'prepaid_billing' }
            }, { stripeAccount: connectAccountId })
       v.   stripe.invoices.finalizeInvoice(stripeInvoice.id, { stripeAccount })
       vi.  Criar registro na tabela `invoices` com:
            - invoice_type: 'prepaid_class'
            - stripe_invoice_id: stripeInvoice.id
            - status: 'pendente'
            - student_id: responsável
            - teacher_id
            - business_profile_id: da relationship
            - amount: soma dos preços
            - gateway_provider: 'stripe'
       vii. Criar registros em `invoice_classes` com:
            - stripe_invoice_item_id: cada item do Stripe
            - class_id, participant_id, amount, item_type: 'prepaid_class'

4. Retornar resultado com IDs das faturas criadas
```

**Pontos críticos:**

1. **Stripe Connect**: TODAS as operações (customers, invoiceItems, invoices) devem usar `{ stripeAccount: connectAccountId }`. Diferente do `create-payment-intent-connect` que cria clientes na plataforma para cartão — aqui tudo é no Connected Account.

2. **Customer no Connected Account**: O `create-payment-intent-connect` cria clientes no Connected Account para PIX (linhas 422-434). Reutilizar essa mesma lógica. Buscar por email no Connected Account, criar se não existir.

3. **Hierarquia de pagamento**: NÃO se aplica aqui. A Invoice do Stripe será enviada com `collection_method: 'send_invoice'` e `days_until_due`. O aluno receberá o link de pagamento e escolherá o método disponível. O Stripe cuida da apresentação dos métodos habilitados no Connected Account.

4. **Atomicidade**: Se o Stripe falhar em qualquer etapa, fazer cleanup:
   - Deletar Invoice Items já criados
   - NÃO salvar no banco
   - A aula já foi criada (ok), mas sem cobrança vinculada
   - Professor pode cobrar manualmente depois

5. **Lote para aulas avulsas**: Se `class_ids` tem mais de uma aula para o MESMO aluno, criar N Invoice Items e UMA única Invoice.

6. **Múltiplos alunos**: Se `class_ids` inclui aulas em grupo com múltiplos participantes, criar UMA Invoice por aluno (cada um com seus itens).

### 5.2 Ajustes no automated-billing

**Arquivo**: `supabase/functions/automated-billing/index.ts`

**Verificação necessária**: A RPC `get_unbilled_participants_v2` já filtra participantes que NÃO foram faturados (verificando `invoice_classes`). Portanto, aulas pré-pagas que já têm `invoice_classes` vinculado serão automaticamente excluídas.

**Ação**: Verificar a definição da RPC no banco. Se a RPC já faz:
```sql
AND cp.id NOT IN (
  SELECT ic.participant_id FROM invoice_classes ic
  WHERE ic.participant_id IS NOT NULL
)
```
Então **nenhuma alteração é necessária** no `automated-billing`.

**Logs de debug extras** (opcionais, para monitoramento pós-deploy):

```typescript
// Após buscar completedParticipations (linha ~240):
logStep(`Unbilled participations found for ${studentInfo.student_name}`, {
  count: completedParticipations?.length || 0,
  note: 'Prepaid classes are auto-excluded by get_unbilled_participants_v2'
});
```

### 5.3 Ajustes no webhook-stripe-connect

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`

**Handler `invoice.paid` (linha 300-335)**: Adicionar iteração sobre linhas da fatura para atualizar status das aulas. Inserir APÓS a atualização de status da invoice no banco (linha 333):

```typescript
case 'invoice.paid': {
  const paidInvoice = eventObject as Stripe.Invoice;
  logStep("Invoice paid", { invoiceId: paidInvoice.id });

  // ... lógica existente de verificar manual payment e atualizar status ...
  // (linhas 306-333 mantidas integralmente)

  // NOVO: Iterar sobre linhas da fatura e atualizar status das aulas
  if (paidInvoice.lines?.data) {
    for (const line of paidInvoice.lines.data) {
      const lessonId = line.metadata?.lesson_id;
      if (lessonId) {
        // Atualizar participantes da aula para 'confirmada'
        const { error: participantUpdateError } = await supabaseClient
          .from('class_participants')
          .update({ 
            status: 'confirmada', 
            confirmed_at: new Date().toISOString() 
          })
          .eq('class_id', lessonId)
          .neq('status', 'cancelada');
        
        if (participantUpdateError) {
          logStep(`Error updating participants for lesson ${lessonId}`, participantUpdateError);
        } else {
          logStep(`Lesson ${lessonId} participants confirmed via invoice payment`);
        }
      }
    }
  }
  break;
}
```

**Handler `invoice.voided` (linha 420-438)**: Já existe e atualiza o status da invoice no banco para `cancelada`. **Nenhuma alteração necessária** — quando a fatura é anulada (void), o status é atualizado automaticamente.

**Handler `invoice.payment_succeeded` (linha 337-369)**: Mesma lógica de iteração sobre linhas. Adicionar o MESMO código de iteração sobre `invoice.lines.data` para consistência (o Stripe pode enviar `invoice.paid` OU `invoice.payment_succeeded` dependendo do cenário).

### 5.4 Ajustes no process-cancellation

**Arquivo**: `supabase/functions/process-cancellation/index.ts`

Adicionar lógica de void/delete de fatura pré-paga. Inserir ANTES da seção de criação de fatura de cancelamento (linha ~374):

```typescript
// NOVO: Verificar se a aula tem fatura pré-paga vinculada
const { data: prepaidInvoiceClasses } = await supabaseClient
  .from('invoice_classes')
  .select(`
    id,
    stripe_invoice_item_id,
    invoice_id,
    invoices!inner (
      id,
      status,
      stripe_invoice_id,
      invoice_type
    )
  `)
  .eq('class_id', class_id)
  .eq('invoices.invoice_type', 'prepaid_class');

if (prepaidInvoiceClasses && prepaidInvoiceClasses.length > 0) {
  const prepaidInvoice = prepaidInvoiceClasses[0].invoices;
  
  // Só pode anular faturas não-pagas
  if (['pendente', 'open'].includes(prepaidInvoice.status) && prepaidInvoice.stripe_invoice_id) {
    console.log('📋 Voiding prepaid invoice:', prepaidInvoice.stripe_invoice_id);
    
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
      
      // Buscar Connected Account ID
      const { data: businessProfile } = await supabaseClient
        .from('business_profiles')
        .select('stripe_connect_id')
        .eq('user_id', classData.teacher_id)
        .maybeSingle();
      
      if (businessProfile?.stripe_connect_id) {
        await stripe.invoices.voidInvoice(
          prepaidInvoice.stripe_invoice_id,
          { stripeAccount: businessProfile.stripe_connect_id }
        );
        
        // Atualizar status no banco (webhook voided também fará isso, mas garantir)
        await supabaseClient
          .from('invoices')
          .update({ status: 'cancelada', updated_at: new Date().toISOString() })
          .eq('id', prepaidInvoice.id);
        
        console.log('✅ Prepaid invoice voided successfully');
      }
    } catch (voidError) {
      console.error('⚠️ Error voiding prepaid invoice (non-critical):', voidError);
      // Não falhar o cancelamento por erro no void
    }
    
    // NÃO gerar cobrança de cancelamento se estamos anulando uma pré-paga
    // A cobrança original está sendo revertida
    shouldCharge = false;
  } else if (prepaidInvoice.status === 'paid' || prepaidInvoice.status === 'paga') {
    console.log('⚠️ Prepaid invoice already paid - cannot void. Cancellation charge may apply separately.');
    // Se já paga, o fluxo normal de cancelamento continua
    // O professor deve decidir sobre reembolso manualmente
  }
}
```

**NOTA**: A lógica de void é separada e acontece ANTES da decisão de `shouldCharge`. Se a fatura pré-paga é anulada, NÃO geramos cobrança de cancelamento adicional (seria dupla penalização).

---

## 6. Internacionalização (i18n)

### 6.1 Português (pt)

**Arquivo**: `src/i18n/locales/pt/billing.json` - Adicionar ao objeto existente:

```json
{
  "chargeTiming": {
    "title": "Momento da Cobrança",
    "description": "Defina quando seus alunos serão cobrados pelas aulas avulsas",
    "prepaid": "Pré-paga",
    "prepaidDescription": "Cobra automaticamente ao agendar a aula. O aluno recebe a fatura imediatamente.",
    "postpaid": "Pós-paga",
    "postpaidDescription": "Acumula as aulas e cobra tudo junto na próxima fatura do ciclo de cobrança.",
    "subscriptionNote": "Mensalidades não são afetadas por esta configuração. Elas seguem o ciclo de cobrança próprio.",
    "saveSuccess": "Configuração de cobrança atualizada com sucesso.",
    "saveError": "Erro ao atualizar configuração de cobrança."
  }
}
```

### 6.2 English (en)

**Arquivo**: `src/i18n/locales/en/billing.json` - Adicionar ao objeto existente:

```json
{
  "chargeTiming": {
    "title": "Charge Timing",
    "description": "Define when your students will be charged for individual classes",
    "prepaid": "Prepaid",
    "prepaidDescription": "Charges automatically when scheduling the class. The student receives the invoice immediately.",
    "postpaid": "Postpaid",
    "postpaidDescription": "Accumulates classes and charges everything together on the next billing cycle invoice.",
    "subscriptionNote": "Monthly subscriptions are not affected by this setting. They follow their own billing cycle.",
    "saveSuccess": "Charge timing updated successfully.",
    "saveError": "Error updating charge timing."
  }
}
```

### 6.3 Tipos de fatura (financial.json)

**Arquivo**: `src/i18n/locales/pt/financial.json` - Adicionar em `invoiceTypes`:

```json
{
  "invoiceTypes": {
    "prepaidClass": "Pré-paga",
    "cancellation": "Cancelamento"
  }
}
```

**Arquivo**: `src/i18n/locales/en/financial.json` - Adicionar em `invoiceTypes`:

```json
{
  "invoiceTypes": {
    "prepaidClass": "Prepaid",
    "cancellation": "Cancellation"
  }
}
```

---

## 7. Cancelamento e Edição

### 7.1 Regras por Estado da Aula

| Estado da Aula | Tem Fatura Stripe? | Fatura Paga? | Edição de Serviço | Cancelamento |
|----------------|-------------------|-------------|-------------------|--------------|
| Pré-paga com fatura pendente | Sim (`stripe_invoice_id`) | Não | **Bloqueada** | Void invoice no Stripe + cancelar no banco |
| Pré-paga com fatura paga | Sim (`stripe_invoice_id`) | Sim | **Bloqueada** | Cancelar no banco + professor decide reembolso manualmente |
| Pós-paga (sem Stripe) | Não | N/A | Permitida | Apenas cancelar no banco (fluxo atual) |
| Experimental | Não | N/A | N/A | Apenas cancelar no banco |

### 7.2 Fluxo de Cancelamento

```text
Professor cancela aula
        │
        ▼
┌─────────────────────────┐
│ Aula tem invoice_classes │
│ com invoice_type =       │
│ 'prepaid_class'?         │
└─────────┬───────────────┘
          │
    ┌─────┴──────┐
    │ SIM        │ NÃO
    ▼            ▼
┌─────────────────┐  ┌────────────────────┐
│ Fatura está      │  │ Fluxo atual        │
│ pendente/open?   │  │ (process-          │
└────┬─────────────┘  │ cancellation       │
     │                │ sem alteração)     │
  ┌──┴──┐             └────────────────────┘
  │SIM  │ NÃO (paga)
  ▼     ▼
┌────────────┐  ┌──────────────────┐
│ Void       │  │ Log warning      │
│ invoice    │  │ "Fatura já paga" │
│ no Stripe  │  │ Professor decide │
│            │  │ reembolso manual  │
│ NÃO cobra  │  │                  │
│ multa de   │  │ Fluxo normal de  │
│ cancelam.  │  │ cancelamento     │
└────────────┘  └──────────────────┘
```

### 7.3 Bloqueio de Edição no Frontend

**Arquivo**: `src/pages/Agenda.tsx` (ou componente de edição de aula)

Quando o professor tenta editar uma aula que tem `invoice_classes` com `invoice_type = 'prepaid_class'`:
- Bloquear alteração de serviço (preço mudaria)
- Bloquear alteração de participantes (mudaria a fatura)
- Permitir alteração de data/hora (não afeta cobrança)
- Exibir toast informativo: "Esta aula já possui fatura emitida. Alterações de serviço e participantes estão bloqueadas."

---

## 8. Webhooks e Reconciliação

### 8.1 invoice.paid / invoice.payment_succeeded

Quando o Stripe notifica que uma invoice foi paga:

1. Buscar a invoice no banco pelo `stripe_invoice_id`
2. Atualizar status para `pago` / `paid`
3. **NOVO**: Iterar sobre `invoice.lines.data`
4. Para cada linha com `metadata.lesson_id`:
   - Atualizar `class_participants.status` para `confirmada`
   - Atualizar `class_participants.confirmed_at`
5. Campos temporários (boleto_url, pix_qr_code) são gerenciados pelo Stripe Invoice; não precisam ser limpos manualmente aqui.

### 8.2 invoice.voided

Handler já existe (linha 420-438). Quando o Stripe notifica void:
- Atualizar status da invoice no banco para `cancelada`
- **Nenhuma ação adicional necessária** sobre aulas — o void é resultado do cancelamento que já tratou a aula.

### 8.3 payment_intent.succeeded (existente)

O handler existente de `payment_intent.succeeded` continua funcionando para faturas criadas via `create-payment-intent-connect`. As novas faturas pré-pagas usam Stripe Invoices (não Payment Intents diretos), então são capturadas pelos handlers `invoice.paid` / `invoice.payment_succeeded`.

---

## 9. Compatibilidade com Sistema Existente

| Componente | Impacto | Ação |
|-----------|---------|------|
| `automated-billing` (tradicional) | Baixo | Aulas pré-pagas já terão `invoice_classes`, serão filtradas pela RPC |
| `automated-billing` (mensalidades) | Nenhum | Mensalidades não são afetadas por `charge_timing` |
| `create-invoice` (manual) | Nenhum | Continua funcionando independentemente |
| `create-payment-intent-connect` | Nenhum | Continua para pagamentos de faturas existentes |
| `Financeiro.tsx` (lista faturas) | **Baixo** | Novas faturas `prepaid_class` aparecem na lista; `InvoiceTypeBadge` precisa do novo tipo |
| `Faturas.tsx` (aluno) | **Baixo** | Faturas pré-pagas aparecem normalmente; `InvoiceTypeBadge` precisa do novo tipo |
| `InvoiceTypeBadge.tsx` | **Médio** | Adicionar tipo `prepaid_class` e `cancellation` ao mapeamento |
| `PaymentOptionsCard` | Nenhum | Faturas pré-pagas usam Stripe Invoice (link próprio) |
| `CancellationModal.tsx` | **Médio** | Adicionar verificação de fatura pré-paga antes de cancelar |
| `StudentImportDialog` | Nenhum | Import de alunos não interage com billing |
| Aulas antigas (sem `charge_timing`) | Nenhum | Continuam no fluxo pós-pago (automated-billing) |
| Professores sem business_profile | Nenhum | Sem Stripe, cobrança não se aplica |
| `materialize-virtual-class` (edge) | Nenhum | Materialização server-side não dispara billing |

---

## 10. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Duplicidade de cobrança (pré-pago + automated-billing) | Média | Alto | RPC `get_unbilled_participants_v2` filtra participantes já faturados via `invoice_classes` |
| Falha na criação do Invoice no Stripe | Baixa | Médio | Não impede criação da aula; professor pode cobrar manualmente depois |
| Aluno sem customer_id no Stripe Connected | Média | Médio | Criar customer automaticamente na primeira cobrança pré-paga |
| Professor muda de prepaid para postpaid com faturas pendentes | Baixa | Baixo | Faturas existentes não são afetadas; apenas novas aulas seguem nova config |
| Cancelamento de aula com fatura já paga | Baixa | Alto | Não permitir void; log warning; reembolso é manual |
| Recorrência com prepaid cobrando todas de uma vez | Média | Alto | Cobrança ocorre na materialização, não na criação do template |
| Customer Stripe duplicado para mesmo aluno | Baixa | Médio | Buscar customer existente por email no Connected Account antes de criar |
| Materialização pelo aluno não dispara billing | Baixa | Baixo | Design intencional: billing é responsabilidade do professor |
| Professor com múltiplos business_profiles | Baixa | Médio | Usar `teacher_student_relationships.business_profile_id` como fonte da verdade (padrão existente) |
| Invoice do Stripe sem metadata.lesson_id | Baixa | Médio | Validar que `lesson_id` está em metadata de cada InvoiceItem; logar se ausente |

---

## 11. Sequência de Implementação

```text
FASE 1: Migração de Banco de Dados
│  - charge_timing em business_profiles
│  - stripe_invoice_item_id em invoice_classes
│  - Regenerar tipos TypeScript
│
▼
FASE 2: Frontend - BillingSettings + i18n
│  - Card "Momento da Cobrança"
│  - Estado, load, save
│  - Traduções i18n (PT/EN) para billing.json e financial.json
│  - Atualizar InvoiceTypeBadge com novos tipos
│
▼
FASE 3: Backend - Edge Function process-class-billing
│  - Nova edge function
│  - Lógica de roteamento prepaid/postpaid
│  - Integração Stripe Connect (Invoice Items + Invoice)
│  - Criação de customer no Connected Account
│  - Registros em invoices + invoice_classes
│
▼
FASE 4: Integração - Agenda.tsx
│  - handleClassSubmit chama process-class-billing
│  - materializeVirtualClass chama process-class-billing
│
▼
FASE 5: Cancelamento - CancellationModal + process-cancellation
│  - Verificação de fatura pré-paga antes de cancelar
│  - Lógica de void/delete condicional no Stripe
│  - Proteção contra void de faturas já pagas
│
▼
FASE 6: Webhook - webhook-stripe-connect
│  - Processar metadata.lesson_id em invoice.paid
│  - Processar metadata.lesson_id em invoice.payment_succeeded
│  - Atualizar status de participantes automaticamente
│
▼
FASE 7: Ajustes - automated-billing
│  - Verificar que RPC filtra aulas já cobradas
│  - Adicionar logs de debug (opcional)
│
▼
FASE 8: Testes e Validação
│  - Testar cenários 1-6 da matriz
│  - Testar cancelamento em cada estado (pendente/paga/sem fatura)
│  - Testar recorrência com materialização
│  - Testar troca de prepaid <-> postpaid
│  - Verificar que InvoiceTypeBadge exibe novos tipos
│  - Verificar que aluno materializar não gera cobrança
```

---

## 12. Arquivos a Criar/Modificar

| Arquivo | Tipo | Fase | Descrição |
|---------|------|------|-----------|
| Migração SQL | **Criar** | 1 | `charge_timing` + `stripe_invoice_item_id` |
| `src/integrations/supabase/types.ts` | **Regenerar** | 1 | Atualizar tipos após migração |
| `src/components/Settings/BillingSettings.tsx` | **Modificar** | 2 | Novo card "Momento da Cobrança" |
| `src/i18n/locales/pt/billing.json` | **Modificar** | 2 | Traduções chargeTiming |
| `src/i18n/locales/en/billing.json` | **Modificar** | 2 | Traduções chargeTiming |
| `src/i18n/locales/pt/financial.json` | **Modificar** | 2 | Tipo prepaidClass + cancellation |
| `src/i18n/locales/en/financial.json` | **Modificar** | 2 | Tipo prepaidClass + cancellation |
| `src/components/InvoiceTypeBadge.tsx` | **Modificar** | 2 | Adicionar tipos prepaid_class e cancellation |
| `supabase/functions/process-class-billing/index.ts` | **Criar** | 3 | Router de cobrança central |
| `src/pages/Agenda.tsx` | **Modificar** | 4 | Chamar process-class-billing em handleClassSubmit e materializeVirtualClass |
| `src/components/CancellationModal.tsx` | **Modificar** | 5 | Verificar fatura pré-paga antes de cancelar |
| `supabase/functions/process-cancellation/index.ts` | **Modificar** | 5 | Adicionar void de fatura pré-paga no Stripe |
| `supabase/functions/webhook-stripe-connect/index.ts` | **Modificar** | 6 | Processar lesson_id em invoice.paid e invoice.payment_succeeded |
| `supabase/functions/automated-billing/index.ts` | **Verificar** | 7 | Confirmar que RPC filtra aulas pré-pagas; logs opcionais |

**NOTA**: Não é necessário modificar `supabase/config.toml` — o Lovable Cloud registra edge functions automaticamente.

---

## 13. Checklist de Deploy

### Pré-Deploy

- [ ] Executar migração SQL em ambiente de teste
- [ ] Regenerar tipos TypeScript
- [ ] Verificar que `get_unbilled_participants_v2` filtra aulas pré-pagas (via `invoice_classes`)
- [ ] Testar `process-class-billing` com conta Stripe de teste
- [ ] Testar cancelamento nos 3 cenários (fatura pendente, fatura paga, sem Stripe)
- [ ] Verificar webhook recebe `invoice.paid` corretamente
- [ ] Verificar `InvoiceTypeBadge` exibe `prepaid_class` e `cancellation`
- [ ] Verificar que materialização server-side (aluno) NÃO gera cobrança

### Deploy

- [ ] Executar migração SQL em produção
- [ ] Deploy de edge functions (process-class-billing, process-cancellation, webhook-stripe-connect)
- [ ] Publicar frontend
- [ ] Testar fluxo completo em produção com valor mínimo

### Pós-Deploy

- [ ] Monitorar logs do `automated-billing` no próximo ciclo
- [ ] Verificar que aulas pré-pagas não são duplicadas no faturamento automático
- [ ] Testar fluxo completo com professor real em produção
- [ ] Verificar que professores sem business_profile não são afetados
- [ ] Verificar que a troca prepaid→postpaid não afeta faturas existentes

---

## Apêndice A: Gaps Corrigidos na Revisão v1.1

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 1 | `invoice_type` indefinido para faturas pré-pagas | Definido como `prepaid_class` |
| 2 | `InvoiceTypeBadge.tsx` não mapeia novo tipo | Adicionado `prepaid_class` e `cancellation` ao componente |
| 3 | i18n faltante para tipos de fatura em `financial.json` | Adicionadas traduções PT/EN |
| 4 | Materialização server-side (aluno) poderia gerar billing | Decisão: NÃO gera. Billing só pelo professor via Agenda.tsx |
| 5 | Customer no Connected vs Platform Account | Clarificado: TUDO no Connected Account para Invoices |
| 6 | Status da aula pré-paga indefinido | Definido como `confirmada` (consistente com fluxo atual) |
| 7 | Professor com múltiplos business_profiles | Usar `relationship.business_profile_id` como fonte da verdade |
| 8 | `CancellationModal.tsx` com pseudocódigo vago | Detalhada função `checkPrepaidBilling` e integração |
| 9 | `process-cancellation` void vs charge conflict | Separada lógica: void pré-paga ANTES de decidir shouldCharge |
| 10 | Fatura já paga + cancelamento sem tratamento | Adicionado log warning; reembolso manual pelo professor |
| 11 | `config.toml` listado como arquivo a modificar | Removido; Lovable Cloud auto-registra |
| 12 | RLS para nova coluna `charge_timing` não verificado | Verificado: políticas existentes cobrem automaticamente |
| 13 | Hierarquia de pagamento (Boleto→PIX) na pré-paga | Removida: Stripe Invoice gerencia métodos nativamente |
| 14 | `create-invoice` reuse vs duplicação | Decisão: lógica própria em `process-class-billing` (Invoices ≠ Payment Intents) |
