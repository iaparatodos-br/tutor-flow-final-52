
# Plano de Implementacao: Cobranca Hibrida Global (Pre-paga / Pos-paga)

> **Versao**: 1.0
> **Data**: 2026-02-07
> **Status**: Planejamento

---

## Sumario

1. [Visao Geral](#1-visao-geral)
   - 1.1 [Contexto do Problema](#11-contexto-do-problema)
   - 1.2 [Requisitos Funcionais](#12-requisitos-funcionais)
   - 1.3 [Requisitos Nao-Funcionais](#13-requisitos-nao-funcionais)
   - 1.4 [Decisoes de Design](#14-decisoes-de-design)
2. [Arquitetura da Solucao](#2-arquitetura-da-solucao)
   - 2.1 [Diagrama de Fluxo de Cobranca](#21-diagrama-de-fluxo-de-cobranca)
   - 2.2 [Matriz de Cenarios](#22-matriz-de-cenarios)
   - 2.3 [Fluxo de Recorrencia](#23-fluxo-de-recorrencia)
3. [Estrutura de Dados](#3-estrutura-de-dados)
   - 3.1 [Alteracao: business_profiles](#31-alteracao-business_profiles)
   - 3.2 [Alteracao: invoice_classes](#32-alteracao-invoice_classes)
   - 3.3 [Indices](#33-indices)
4. [Implementacao Frontend](#4-implementacao-frontend)
   - 4.1 [BillingSettings - Card "Momento da Cobranca"](#41-billingsettings---card-momento-da-cobranca)
   - 4.2 [Agenda.tsx - Integracao handleClassSubmit](#42-agendatsx---integracao-handleclasssubmit)
   - 4.3 [CancellationModal.tsx - Cancelamento Condicional](#43-cancellationmodaltsx---cancelamento-condicional)
   - 4.4 [ClassForm.tsx - Exibicao de Preco ReadOnly](#44-classformtsx---exibicao-de-preco-readonly)
5. [Implementacao Backend](#5-implementacao-backend)
   - 5.1 [Edge Function: process-class-billing](#51-edge-function-process-class-billing)
   - 5.2 [Ajustes no automated-billing](#52-ajustes-no-automated-billing)
   - 5.3 [Ajustes no webhook-stripe-connect](#53-ajustes-no-webhook-stripe-connect)
6. [Internacionalizacao (i18n)](#6-internacionalizacao-i18n)
   - 6.1 [Portugues (pt)](#61-portugues-pt)
   - 6.2 [English (en)](#62-english-en)
7. [Cancelamento e Edicao](#7-cancelamento-e-edicao)
   - 7.1 [Regras por Estado da Aula](#71-regras-por-estado-da-aula)
   - 7.2 [Fluxo de Cancelamento](#72-fluxo-de-cancelamento)
8. [Webhooks e Reconciliacao](#8-webhooks-e-reconciliacao)
   - 8.1 [invoice.payment_succeeded](#81-invoicepaymentsucceeded)
   - 8.2 [payment_intent.succeeded (existente)](#82-payment_intentsucceeded-existente)
9. [Compatibilidade com Sistema Existente](#9-compatibilidade-com-sistema-existente)
10. [Riscos e Mitigacoes](#10-riscos-e-mitigacoes)
11. [Sequencia de Implementacao](#11-sequencia-de-implementacao)
12. [Arquivos a Criar/Modificar](#12-arquivos-a-criarmodificar)
13. [Checklist de Deploy](#13-checklist-de-deploy)

---

## 1. Visao Geral

### 1.1 Contexto do Problema

O sistema Tutor Flow atualmente possui dois modelos de cobranca:

- **Mensalidades (Assinaturas)**: Cobradas automaticamente via `automated-billing` no `billing_day` do aluno. Sao **estritamente pre-pagas** e seguem o padrao Stripe Subscriptions interno.
- **Servicos (Aulas Avulsas/Extras)**: Atualmente acumuladas e cobradas apenas no ciclo de faturamento (`automated-billing`), sem opcao de cobranca imediata.

**Problema**: O professor nao tem controle sobre QUANDO cobrar aulas avulsas. Alguns professores querem cobrar imediatamente ao agendar (pre-pago), enquanto outros preferem acumular para o proximo ciclo (pos-pago). Atualmente, todas as aulas sao pos-pagas por padrao.

### 1.2 Requisitos Funcionais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF01 | Professor pode configurar globalmente se aulas avulsas sao pre-pagas ou pos-pagas | Alta |
| RF02 | A configuracao fica em Configuracoes > Cobrancas (BillingSettings) | Alta |
| RF03 | O padrao e **pre-paga** (cobrar no agendamento) | Alta |
| RF04 | Mensalidades NAO sao afetadas (sempre seguem ciclo proprio) | Alta |
| RF05 | O valor das aulas vem do cadastro de Servicos (sem edicao manual) | Alta |
| RF06 | Pre-paga: Gera fatura imediata ao agendar a aula | Alta |
| RF07 | Pos-paga: Apenas registra a aula, sera cobrada no proximo ciclo | Alta |
| RF08 | Recorrencias geram cobranca em lote (uma unica fatura para N aulas) | Alta |
| RF09 | Aulas com fatura emitida (pre-paga) bloqueiam edicao de servico/preco | Media |
| RF10 | Cancelamento de aula com fatura emitida anula a fatura no Stripe | Alta |
| RF11 | Cancelamento de aula sem fatura apenas marca como cancelada | Alta |
| RF12 | Webhook `invoice.payment_succeeded` atualiza status da aula | Alta |

### 1.3 Requisitos Nao-Funcionais

| ID | Requisito | Metrica |
|----|-----------|---------|
| RNF01 | Configuracao deve ser salva instantaneamente | < 500ms |
| RNF02 | Geracao de fatura pre-paga deve ser atomica | Rollback se Stripe falhar |
| RNF03 | Retrocompatibilidade total com cobranca existente | 100% mantida |
| RNF04 | Internacionalizacao completa | PT e EN |

### 1.4 Decisoes de Design

| Decisao | Opcoes Consideradas | Escolha | Justificativa |
|---------|---------------------|---------|---------------|
| Escopo da configuracao | Por aula / Global | **Global** | Simplifica UX, evita decisao a cada agendamento |
| Local da configuracao | ClassForm / Configuracoes | **Configuracoes** | Decisao de negocios, nao operacional |
| Padrao | Pre-paga / Pos-paga | **Pre-paga** | Mais seguro para o professor (cobra antes) |
| Armazenamento | profiles / business_profiles | **business_profiles** | Vinculado ao negocio/Stripe do professor |
| Mensalidades afetadas? | Sim / Nao | **Nao** | Mensalidades tem ciclo proprio, nao faz sentido |
| Edicao de preco na aula | Permitir / Nao permitir | **Nao permitir** | Preco vem do cadastro de Servicos |
| Recorrencia | Cobrar cada aula / Cobrar lote | **Cobrar lote** | Uma unica fatura para N aulas do lote |

---

## 2. Arquitetura da Solucao

### 2.1 Diagrama de Fluxo de Cobranca

```text
                      ┌──────────────────────────────────────────────────┐
                      │         PROFESSOR AGENDA AULA(S)                  │
                      └───────────────────────┬──────────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │  Aula e experimental?    │
                                 └─────────┬───────────────┘
                                           │
                               ┌───────────┴───────────┐
                               │ SIM                    │ NAO
                               ▼                       ▼
                     ┌──────────────────┐    ┌──────────────────────────┐
                     │ Registrar apenas  │    │ Buscar charge_timing do  │
                     │ no banco          │    │ business_profiles        │
                     │ (sem cobranca)    │    └──────────┬───────────────┘
                     └──────────────────┘               │
                                              ┌─────────┴──────────┐
                                              │                    │
                                     charge_timing           charge_timing
                                     = 'prepaid'             = 'postpaid'
                                              │                    │
                                              ▼                    ▼
                                ┌──────────────────┐   ┌──────────────────────┐
                                │  FLUXO PRE-PAGO   │   │  FLUXO POS-PAGO      │
                                ├──────────────────┤   ├──────────────────────┤
                                │ 1. Criar aulas    │   │ 1. Criar aulas       │
                                │    no banco       │   │    no banco          │
                                │ 2. Criar Invoice  │   │ 2. FIM               │
                                │    Items Stripe   │   │                      │
                                │ 3. Criar Invoice  │   │ Aulas serao          │
                                │    imediata       │   │ capturadas pelo      │
                                │ 4. Finalizar      │   │ automated-billing    │
                                │    Invoice        │   │ no proximo ciclo     │
                                │ 5. Salvar IDs     │   └──────────────────────┘
                                │    no banco       │
                                └──────────────────┘
```

### 2.2 Matriz de Cenarios

| # | Tipo Aluno | charge_timing | Acao | Interacao Stripe |
|---|-----------|---------------|------|-----------------|
| 1 | Assinante | prepaid | Cria fatura avulsa imediata | Invoice Items + Invoice + Finalize |
| 2 | Assinante | postpaid | Acumula para proximo ciclo | Nenhuma (automated-billing cuida) |
| 3 | Nao-assinante | prepaid | Cria fatura avulsa imediata | Invoice Items + Invoice + Finalize |
| 4 | Nao-assinante | postpaid | Apenas registra no banco | Nenhuma (professor cobra manualmente ou automated-billing) |
| 5 | Qualquer | experimental | Apenas registra no banco | Nenhuma (aula experimental = sem cobranca) |

**Nota sobre Cenario 2**: Para assinantes com pos-pago, NAO criamos Invoice Items avulsos no Stripe. As aulas serao contabilizadas pelo `automated-billing` junto com a mensalidade, utilizando a RPC `get_unbilled_participants_v2` que ja funciona corretamente.

### 2.3 Fluxo de Recorrencia

```text
Professor agenda aula recorrente (ex: semanal, 4 ocorrencias)
              │
              ▼
    Template criado no banco (is_template=true)
    + Participantes vinculados
              │
              ▼
     ┌────────────────────────────┐
     │  charge_timing = prepaid?  │
     └────────┬───────────────────┘
              │
     ┌────────┴────────┐
     │ SIM              │ NAO
     ▼                  ▼
  Nao cobrar         Nao cobrar
  agora (template    agora
  nao materializa)   (pos-pago padrao)
     │
     ▼
  Aulas virtuais sao materializadas individualmente
  quando professor confirma/conclui cada uma.
  A cobranca pre-paga ocorre na MATERIALIZACAO.
```

**DECISAO CRITICA**: Para recorrencias, mesmo com `prepaid`, NAO cobramos todas de uma vez no momento da criacao. O template apenas registra a intencao. A cobranca ocorre quando cada aula e materializada (confirmada ou concluida pelo professor). Isso evita:
- Cobrar aulas que serao canceladas
- Conflito entre aulas virtuais e faturas
- Complexidade de estorno de lotes

---

## 3. Estrutura de Dados

### 3.1 Alteracao: business_profiles

```sql
-- Adicionar configuracao global de timing de cobranca
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS charge_timing TEXT NOT NULL DEFAULT 'prepaid'
  CHECK (charge_timing IN ('prepaid', 'postpaid'));

COMMENT ON COLUMN public.business_profiles.charge_timing IS
  'Momento da cobranca de aulas avulsas: prepaid (imediata ao agendar) ou postpaid (proximo ciclo de faturamento)';
```

**Estado atual da tabela `business_profiles`:**
```text
id                      UUID PK
user_id                 UUID FK -> profiles
business_name           TEXT
cnpj                    TEXT
stripe_connect_id       TEXT
enabled_payment_methods TEXT[]
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ
-- NOVO:
charge_timing           TEXT DEFAULT 'prepaid' CHECK ('prepaid', 'postpaid')
```

### 3.2 Alteracao: invoice_classes

```sql
-- Rastrear Invoice Items pendentes no Stripe para gerenciar cancelamentos
ALTER TABLE public.invoice_classes
  ADD COLUMN IF NOT EXISTS stripe_invoice_item_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.invoice_classes.stripe_invoice_item_id IS
  'ID do Invoice Item no Stripe Connect para rastreamento e cancelamento';
```

**Estado atual da tabela `invoice_classes`:**
```text
id                      UUID PK
invoice_id              UUID FK -> invoices
class_id                UUID FK -> classes (nullable)
participant_id          UUID FK -> class_participants (nullable)
dependent_id            UUID FK -> dependents (nullable)
item_type               TEXT
amount                  NUMERIC
description             TEXT
charge_percentage       NUMERIC
cancellation_policy_id  UUID FK
created_at              TIMESTAMPTZ
-- NOVO:
stripe_invoice_item_id  TEXT DEFAULT NULL
```

### 3.3 Indices

```sql
-- Indice para buscas eficientes por stripe_invoice_item_id
CREATE INDEX IF NOT EXISTS idx_invoice_classes_stripe_item
  ON public.invoice_classes(stripe_invoice_item_id)
  WHERE stripe_invoice_item_id IS NOT NULL;
```

---

## 4. Implementacao Frontend

### 4.1 BillingSettings - Card "Momento da Cobranca"

**Arquivo**: `src/components/Settings/BillingSettings.tsx`

Adicionar um novo Card entre o card de "Configuracoes de Cobranca" e o card de "Metodos de Pagamento". Este card so aparece se o professor tiver `businessProfileId`.

**Design Visual:**
```text
┌──────────────────────────────────────────────────────────────┐
│ ⚡ Momento da Cobranca                                       │
│ Defina quando seus alunos serao cobrados pelas aulas         │
│                                                              │
│ ┌─────────────────────────────────────┐                      │
│ │ (●) Pre-paga                        │  <- Card selecionavel│
│ │ ⚡ Cobra automaticamente ao agendar │                      │
│ │ a aula. O aluno recebe a fatura     │                      │
│ │ imediatamente.                      │                      │
│ └─────────────────────────────────────┘                      │
│                                                              │
│ ┌─────────────────────────────────────┐                      │
│ │ ( ) Pos-paga                        │  <- Card selecionavel│
│ │ 🕐 Acumula as aulas e cobra tudo   │                      │
│ │ junto na proxima fatura do ciclo    │                      │
│ │ de cobranca.                        │                      │
│ └─────────────────────────────────────┘                      │
│                                                              │
│ ℹ️ Mensalidades nao sao afetadas por esta configuracao.     │
│ Elas seguem o ciclo de cobranca proprio.                     │
│                                                              │
│ [Salvar]                                                     │
└──────────────────────────────────────────────────────────────┘
```

**Alteracoes no codigo:**

```typescript
// Novo estado
const [chargeTiming, setChargeTiming] = useState<'prepaid' | 'postpaid'>('prepaid');
const [savingTiming, setSavingTiming] = useState(false);

// Em loadSettings(), adicionar ao fetch do business_profiles:
// .select('id, enabled_payment_methods, charge_timing')
// if (businessProfile) { setChargeTiming(businessProfile.charge_timing || 'prepaid'); }

// Nova funcao para salvar
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

### 4.2 Agenda.tsx - Integracao handleClassSubmit

**Arquivo**: `src/pages/Agenda.tsx`

Apos a criacao das aulas e participantes no banco (linhas ~1470-1510), adicionar chamada condicional ao `process-class-billing`:

```typescript
// APOS inserir aulas e participantes com sucesso:

// Nao processar cobranca para:
// 1. Templates de recorrencia (cobranca ocorre na materializacao)
// 2. Aulas experimentais (nunca cobradas)
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
    console.error('Erro ao processar cobranca (nao critico):', billingError);
    // Nao falhar a criacao da aula por erro de cobranca
  }
}
```

**Tambem adicionar na materializacao** (`materializeVirtualClass`, linhas ~1269-1371):

Apos materializar a aula virtual com sucesso, chamar `process-class-billing` para a aula materializada se nao for experimental:

```typescript
// APOS materializar com sucesso:
if (!virtualClass.is_experimental && virtualClass.service_id) {
  try {
    await supabase.functions.invoke('process-class-billing', {
      body: {
        class_ids: [newClass.id],
        teacher_id: profile.id
      }
    });
  } catch (billingError) {
    console.error('Erro ao processar cobranca de aula materializada:', billingError);
  }
}
```

### 4.3 CancellationModal.tsx - Cancelamento Condicional

**Arquivo**: `src/components/CancellationModal.tsx`

Adicionar logica para verificar se a aula tem fatura emitida e trata-la adequadamente:

```typescript
// Em loadPolicyAndCalculateCharge ou no handleCancel:
// Buscar se a aula tem invoice vinculada via invoice_classes

// Se tem stripe_invoice_id (fatura emitida):
//   -> Chamar edge function para void da invoice no Stripe
//   -> Marcar invoice como 'cancelada' no banco

// Se tem stripe_invoice_item_id (item pendente, sem fatura):
//   -> Chamar edge function para deletar o invoice item
//   -> Remover registro de invoice_classes

// Se nao tem nada no Stripe:
//   -> Cancelar normalmente (comportamento atual mantido)
```

**Nova Edge Function auxiliar**: A logica de void/delete Stripe sera adicionada na `process-cancellation` existente, nao sera necessaria uma nova edge function.

### 4.4 ClassForm.tsx - Exibicao de Preco ReadOnly

**Arquivo**: `src/components/ClassForm/ClassForm.tsx`

O ClassForm ja exibe os servicos e seus precos. Nenhuma alteracao e necessaria no modal de agendamento em si. A configuracao pre/pos-paga e global e nao aparece no ClassForm. O preco do servico ja e mostrado como read-only (vem do cadastro de servicos).

---

## 5. Implementacao Backend

### 5.1 Edge Function: process-class-billing

**Arquivo**: `supabase/functions/process-class-billing/index.ts`

**NOVA Edge Function** - Router central de cobranca chamado apos criacao de aulas.

```typescript
// Parametros de entrada
interface ProcessClassBillingRequest {
  class_ids: string[];   // IDs das aulas criadas (ja no banco)
  teacher_id: string;    // ID do professor
}

// Logica principal:
// 1. Autenticar professor (auth.uid() === teacher_id)
// 2. Buscar business_profile do professor
//    -> Se nao tem business_profile: retornar silenciosamente (sem Stripe)
//    -> Se charge_timing === 'postpaid': retornar silenciosamente (sera cobrado no ciclo)
// 3. Se charge_timing === 'prepaid':
//    a. Para cada aula, buscar servico e preco
//    b. Para cada participante unico, buscar/criar customer no Stripe
//    c. Criar Invoice Items (stripe.invoiceItems.create) com metadata.lesson_id
//    d. Criar Invoice (stripe.invoices.create com auto_advance: true)
//    e. Finalizar Invoice (stripe.invoices.finalizeInvoice)
//    f. Aplicar hierarquia de pagamento (Boleto -> PIX -> Nenhum) - REUTILIZAR logica v2.3
//    g. Salvar stripe_invoice_id na tabela invoices
//    h. Salvar stripe_invoice_item_id em invoice_classes
//    i. Atualizar status da aula para 'awaiting_payment' (ou manter 'confirmada')
```

**Pontos criticos:**

1. **Stripe Connect**: Todas as operacoes devem usar `{ stripeAccount: connectAccountId }`:
```typescript
const item = await stripe.invoiceItems.create({
  customer: stripeCustomerId,
  amount: Math.round(servicePrice * 100), // centavos
  currency: 'brl',
  description: `Aula de ${serviceName} - ${classDate}`,
  metadata: { lesson_id: classId }
}, { stripeAccount: connectAccountId });
```

2. **Customer Stripe**: Verificar se o aluno ja tem customer no Stripe Connect do professor. Se nao, criar via `stripe.customers.create`.

3. **Hierarquia de pagamento**: Reutilizar a mesma logica do `create-payment-intent-connect`:
   - Buscar `enabled_payment_methods` do `business_profiles`
   - Boleto habilitado + valor >= R$5? Gerar boleto
   - PIX habilitado + valor >= R$1? Gerar PIX
   - Senao: Nenhum pagamento pre-gerado

4. **Atomicidade**: Se o Stripe falhar, NAO salvar no banco. A aula ja foi criada (isso e ok), mas nao tera cobranca vinculada. O professor pode cobrar manualmente depois.

5. **Lote para aulas avulsas**: Se `class_ids` tem mais de uma aula (aulas avulsas em lote), criar N Invoice Items e UMA unica Invoice.

### 5.2 Ajustes no automated-billing

**Arquivo**: `supabase/functions/automated-billing/index.ts`

**Ajuste necessario**: O `automated-billing` deve ignorar aulas que ja foram cobradas via pre-pago.

A RPC `get_unbilled_participants_v2` ja filtra participantes que NAO foram faturados (verificando `invoice_classes`). Portanto, aulas pre-pagas que ja tem `invoice_classes` vinculado serao automaticamente excluidas.

**Verificacao extra**: Adicionar log para confirmar que aulas pre-pagas nao estao sendo processadas novamente:

```typescript
// Apos buscar completedParticipations:
const alreadyBilledCount = /* contar participacoes que tem invoice_classes */;
if (alreadyBilledCount > 0) {
  logStep(`Skipped ${alreadyBilledCount} already-billed participations (prepaid)`, {
    student: studentInfo.student_name
  });
}
```

**IMPORTANTE**: Se a RPC `get_unbilled_participants_v2` ja faz o filtro correto (o que precisa ser verificado), nenhuma alteracao e necessaria na funcao. Caso contrario, adicionar filtro:

```sql
-- Verificar que a RPC exclui participantes que ja estao em invoice_classes
-- Se nao excluir, adicionar:
AND cp.id NOT IN (
  SELECT ic.participant_id FROM invoice_classes ic
  WHERE ic.participant_id IS NOT NULL
)
```

### 5.3 Ajustes no webhook-stripe-connect

**Arquivo**: `supabase/functions/webhook-stripe-connect/index.ts`

**Handler `invoice.paid` existente (linha 300)**: Verificar se ja processa `metadata.lesson_id` nas linhas da invoice. Se nao, adicionar:

```typescript
case 'invoice.paid': {
  const invoice = eventObject;
  
  // ... logica existente de atualizar status da invoice no banco ...
  
  // NOVO: Iterar sobre linhas da fatura e atualizar status das aulas
  if (invoice.lines?.data) {
    for (const line of invoice.lines.data) {
      const lessonId = line.metadata?.lesson_id;
      if (lessonId) {
        // Atualizar status da aula para 'confirmada' (paga)
        await supabaseClient
          .from('classes')
          .update({ status: 'confirmada' })
          .eq('id', lessonId);
        
        // Atualizar participantes
        await supabaseClient
          .from('class_participants')
          .update({ status: 'confirmada', confirmed_at: new Date().toISOString() })
          .eq('class_id', lessonId)
          .neq('status', 'cancelada');
        
        logStep(`Lesson ${lessonId} confirmed via invoice payment`);
      }
    }
  }
  break;
}
```

---

## 6. Internacionalizacao (i18n)

### 6.1 Portugues (pt)

**Arquivo**: `src/i18n/locales/pt/billing.json` - Adicionar:

```json
{
  "chargeTiming": {
    "title": "Momento da Cobranca",
    "description": "Defina quando seus alunos serao cobrados pelas aulas avulsas",
    "prepaid": "Pre-paga",
    "prepaidDescription": "Cobra automaticamente ao agendar a aula. O aluno recebe a fatura imediatamente.",
    "postpaid": "Pos-paga",
    "postpaidDescription": "Acumula as aulas e cobra tudo junto na proxima fatura do ciclo de cobranca.",
    "subscriptionNote": "Mensalidades nao sao afetadas por esta configuracao. Elas seguem o ciclo de cobranca proprio.",
    "saveSuccess": "Configuracao de cobranca atualizada com sucesso.",
    "saveError": "Erro ao atualizar configuracao de cobranca."
  }
}
```

### 6.2 English (en)

**Arquivo**: `src/i18n/locales/en/billing.json` - Adicionar:

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

---

## 7. Cancelamento e Edicao

### 7.1 Regras por Estado da Aula

| Estado da Aula | Tem Fatura Stripe? | Edicao de Servico | Cancelamento |
|----------------|-------------------|-------------------|--------------|
| Pre-paga com fatura emitida | Sim (`stripe_invoice_id`) | **Bloqueada** | Void invoice no Stripe + cancelar no banco |
| Pre-paga com item pendente | Sim (`stripe_invoice_item_id`) | Permitida (atualizar item) | Deletar item no Stripe + cancelar no banco |
| Pos-paga (sem Stripe) | Nao | Permitida | Apenas cancelar no banco |
| Experimental | Nao | N/A | Apenas cancelar no banco |

### 7.2 Fluxo de Cancelamento

```text
Professor cancela aula
        │
        ▼
┌─────────────────────────┐
│ Aula tem                │
│ stripe_invoice_id?      │
└─────────┬───────────────┘
          │
    ┌─────┴──────┐
    │ SIM        │ NAO
    ▼            ▼
┌────────────┐  ┌─────────────────────────┐
│ Void       │  │ Aula tem                │
│ invoice    │  │ stripe_invoice_item_id? │
│ no Stripe  │  └─────────┬───────────────┘
│            │            │
│ + Cancelar │     ┌──────┴──────┐
│ no banco   │     │ SIM        │ NAO
└────────────┘     ▼            ▼
              ┌────────────┐  ┌────────────┐
              │ Delete     │  │ Cancelar   │
              │ item no    │  │ apenas no  │
              │ Stripe     │  │ banco      │
              │            │  │ (fluxo     │
              │ + Cancelar │  │ atual)     │
              │ no banco   │  └────────────┘
              └────────────┘
```

---

## 8. Webhooks e Reconciliacao

### 8.1 invoice.payment_succeeded

Quando o Stripe notifica que uma invoice foi paga (seja por boleto, PIX ou cartao):

1. Buscar a invoice no banco pelo `stripe_invoice_id`
2. Atualizar status para `pago`
3. Iterar sobre `invoice.lines.data`
4. Para cada linha com `metadata.lesson_id`:
   - Atualizar `classes.status` conforme necessario
   - Atualizar `class_participants.status` para `confirmada`
5. Limpar campos temporarios (boleto_url, pix_qr_code, etc.)

### 8.2 payment_intent.succeeded (existente)

O handler existente de `payment_intent.succeeded` ja processa pagamentos individuais. A nova logica via `invoice.paid` complementa para coberturas de faturas com multiplos itens.

---

## 9. Compatibilidade com Sistema Existente

| Componente | Impacto | Acao |
|-----------|---------|------|
| `automated-billing` (tradicional) | Baixo | Aulas pre-pagas ja terao `invoice_classes`, serao filtradas pela RPC |
| `automated-billing` (mensalidades) | Nenhum | Mensalidades nao sao afetadas por `charge_timing` |
| `create-invoice` (manual) | Nenhum | Continua funcionando independentemente |
| `Financeiro.tsx` (lista faturas) | Baixo | Novas faturas tipo 'extra_class' aparecerao na lista normalmente |
| `PaymentOptionsCard` | Nenhum | Faturas pre-pagas usam o mesmo fluxo de pagamento |
| `Faturas.tsx` (aluno) | Nenhum | Faturas pre-pagas aparecem como qualquer outra fatura |
| `StudentImportDialog` | Nenhum | Import de alunos nao interage com billing |
| Aulas antigas (sem `charge_timing`) | Nenhum | Continuam no fluxo pos-pago (serao cobradas pelo automated-billing como antes) |
| Professores sem business_profile | Nenhum | Sem Stripe, cobranca nao se aplica |

---

## 10. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|--------------|---------|-----------|
| Duplicidade de cobranca (pre-pago + automated-billing) | Media | Alto | RPC `get_unbilled_participants_v2` filtra participantes ja faturados via `invoice_classes` |
| Falha na criacao do Invoice no Stripe | Baixa | Medio | Nao impede criacao da aula; professor pode cobrar manualmente depois |
| Aluno sem customer_id no Stripe Connect | Media | Medio | Criar customer automaticamente na primeira cobranca pre-paga |
| Professor muda de prepaid para postpaid com faturas pendentes | Baixa | Baixo | Faturas existentes nao sao afetadas; apenas novas aulas seguem nova config |
| Cancelamento de aula com fatura ja paga | Baixa | Alto | Nao permitir void de faturas ja pagas; apenas faturas pendentes podem ser anuladas |
| Recorrencia com prepaid cobrando todas as aulas de uma vez | Media | Alto | Cobranca ocorre na materializacao, nao na criacao do template |
| Customer Stripe duplicado para mesmo aluno | Baixa | Medio | Buscar customer existente antes de criar novo; usar email como chave |

---

## 11. Sequencia de Implementacao

```text
FASE 1: Migracao de Banco de Dados
│  - charge_timing em business_profiles
│  - stripe_invoice_item_id em invoice_classes
│  - Regenerar tipos TypeScript
│
▼
FASE 2: Frontend - BillingSettings
│  - Card "Momento da Cobranca"
│  - Estado, load, save
│  - Traducoes i18n (PT/EN)
│
▼
FASE 3: Backend - Edge Function process-class-billing
│  - Nova edge function
│  - Logica de roteamento prepaid/postpaid
│  - Integracao Stripe Connect (Invoice Items + Invoice)
│  - Hierarquia de pagamento (Boleto -> PIX -> Nenhum)
│
▼
FASE 4: Integracao - Agenda.tsx
│  - handleClassSubmit chama process-class-billing
│  - materializeVirtualClass chama process-class-billing
│
▼
FASE 5: Cancelamento - CancellationModal + process-cancellation
│  - Logica de void/delete condicional
│  - Verificar invoice_classes antes de cancelar
│
▼
FASE 6: Webhook - webhook-stripe-connect
│  - Processar metadata.lesson_id em invoice.paid
│  - Atualizar status de aulas automaticamente
│
▼
FASE 7: Ajustes - automated-billing
│  - Verificar que RPC filtra aulas ja cobradas
│  - Adicionar logs de debug
│
▼
FASE 8: Testes e Validacao
│  - Testar cenarios 1-5 da matriz
│  - Testar cancelamento em cada estado
│  - Testar recorrencia com materializacao
│  - Testar troca de prepaid <-> postpaid
```

---

## 12. Arquivos a Criar/Modificar

| Arquivo | Tipo | Fase | Descricao |
|---------|------|------|-----------|
| Migracao SQL | **Criar** | 1 | `charge_timing` + `stripe_invoice_item_id` |
| `src/integrations/supabase/types.ts` | **Regenerar** | 1 | Atualizar tipos apos migracao |
| `src/components/Settings/BillingSettings.tsx` | **Modificar** | 2 | Novo card "Momento da Cobranca" |
| `src/i18n/locales/pt/billing.json` | **Modificar** | 2 | Traducoes chargeTiming |
| `src/i18n/locales/en/billing.json` | **Modificar** | 2 | Traducoes chargeTiming |
| `supabase/functions/process-class-billing/index.ts` | **Criar** | 3 | Router de cobranca central |
| `supabase/config.toml` | **Modificar** | 3 | Registrar nova function |
| `src/pages/Agenda.tsx` | **Modificar** | 4 | Chamar process-class-billing |
| `src/components/CancellationModal.tsx` | **Modificar** | 5 | Logica condicional de void/delete |
| `supabase/functions/process-cancellation/index.ts` | **Modificar** | 5 | Adicionar void/delete Stripe |
| `supabase/functions/webhook-stripe-connect/index.ts` | **Modificar** | 6 | Processar lesson_id em invoice.paid |
| `supabase/functions/automated-billing/index.ts` | **Modificar** | 7 | Verificacao e logs de debug |

---

## 13. Checklist de Deploy

### Pre-Deploy

- [ ] Executar migracao SQL em ambiente de teste
- [ ] Regenerar tipos TypeScript
- [ ] Verificar que `get_unbilled_participants_v2` filtra aulas pre-pagas
- [ ] Testar `process-class-billing` com conta Stripe de teste
- [ ] Testar cancelamento nos 3 cenarios (fatura, item, sem stripe)
- [ ] Verificar webhook recebe `invoice.paid` corretamente

### Deploy

- [ ] Executar migracao SQL em producao
- [ ] Deploy de edge functions (process-class-billing, process-cancellation, webhook-stripe-connect, automated-billing)
- [ ] Publicar frontend
- [ ] Verificar config.toml atualizado

### Pos-Deploy

- [ ] Monitorar logs do `automated-billing` no proximo ciclo
- [ ] Verificar que aulas pre-pagas nao sao duplicadas
- [ ] Testar fluxo completo com professor real em producao
- [ ] Verificar que professores sem business_profile nao sao afetados
