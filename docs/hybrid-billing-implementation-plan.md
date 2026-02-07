# Plano de Implementação: Cobrança Híbrida Global (Pré-paga / Pós-paga)

> **Versão**: 2.2 (Revisada — 99 gaps corrigidos)
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

-- [CORREÇÃO v1.7 - Gap 64] MIGRAÇÃO SEGURA para professores existentes:
-- O DEFAULT 'prepaid' aplica-se a NOVAS linhas. Para registros existentes,
-- definir como 'postpaid' para preservar o comportamento atual (aulas acumulam
-- para o próximo ciclo). Sem isso, TODOS os professores teriam cobrança imediata
-- ativada no momento do deploy, gerando faturas inesperadas.
UPDATE public.business_profiles SET charge_timing = 'postpaid';

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
    const { data: billingResult, error: billingError } = await supabase.functions.invoke('process-class-billing', {
      body: {
        class_ids: classIds,
        teacher_id: profile.id
      }
    });
    
    // [CORREÇÃO v1.5 - Gap 55] Feedback visual para o professor
    if (billingError) {
      console.error('Erro ao processar cobrança:', billingError);
      // Não falhar a criação da aula por erro de cobrança
    } else if (billingResult) {
      if (billingResult.charge_timing === 'prepaid' && billingResult.invoices_created?.length > 0) {
        toast({ title: t('chargeTiming.prepaidInvoiceCreated') });
      } else if (billingResult.charge_timing === 'postpaid') {
        // Silencioso: aulas serão cobradas no próximo ciclo
      } else if (billingResult.charge_timing === 'stripe_not_ready') {
        toast({ 
          title: t('chargeTiming.stripeNotReady'), 
          variant: 'destructive' 
        });
      }
    }
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

### 4.3 CancellationModal.tsx - Sem Alteração Significativa

**Arquivo**: `src/components/CancellationModal.tsx`

> **CORREÇÃO v1.2 (Gap 7)**: A verificação de fatura pré-paga foi **removida do frontend** e movida para dentro da edge function `process-cancellation` (seção 5.4). A razão:
>
> 1. **RLS**: O join `invoices!inner(...)` com filtro por `invoice_type` pode falhar se o usuário logado for aluno, pois as políticas RLS da tabela `invoices` podem bloquear o acesso.
> 2. **PostgREST**: Joins aninhados com `!inner` e filtros têm comportamento imprevisível.
> 3. **Segurança**: A edge function usa `SUPABASE_SERVICE_ROLE_KEY` e ignora RLS, garantindo acesso completo.

**Ação**: O `CancellationModal.tsx` **NÃO precisa de alteração** para esta feature. O fluxo atual de cancelamento já chama `process-cancellation`, que agora será responsável por:
- Verificar se a aula tem `invoice_classes` com `invoice_type = 'prepaid_class'`
- Decidir se deve void a invoice no Stripe
- Retornar informação sobre o void no response (para exibir toast adequado)

O frontend apenas continua passando `class_id` e `cancellation_reason` como já faz hoje.

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
// [CORREÇÃO v1.3 - Gap 18] Tipo existente não mapeado
orphan_charges: {
  label: t('invoiceTypes.orphanCharges'),
  icon: FileText,
  className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
},
```

**NOTA**: Os tipos `cancellation` e `orphan_charges` já existem no sistema mas não estão mapeados no `InvoiceTypeBadge`. Aproveitar para adicionar todos.

### 4.5 Indicador Visual na Agenda (Aulas com Fatura Emitida)

> **CORREÇÃO v1.2 (Gap 8)**: Adicionada especificação de indicador visual para aulas pré-pagas no calendário.

**Arquivo**: `src/pages/Agenda.tsx` (renderização de cards no calendário)

**Problema**: O plano menciona bloquear edição de aulas com fatura emitida (seção 7.3), mas sem indicador visual o professor não sabe quais aulas já têm fatura antes de tentar editar.

**Solução**:

1. **[CORREÇÃO v1.5 - Gap 51]** A view `class_billing_status` **NÃO contém** o campo `has_prepaid_invoice`.
   Campos disponíveis: `class_id`, `teacher_id`, `total_participants`, `billed_participants`, `fully_billed`, `has_billed_items`.
   
   O campo `has_billed_items` indica se a aula tem QUALQUER item faturado (inclui pós-pago, mensalidade, etc.), 
   mas **não diferencia** faturas pré-pagas. Portanto, usar query direta em `invoice_classes`:
   ```typescript
   // [Gap 51] Query direta - view não tem campo específico para prepaid
   const { data: billedClassIds } = await supabase
     .from('invoice_classes')
     .select('class_id')
     .eq('item_type', 'prepaid_class')
     .in('class_id', classIds);
   ```
   → Alternativamente, `has_billed_items` da view pode ser usado como indicador genérico 
   de que a aula já foi faturada (qualquer tipo), mas para bloqueio de edição específico 
   de pré-paga, a query direta é necessária.

2. **Exibir ícone discreto** (ex: `Receipt` do lucide-react) no card da aula no calendário quando `billedClassIds` inclui o `class_id`.

3. **Ao abrir detalhes da aula**, mostrar badge "Fatura emitida" usando `<InvoiceTypeBadge invoiceType="prepaid_class" />` se aplicável.

4. **Tooltip**: Ao passar o mouse sobre o ícone, exibir "Aula com fatura pré-paga emitida".

### 4.6 ClassForm.tsx - Nenhuma Alteração

O ClassForm já exibe os serviços e seus preços. Nenhuma alteração é necessária no modal de agendamento. A configuração pré/pós-paga é global e não aparece no ClassForm. O preço do serviço já é mostrado como read-only (vem do cadastro de serviços).

---

## 5. Implementação Backend

### 5.1 Edge Function: process-class-billing

**Arquivo**: `supabase/functions/process-class-billing/index.ts`

**NOVA Edge Function** - Router central de cobrança chamado após criação de aulas.

> **CORREÇÃO v1.3 (Gap 20)**: Esta edge function DEVE incluir CORS headers padrão 
> e handler de `OPTIONS` (como todas as edge functions chamadas do frontend).

> **[CORREÇÃO v2.2 - Gap 96]**: A edge function `process-class-billing` DEVE ter 
> `verify_jwt = false` em `supabase/config.toml` (per convenção do projeto). A validação 
> de JWT é feita IN-CODE via `supabase.auth.getUser(token)` (passo 1). Sem `verify_jwt = false`,
> o Supabase rejeita a requisição com 401 ANTES de a função executar, mesmo com JWT válido,
> porque o default é `verify_jwt = true` que aplica validação no gateway.
>
> **Adicionar em `supabase/config.toml`**:
> ```toml
> [functions.process-class-billing]
> verify_jwt = false
> ```

```typescript
// CORS headers (obrigatório)
// [CORREÇÃO v1.6 - Gap 60] CORS headers DEVEM incluir headers específicos do Supabase
// para compatibilidade com o cliente JS do Supabase.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Parâmetros de entrada
interface ProcessClassBillingRequest {
  class_ids: string[];   // IDs das aulas criadas (já no banco)
  teacher_id: string;    // ID do professor (IGNORADO - usa JWT)
}

// [CORREÇÃO v2.2 - Gap 97] Resposta segue padrão do projeto:
// HTTP 200 + success: false para erros de business logic
// HTTP 500 apenas para erros técnicos inesperados
// Isso permite que o frontend extraia mensagens de erro user-friendly do JSON body.
interface ProcessClassBillingResponse {
  success: boolean;       // OBRIGATÓRIO: true se processou, false se erro de negócio
  processed: number;      // Número de aulas processadas
  skipped: number;        // Número de aulas ignoradas (sem serviço, etc.)
  charge_timing: 'prepaid' | 'postpaid' | 'no_business_profile' | 'stripe_not_ready';
  invoices_created?: string[]; // IDs das faturas criadas (se prepaid)
  error?: string;         // Mensagem de erro user-friendly (se success: false)
}

// TODOS os retornos da edge function devem usar HTTP 200:
// - { success: true, charge_timing: 'prepaid', invoices_created: [...] }
// - { success: true, charge_timing: 'postpaid' }
// - { success: false, charge_timing: 'no_business_profile', error: 'Perfil de negócios não configurado' }
// - { success: false, charge_timing: 'stripe_not_ready', error: 'Conta Stripe não está pronta' }
// - { success: false, error: 'Você não tem permissão para cobrar estas aulas' } // Gap 77
```

**Lógica principal detalhada:**

```
1. [CORREÇÃO v1.6 - Gap 61] Autenticar professor via `supabase.auth.getUser(token)`:
   → Extrair JWT do header `Authorization: Bearer <token>`
   → Validar com `supabaseClient.auth.getUser(token)` (mesmo padrão de `create-invoice`)
   → O `teacher_id` no body é IGNORADO; o professor autenticado é determinado pelo JWT
   → Isso segue o padrão de segurança do projeto (doc: `teacher-context-security-pattern.md`)

1.5 [CORREÇÃO v1.9 - Gap 77] Validar ownership dos class_ids:
   → Para cada class_id recebido no body, buscar `classes.teacher_id`
   → Se `class.teacher_id !== authenticated_teacher_id`, REJEITAR com erro 403
   → Sem essa validação, um professor autenticado poderia passar class_ids de outro professor
     e o sistema processaria (usando o business_profile do atacante mas referenciando aulas alheias)
   → Implementar ANTES de qualquer lógica de billing

2. [CORREÇÃO v2.1 - Gap 89] Buscar business_profile CORRETO para este contexto:
   → NÃO usar `WHERE user_id = teacher_id LIMIT 1` (poderia pegar o profile errado 
     se professor tem múltiplos business_profiles com charge_timing diferentes).
   → Lógica correta para cada cenário:
     a) Se class_ids têm PARTICIPANTES, buscar o primeiro student_id → 
        buscar `teacher_student_relationships.business_profile_id` WHERE teacher_id AND student_id
        → se não-null, buscar `business_profiles` WHERE id = relationship.business_profile_id
        → se null (campo nullable), FALLBACK: buscar `business_profiles` WHERE user_id = teacher_id LIMIT 1
     b) Se cenário (a) não aplicável, usar `business_profiles WHERE user_id = teacher_id LIMIT 1`
   → Isso garante consistência: o `charge_timing` e o `stripe_connect_id` vêm do MESMO profile.
   → Sem essa correção, professor com PJ (prepaid) e PF (postpaid) poderia usar
     charge_timing do profile PJ mas criar invoice no Connected Account do profile PF.
   
   SELECT id, charge_timing, stripe_connect_id, enabled_payment_methods
   FROM business_profiles
   WHERE id = relationship_business_profile_id OR user_id = teacher_id
   ORDER BY (id = relationship_business_profile_id) DESC  -- priorizar da relationship
   LIMIT 1
    
   → Se NÃO tem business_profile: retornar { charge_timing: 'no_business_profile' }
   → Se charge_timing === 'postpaid': retornar { charge_timing: 'postpaid' }

2.5 [CORREÇÃO v1.2 - Gap 6] Validar Stripe Connect:
   → Verificar que business_profile.stripe_connect_id NÃO é null
   → Buscar payment_accounts WHERE teacher_id = teacher_id
     AND stripe_connect_account_id = business_profile.stripe_connect_id
   → Verificar que stripe_charges_enabled = true
   → [CORREÇÃO v2.1 - Gap 88] GUARDAR o `payment_accounts.id` como `paymentAccountId`
     para uso posterior no passo 3c.vi (campo `payment_account_used_id` do invoice)
   → Se NÃO estiver habilitado: retornar { charge_timing: 'stripe_not_ready' }
     silenciosamente (professor não completou onboarding do Stripe)

2.6 [CORREÇÃO v1.2 - Gap 4] Buscar payment_due_days:
   SELECT payment_due_days FROM profiles WHERE id = teacher_id
   → O campo payment_due_days está na tabela `profiles` (NÃO em business_profiles)
   → Valor padrão: 7 (se null)
   → Será usado em days_until_due na criação da Invoice Stripe (passo 3c.iv)

3. Se charge_timing === 'prepaid':
   
3a. [CORREÇÃO v1.4 - Gap 48] Verificação de idempotência:
        - Para cada class_id, verificar se já existe `invoice_classes` com `item_type = 'prepaid_class'`
        - Se existir, PULAR essa aula (evita cobrança duplicada em caso de retry/double-click)
        - Logar: `Skipping class ${classId}: already has prepaid invoice`
    
    3a-bis. Para cada class_id, buscar dados completos:
        - class_services (preço, nome)
        - class_participants (student_id, dependent_id)
        - Excluir aulas experimentais (is_experimental = true)
        - Excluir aulas que já têm invoice_classes (evitar duplicidade - redundância com 3a)
   
   3a-ter. [CORREÇÃO v1.9 - Gap 76] Excluir participantes com mensalidade ativa:
        - Para cada participante, buscar `teacher_student_relationships.id` (relationship_id)
          WHERE teacher_id = authenticated_teacher_id AND student_id = participant.student_id
        - Com o relationship_id, buscar `student_monthly_subscriptions`
          WHERE relationship_id = relationship_id AND is_active = true
        - Se o participante TEM mensalidade ativa: PULAR billing pré-pago para ele
          → Aula será contabilizada pelo `automated-billing` no ciclo da mensalidade
          → Logar: `Skipping prepaid for participant ${participantId}: has active subscription`
        - Para dependentes: usar o responsible_id para buscar a relação
        - **CRÍTICO**: Sem essa verificação, `process-class-billing` criaria `invoice_classes`
          que impediriam `get_unbilled_participants_v2` de contar a aula na franquia do plano.
          Resultado: aluno cobrado 2x (prepaid individual + mensalidade base).

   3b. Agrupar participantes por student_id (responsável):
       - Se participante tem dependent_id, buscar responsible_id na tabela dependents
       - Agrupar todas as aulas do mesmo responsável em uma única fatura
   
   3c. Para cada responsável/aluno único:
       i.   Buscar business_profile_id via teacher_student_relationships
        ii.  Buscar/criar customer no Connected Account:
             - stripe.customers.list({ email }, { stripeAccount })
             - Se não existe: stripe.customers.create({ email, name }, { stripeAccount })
             - [CORREÇÃO v1.4 - Gap 39] Persistir `stripe_customer_id` de volta:
               → UPDATE teacher_student_relationships SET stripe_customer_id = connectedCustomerId
                 WHERE teacher_id = teacher_id AND student_id = studentId
               → Evita buscar/criar novamente em futuras cobranças
             - [CORREÇÃO v1.6 - Gap 62] A edge function `create-payment-intent-connect` 
               TAMBÉM cria customers no Connected Account (linhas 422-434) mas NÃO persiste 
               o ID. Para evitar duplicação, `process-class-billing` deve PRIMEIRO verificar 
               `teacher_student_relationships.stripe_customer_id` antes de chamar `stripe.customers.list`.
               → Se já existe: usar diretamente (sem chamar a API Stripe)
               → Se não existe: buscar por email, criar se necessário, E persistir
       iii. [CORREÇÃO v1.2 - Gap 5] Para cada aula desse aluno:
            - Se participante tem dependent_id:
              → Buscar nome do dependente: SELECT name FROM dependents WHERE id = dependent_id
              → Descrição: `[NomeDependente] - Aula de ${serviceName} - ${classDate}`
            - Se participante NÃO tem dependent_id:
              → Descrição: `Aula de ${serviceName} - ${classDate}`
             - [CORREÇÃO v1.4 - Gap 49] Todas chamadas Stripe usam apiVersion padronizado:
               `const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });`
              - [CORREÇÃO v2.1 - Gap 92] Usar Stripe Idempotency Keys em TODAS as chamadas:
                `{ stripeAccount: connectAccountId }` deve incluir `idempotencyKey`:
                ```
                const idempotencyKey = `prepaid-item-${classId}-${participantId}`;
                ```
              - stripe.invoiceItems.create({
                  customer: connectedCustomerId,
                  amount: Math.round(price * 100),
                  currency: 'brl',
                  description: descricaoCalculadaAcima,
                  metadata: { lesson_id: classId, participant_id: participantId, dependent_id: dependentId || null }
                }, { stripeAccount: connectAccountId, idempotencyKey })
             - [CORREÇÃO v1.4 - Gap 47] Guardar IDs dos Invoice Items criados em array:
               `createdItemIds.push(invoiceItem.id)`
               → Em caso de falha no passo iv/v, fazer cleanup:
               ```
               for (const itemId of createdItemIds) {
                 await stripe.invoiceItems.del(itemId, { stripeAccount: connectAccountId });
               }
               ```
        iv.  [CORREÇÃO v1.3 - Gap 17] stripe.invoices.create({
               customer: connectedCustomerId,
               auto_advance: false,  ← IMPORTANTE: false para evitar finalização automática
               collection_method: 'send_invoice',
               days_until_due: paymentDueDays, // [Gap 4] Vem de profiles.payment_due_days
               metadata: { teacher_id, invoice_source: 'prepaid_billing' }
             }, { 
               stripeAccount: connectAccountId,
               // [CORREÇÃO v2.1 - Gap 92] Idempotency key para criação de Invoice
               idempotencyKey: `prepaid-invoice-${connectedCustomerId}-${classIds.sort().join('-')}`
             })
            NOTA: Usar auto_advance: false para controlar explicitamente 
            a finalização no passo v. Com auto_advance: true, chamar 
            finalizeInvoice causaria erro 'invoice_already_finalized'.
       v.   stripe.invoices.finalizeInvoice(stripeInvoice.id, { stripeAccount })
       vi.  [CORREÇÃO v1.2 - Gap 2] Criar registro na tabela `invoices` com:
             - invoice_type: 'prepaid_class'
             - stripe_invoice_id: stripeInvoice.id
             - stripe_hosted_invoice_url: stripeInvoice.hosted_invoice_url  ← CRÍTICO para "Pagar Agora"
             - stripe_invoice_url: stripeInvoice.invoice_pdf                ← URL do PDF da fatura
             - status: 'pendente'
             - student_id: responsável
             - teacher_id
             - business_profile_id: da relationship
             - amount: soma dos preços
             - gateway_provider: 'stripe'
              - [CORREÇÃO v1.4 - Gap 42] payment_origin: 'prepaid'
                ← Diferencia de faturas criadas por `automated-billing` (`payment_origin: 'automated'`)
                e faturas manuais (`payment_origin: 'manual'`)
              - [CORREÇÃO v2.1 - Gap 88] payment_account_used_id: paymentAccountId
                ← Buscar `payment_accounts.id` WHERE `stripe_connect_account_id = business_profile.stripe_connect_id`
                  AND `teacher_id = teacher_id`. Sem esse campo, relatórios financeiros e dashboards
                  do professor que agrupam por conta de pagamento não incluiriam faturas pré-pagas.
                  O `automated-billing` já seta esse campo; `process-class-billing` deve ser consistente.
              - [CORREÇÃO v2.1 - Gap 93] business_profile_id: relationship.business_profile_id || businessProfile.id
                ← Se `teacher_student_relationships.business_profile_id` é null (campo nullable),
                  usar o `business_profile.id` do step 2 como fallback. Mantém consistência entre
                  a decisão de cobrança (step 2) e o registro da fatura (step 3c.vi).
              - [CORREÇÃO v1.4 - Gap 45] class_id: classIds.length === 1 ? classIds[0] : null
               ← Para faturas com múltiplas aulas, `class_id` fica null. 
               A relação aula↔fatura é via `invoice_classes` (relação N:N).
            - [CORREÇÃO v1.3 - Gap 15] due_date: calculado como 
              new Date(Date.now() + paymentDueDays * 86400000).toISOString().split('T')[0]
              ← Campo NOT NULL obrigatório na tabela invoices
            - [CORREÇÃO v1.3 - Gap 16] description: 
              `Fatura pré-paga - Aula(s) de ${serviceName}`
              ← Campo opcional mas importante para exibição
             NOTA: Sem hosted_invoice_url, Faturas.tsx (linha 131) não consegue 
             renderizar o botão "Pagar Agora" para faturas pré-pagas.
             - [CORREÇÃO v1.4 - Gap 44] description: Se fatura tem múltiplos serviços,
               listar todos: `Fatura pré-paga - Aula de Piano, Aula de Violão (2 aulas)`
               Se todos mesmos serviço: `Fatura pré-paga - 3x Aula de Piano`
        vii. [CORREÇÃO v1.2 - Gap 5] Criar registros em `invoice_classes` com:
            - stripe_invoice_item_id: cada item do Stripe
            - class_id, participant_id, amount, item_type: 'prepaid_class'
            - dependent_id: se o participante tem dependente vinculado ← NOVO

4. [CORREÇÃO v1.4 - Gap 38] Após criar fatura, invocar `send-invoice-notification`:
   ```typescript
   // [CORREÇÃO v1.5 - Gap 50] O payload DEVE incluir notification_type (campo obrigatório).
   // Sem ele, a edge function não sabe qual template de email usar e falha silenciosamente.
   await supabaseClient.functions.invoke('send-invoice-notification', {
     body: { 
       invoice_id: newInvoice.id,
       notification_type: 'invoice_created'  // ← OBRIGATÓRIO
     }
   });
   ```
   → Sem isso, aluno NÃO recebe email/notificação da fatura pré-paga.
   → O `send-invoice-notification` já existe e envia email via SES + cria notificação in-app.
   → **ATENÇÃO**: O campo `notification_type` é obrigatório. Valores aceitos: 
     `'invoice_created'`, `'invoice_payment_reminder'`, `'invoice_paid'`, `'invoice_overdue'`.

5. Retornar resultado com IDs das faturas criadas
```

**Pontos críticos:**

1. **Stripe Connect**: TODAS as operações (customers, invoiceItems, invoices) devem usar `{ stripeAccount: connectAccountId }`. Diferente do `create-payment-intent-connect` que cria clientes na plataforma para cartão — aqui tudo é no Connected Account.

2. **Customer no Connected Account**: O `create-payment-intent-connect` cria clientes no Connected Account para PIX (linhas 422-434). Reutilizar essa mesma lógica. Buscar por email no Connected Account, criar se não existir.

3. **Hierarquia de pagamento**: NÃO se aplica aqui. A Invoice do Stripe será enviada com `collection_method: 'send_invoice'` e `days_until_due`. O aluno receberá o link de pagamento e escolherá o método disponível. O Stripe cuida da apresentação dos métodos habilitados no Connected Account.

4. **Atomicidade e Rollback** [CORREÇÃO v1.4 - Gap 47]: Se o Stripe falhar em qualquer etapa, fazer cleanup:
    - Deletar Invoice Items já criados via `stripe.invoiceItems.del(itemId, { stripeAccount })`
    - Se a Invoice foi criada mas finalização falhou: `stripe.invoices.del(invoiceId, { stripeAccount })` (só invoices draft)
    - NÃO salvar no banco (invoices/invoice_classes)
    - A aula já foi criada (ok), mas sem cobrança vinculada
    - Professor pode cobrar manualmente depois
    - Logar todos os IDs deletados para auditoria

5. **Lote para aulas avulsas**: Se `class_ids` tem mais de uma aula para o MESMO aluno, criar N Invoice Items e UMA única Invoice.

6. **Múltiplos alunos**: Se `class_ids` inclui aulas em grupo com múltiplos participantes, criar UMA Invoice por aluno (cada um com seus itens).

7. **[CORREÇÃO v1.6 - Gap 63] Billing parcial em grupo**: A RPC `get_unbilled_participants_v2` filtra por `participant_id` (não `class_id`). Isso significa que em uma aula em grupo, se 3 dos 4 participantes já foram cobrados (pré-pago), apenas o 4º será capturado pelo `automated-billing`. Documentar esse comportamento explicitamente para evitar confusão durante testes.

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

> **CORREÇÃO v1.3 (Gap 14)**: O payload do webhook `invoice.paid` NÃO garante que 
> `invoice.lines.data` esteja completo. O Stripe pode enviar apenas um subset ou um 
> objeto `list` com `has_more: true`. A solução é **buscar a invoice completa** via API:

> **CORREÇÃO v1.3 (Gap 13)**: A atualização de `class_participants` deve ser filtrada 
> pelo `participant_id` específico (do metadata), NÃO por `class_id`. Em aulas em grupo, 
> confirmar por `class_id` confirmaria todos os participantes quando apenas um pagou.

```typescript
case 'invoice.paid': {
  const paidInvoice = eventObject as Stripe.Invoice;
  logStep("Invoice paid", { invoiceId: paidInvoice.id });

  // [CORREÇÃO v2.0 - Gap 87] Consolidar queries de verificação.
  // O código anterior fazia 2 queries separadas: uma para checar 'manual' (linhas 306-315)
  // e outra para checar payment_origin (Gap 53). Consolidar em UMA query com .maybeSingle()
  // que já implementa Gap 75 (null safety) e Gap 53 (preservar payment_origin).
  const { data: currentInvoice } = await supabaseClient
    .from('invoices')
    .select('id, payment_origin, invoice_type')
    .eq('stripe_invoice_id', paidInvoice.id)
    .maybeSingle();

  // [Gap 75] Se invoice não existe no nosso banco, logar e retornar 200
  if (!currentInvoice) {
    logStep("Invoice not found in local database, skipping", { stripeInvoiceId: paidInvoice.id });
    break;
  }

  // [Gap 53] Preservar payment_origin 'manual' — teacher já marcou como pago
  if (currentInvoice.payment_origin === 'manual') {
    logStep("Invoice marked as manual payment, skipping webhook", { invoiceId: paidInvoice.id });
    break;
  }

  const updateData: Record<string, any> = { 
    status: 'paid',
    updated_at: new Date().toISOString()
  };
  // Preservar payment_origin existente (ex: 'prepaid', 'manual')
  if (!currentInvoice?.payment_origin) {
    updateData.payment_origin = 'automatic';
  }
  
  const { error: paidError } = await supabaseClient
    .from('invoices')
    .update(updateData)
    .eq('stripe_invoice_id', paidInvoice.id);

   if (paidError) {
    logStep("Error updating invoice status to paid", paidError);
    // [CORREÇÃO v1.5 - Gap 56] Chamar completeEventProcessing em caso de erro
    await completeEventProcessing(supabaseClient, event.id, false, paidError);
    return new Response(JSON.stringify({ error: 'Failed to update invoice to paid' }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  logStep("Invoice marked as paid", { invoiceId: paidInvoice.id });

  // NOVO: Buscar invoice completa com lines expandidas
  // [Gap 14] Não confiar no payload do webhook para lines
  // [Gap 40] `expand: ['lines']` retorna no máximo 10 items.
  // Para faturas com >10 line items (aulas em grupo grandes), usar listLineItems com paginação:
  // [CORREÇÃO v2.0 - Gap 85] Usar `event.account` (fonte confiável para Connect webhooks)
  // conforme Gap 80. A linha anterior usava `paidInvoice.account` diretamente,
  // contradizendo a correção do Gap 80.
  const stripeAccountId = (event as any).account || (paidInvoice as any).account;
  if (stripeAccountId) {
    try {
      // [CORREÇÃO v1.5 - Gap 57] Usar autoPagingToArray em vez de `for await`.
      // O `for await` pode falhar no Deno runtime com certos streams do Stripe SDK.
      // `autoPagingToArray` é mais confiável e explícito.
      const allLines = await stripe.invoices.listLineItems(
        paidInvoice.id,
        { limit: 100 },
        { stripeAccount: stripeAccountId }
      ).autoPagingToArray({ limit: 10000 });
      
      if (allLines.length > 0) {
        for (const line of allLines) {
          const lessonId = line.metadata?.lesson_id;
          const participantId = line.metadata?.participant_id;
          
          if (lessonId && participantId) {
            // [Gap 13] Atualizar APENAS o participante específico, não todos da aula
            // [CORREÇÃO v2.0 - Gap 84] Filtrar por status elegíveis para confirmação.
            // Sem `.neq('status', 'concluida')`, se o professor completou a aula antes
            // do pagamento chegar (ex: boleto pago dias depois), o status reverteria
            // de 'concluida' para 'confirmada' — perdendo o registro de conclusão.
            const { error: participantUpdateError } = await supabaseClient
              .from('class_participants')
              .update({ 
                status: 'confirmada', 
                confirmed_at: new Date().toISOString() 
              })
              .eq('id', participantId)
              .neq('status', 'cancelada')
              .neq('status', 'concluida');
            
            if (participantUpdateError) {
              logStep(`Error updating participant ${participantId} for lesson ${lessonId}`, participantUpdateError);
            } else {
              logStep(`Participant ${participantId} confirmed via invoice payment`);
            }
          } else if (lessonId && !participantId) {
            // Fallback: se não tem participant_id no metadata (compatibilidade)
            logStep(`Warning: lesson ${lessonId} has no participant_id in metadata - skipping participant update`);
          }
        }
      }
    } catch (retrieveError) {
      // [Gap 41] Em caso de erro, marcar como falha no sistema de idempotência
      logStep('Error retrieving full invoice for line processing', retrieveError);
      await completeEventProcessing(supabaseClient, event.id, false, retrieveError);
    }
  }
  break;
}
```

**Handler `invoice.voided` (linha 420-438)**: Já existe e atualiza o status da invoice no banco para `cancelada`. **Nenhuma alteração necessária** — quando a fatura é anulada (void), o status é atualizado automaticamente.

> **[CORREÇÃO v2.0 - Gap 82]**: O handler `invoice.voided` (linhas 425-435) e o handler 
> `invoice.marked_uncollectible` (linhas 401-415) usam `return new Response(..., { status: 500 })`
> quando o update falha, MAS **NÃO chamam `completeEventProcessing(false, error)`** antes de retornar.
> Diferente dos handlers cobertos pelo Gap 79 (que usam pattern `if/else` e caem no fluxo de sucesso),
> estes handlers fazem **early return** — bypassando completamente o `completeEventProcessing(true)`
> da linha 544. O evento fica permanentemente preso no estado "processing" no sistema de idempotência,
> impedindo retries automáticos do Stripe de serem processados.
>
> **FIX**: Aplicar o MESMO pattern do Gap 56/67 em AMBOS os handlers:
> ```typescript
> if (voidError) {
>   logStep("Error updating invoice status to voided", voidError);
>   await completeEventProcessing(supabaseClient, event.id, false, voidError);
>   return new Response(JSON.stringify({ error: 'Failed' }), { 
>     status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
>   });
> }
> ```

> **[CORREÇÃO v2.0 - Gap 86]**: O handler `invoice.marked_uncollectible` (linhas 396-418)
> NÃO verifica `payment_origin === 'manual'` antes de atualizar o status para `overdue`.
> Os handlers `invoice.paid` e `invoice.payment_succeeded` já possuem essa verificação (linhas
> 306-315, 343-352), mas `marked_uncollectible` não. Se o professor marcou manualmente o 
> pagamento como recebido (`payment_origin: 'manual'`) e o Stripe marca a invoice como 
> incobrável (porque o Stripe Payment Intent falhou/expirou), o webhook sobrescreveria o 
> status `paid` com `overdue`, contradizendo a decisão do professor.
>
> **FIX**: Adicionar a MESMA verificação de `payment_origin === 'manual'` no handler, 
> antes do update:
> ```typescript
> const { data: existingUncollectible } = await supabaseClient
>   .from('invoices')
>   .select('payment_origin')
>   .eq('stripe_invoice_id', uncollectibleInvoice.id)
>   .maybeSingle();
> 
> if (existingUncollectible?.payment_origin === 'manual') {
>   logStep("Invoice marked as manual payment, skipping uncollectible webhook", { invoiceId: uncollectibleInvoice.id });
>   break;
> }
> ```

**Handler `invoice.payment_succeeded` (linha 337-369)**: [CORREÇÃO v1.4 - Gap 43] Deve conter a MESMA lógica completa do handler `invoice.paid` acima. Aplicar:
- [Gap 53] Preservar `payment_origin` existente (não sobrescrever 'prepaid' com 'automatic')
- [Gap 57] Usar `autoPagingToArray` em vez de `for await` para compatibilidade Deno
- [Gap 56] Chamar `completeEventProcessing(false, error)` em TODOS os caminhos de erro
- [Gap 40] Usar `stripe.invoices.listLineItems` com auto-paginação (não `expand: ['lines']`)
- [Gap 14] Não confiar no payload do webhook para lines
- [Gap 13] Filtrar por `participant_id` do metadata, não por `class_id`

> **[CORREÇÃO v1.7 - Gap 67]**: O handler `invoice.payment_succeeded` (linhas 354-362) 
> atual NÃO chama `completeEventProcessing(false, error)` quando o update falha — apenas 
> faz `logStep` e cai no `break`. O erro cai no fluxo normal e o evento é marcado como 
> `success: true` na linha 544, quando deveria ser `false`. Isso corrompe o sistema de 
> idempotência: o evento NÃO será re-processado em retries.
> 
> **FIX**: Substituir o pattern `if (error) { log } else { log }` por:
> ```typescript
> if (succeededError) {
>   logStep("Error updating invoice payment succeeded", succeededError);
>   await completeEventProcessing(supabaseClient, event.id, false, succeededError);
>   return new Response(JSON.stringify({ error: 'Failed' }), { 
>     status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
>   });
> }
> ```
> Aplicar o MESMO pattern em TODOS os handlers que atualmente usam `if/else` sem return.

> **[CORREÇÃO v2.2 - Gap 98]**: O handler `invoice.payment_failed` (linhas 380-393) tem o 
> MESMO problema do Gap 67. O update `status: 'falha_pagamento'` pode falhar, mas o handler
> apenas faz `logStep("Error...")` e cai no `break` → `completeEventProcessing(true)`.
> O evento falho é marcado como sucesso, impedindo retries.
>
> **FIX explícito** (faltava no Gap 79 que apenas mencionava no checklist):
> ```typescript
> case 'invoice.payment_failed': {
>   const failedInvoice = eventObject as Stripe.Invoice;
>   logStep("Invoice payment failed", { 
>     invoiceId: failedInvoice.id, 
>     reason: failedInvoice.last_payment_error?.message 
>   });
>
>   const { error: failedError } = await supabaseClient
>     .from('invoices')
>     .update({ 
>       status: 'falha_pagamento',
>       updated_at: new Date().toISOString()
>     })
>     .eq('stripe_invoice_id', failedInvoice.id);
>
>   if (failedError) {
>     logStep("Error updating invoice payment failed", failedError);
>     await completeEventProcessing(supabaseClient, event.id, false, failedError);
>     return new Response(JSON.stringify({ error: 'Failed to update invoice' }), { 
>       status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
>     });
>   }
>   logStep("Invoice marked as payment failed", { invoiceId: failedInvoice.id });
>   break;
> }
> ```

> **[CORREÇÃO v2.2 - Gap 99]**: O handler `payment_intent.payment_failed` (linhas 504-537) 
> tem o MESMO problema. Usa `if (error) { log } else if { log } else { log }` sem `return`.
> Se o update falha, o evento é marcado como `success: true` via `completeEventProcessing` 
> da linha 544.
>
> **FIX explícito**:
> ```typescript
> case "payment_intent.payment_failed": {
>   const paymentIntent = eventObject as Stripe.PaymentIntent;
>   logStep("Payment intent failed", { 
>     paymentIntentId: paymentIntent.id,
>     last_payment_error: paymentIntent.last_payment_error,
>   });
>
>   const { data: updatedInvoices, error } = await supabaseClient
>     .from("invoices")
>     .update({
>       status: "falha_pagamento",
>       updated_at: new Date().toISOString()
>     })
>     .eq("stripe_payment_intent_id", paymentIntent.id)
>     .select();
>
>   if (error) {
>     logStep("Error updating invoice payment intent failed", error);
>     await completeEventProcessing(supabaseClient, event.id, false, error);
>     return new Response(JSON.stringify({ error: 'Failed' }), { 
>       status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
>     });
>   }
>   if (updatedInvoices && updatedInvoices.length > 0) {
>     logStep("Invoice marked as failed from payment intent", { invoiceId: updatedInvoices[0].id });
>   } else {
>     logStep("No invoice found for failed payment intent", { paymentIntentId: paymentIntent.id });
>   }
>   break;
> }
> ```

### 5.4 Ajustes no process-cancellation

**Arquivo**: `supabase/functions/process-cancellation/index.ts`

> **CORREÇÃO v1.2 (Gap 3)**: Adicionar import do Stripe SDK no topo do arquivo:
> ```typescript
> // [CORREÇÃO v1.6 - Gap 58] Padronizar versão do Stripe SDK em TODAS as edge functions
> import Stripe from "https://esm.sh/stripe@14.24.0";
> ```
> O arquivo atual (linhas 1-2) só importa `serve` e `createClient`. O import do Stripe 
> é necessário para a lógica de `stripe.invoices.voidInvoice` abaixo.
> **NOTA**: Todas as edge functions que usam Stripe DEVEM usar a mesma versão do SDK
> (`stripe@14.24.0`) para evitar incompatibilidades de tipos e comportamento.
> O arquivo atual (linhas 1-2) só importa `serve` e `createClient`. O import do Stripe 
> é necessário para a lógica de `stripe.invoices.voidInvoice` abaixo.

> **CORREÇÃO v1.2 (Gap 7)**: A verificação de fatura pré-paga foi **movida do frontend** 
> (`CancellationModal.tsx`) para cá. O backend faz a verificação completa usando 
> `SUPABASE_SERVICE_ROLE_KEY`, evitando problemas de RLS.

Adicionar lógica de void/delete de fatura pré-paga. Inserir ANTES da seção de criação de fatura de cancelamento (linha ~374):

> **CORREÇÃO v1.3 (Gap 12)**: A query abaixo foi reescrita para usar queries 
> sequenciais independentes em vez de FK join (`invoices!inner`). Joins com FK 
> falham no Deno runtime por cache de schema (padrão documentado do projeto).

> **[CORREÇÃO v1.7 - Gap 65]**: Para cancelamento de PARTICIPANTE em aula de grupo, 
> a query DEVE filtrar também por `student_id` para evitar anular faturas de outros alunos.
> Se `cancelled_by_type === 'student'` ou `dependent_id` está presente, adicionar filtro:
> `.eq('participant_id', participantId)` na busca de `invoice_classes`.

> **[CORREÇÃO v1.8 - Gap 70]**: A busca de `participant_id` em `class_participants` (Gap 65)
> DEVE filtrar por `dependent_id` quando presente, não apenas por `student_id`. Sem isso,
> se um responsável tem 2+ dependentes na mesma aula em grupo, `.maybeSingle()` retorna null
> (PGRST116: multiple rows), e o filtro de `invoice_classes` é pulado — voidando TODAS as 
> faturas pré-pagas da aula em vez de apenas a do dependente cancelado.

```typescript
// NOVO: Verificar se a aula tem fatura pré-paga vinculada
// [Gap 12] Usar queries sequenciais em vez de FK join
// [Gap 65] Para cancelamento individual, filtrar por participante específico
// [Gap 70] Para dependentes, DEVE filtrar por dependent_id para evitar ambiguidade
let invoiceClassQuery = supabaseClient
  .from('invoice_classes')
  .select('id, stripe_invoice_item_id, invoice_id, participant_id')
  .eq('class_id', class_id);

// Se é cancelamento de participante individual (não da aula inteira),
// filtrar apenas os invoice_classes desse participante
if (dependent_id || cancelled_by_type === 'student') {
  // Buscar participant_id para este student/dependent
  let participantQuery = supabaseClient
    .from('class_participants')
    .select('id')
    .eq('class_id', class_id)
    .eq('student_id', cancelled_by);
  
  // [Gap 70] OBRIGATÓRIO: filtrar por dependent_id quando presente
  if (dependent_id) {
    participantQuery = participantQuery.eq('dependent_id', dependent_id);
  } else {
    participantQuery = participantQuery.is('dependent_id', null);
  }
  
  const { data: participantRecord } = await participantQuery.maybeSingle();
  
  if (participantRecord) {
    invoiceClassQuery = invoiceClassQuery.eq('participant_id', participantRecord.id);
  }
}

const { data: invoiceClassesForClass } = await invoiceClassQuery;

let prepaidInvoices: any[] = [];
if (invoiceClassesForClass && invoiceClassesForClass.length > 0) {
  const invoiceIds = [...new Set(invoiceClassesForClass.map(ic => ic.invoice_id))];
  // [CORREÇÃO v1.5 - Gap 54] Buscar TODAS as faturas pré-pagas vinculadas à aula,
  // não apenas a primeira. Em aulas em grupo, pode haver múltiplas faturas 
  // (uma por aluno). Usar `.limit(1).maybeSingle()` perderia as demais.
  const { data: invoicesData } = await supabaseClient
    .from('invoices')
    .select('id, status, stripe_invoice_id, invoice_type, business_profile_id')
    .in('id', invoiceIds)
    .eq('invoice_type', 'prepaid_class');
  
  prepaidInvoices = invoicesData || [];
}

// Iterar sobre TODAS as faturas pré-pagas (pode haver múltiplas em aulas em grupo)
for (const prepaidInvoice of prepaidInvoices) {
  // Só pode anular faturas não-pagas
  if (['pendente', 'open'].includes(prepaidInvoice.status) && prepaidInvoice.stripe_invoice_id) {
    console.log('📋 Voiding prepaid invoice:', prepaidInvoice.stripe_invoice_id);
    
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
      
      // [CORREÇÃO v2.2 - Gap 95] Buscar stripe_connect_id da fatura sendo anulada,
      // NÃO do perfil genérico do professor. Se professor tem múltiplos business_profiles,
      // a busca por `user_id = teacher_id` pode retornar o perfil ERRADO (ex: PF em vez de PJ),
      // e o void seria executado na conta Stripe errada → fatura NÃO é anulada.
      // A fonte correta é: `invoices.business_profile_id` → `business_profiles.stripe_connect_id`
      const { data: businessProfile } = await supabaseClient
        .from('business_profiles')
        .select('stripe_connect_id')
        .eq('id', prepaidInvoice.business_profile_id || '')
        .maybeSingle();
      
      // Fallback: se invoice não tem business_profile_id, buscar pelo teacher_id
      const effectiveProfile = businessProfile || (await (async () => {
        const { data: fallbackProfile } = await supabaseClient
          .from('business_profiles')
          .select('stripe_connect_id')
          .eq('user_id', classData.teacher_id)
          .limit(1)
          .maybeSingle();
        return fallbackProfile;
      })());
      
      if (effectiveProfile?.stripe_connect_id) {
        await stripe.invoices.voidInvoice(
          prepaidInvoice.stripe_invoice_id,
          { stripeAccount: effectiveProfile.stripe_connect_id }
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
    "saveError": "Erro ao atualizar configuração de cobrança.",
    "prepaidInvoiceCreated": "Fatura pré-paga criada com sucesso.",
    "stripeNotReady": "Conta Stripe não está pronta. Aula criada sem cobrança."
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
    "saveError": "Error updating charge timing.",
    "prepaidInvoiceCreated": "Prepaid invoice created successfully.",
    "stripeNotReady": "Stripe account not ready. Class created without billing."
  }
}
```

### 6.3 Tipos de fatura (financial.json)

**Arquivo**: `src/i18n/locales/pt/financial.json` - Adicionar em `invoiceTypes`:

```json
{
  "invoiceTypes": {
    "prepaidClass": "Pré-paga",
    "cancellation": "Cancelamento",
    "orphanCharges": "Cobranças pendentes"
  },
  "prepaidIndicator": {
    "tooltip": "Aula com fatura pré-paga emitida",
    "badge": "Fatura emitida",
    "editBlocked": "Esta aula já possui fatura emitida. Alterações de serviço e participantes estão bloqueadas.",
    "addParticipantBlocked": "Não é possível adicionar participantes a uma aula com fatura pré-paga."
  }
}
```

**Arquivo**: `src/i18n/locales/en/financial.json` - Adicionar em `invoiceTypes`:

```json
{
  "invoiceTypes": {
    "prepaidClass": "Prepaid",
    "cancellation": "Cancellation",
    "orphanCharges": "Pending charges"
  },
  "prepaidIndicator": {
    "tooltip": "Class with prepaid invoice issued",
    "badge": "Invoice issued",
    "editBlocked": "This class already has an issued invoice. Service and participant changes are blocked.",
    "addParticipantBlocked": "Cannot add participants to a class with a prepaid invoice."
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

1. [CORREÇÃO v1.8 - Gap 75] Buscar a invoice no banco pelo `stripe_invoice_id` usando `.maybeSingle()` 
   (NÃO `.single()`). O webhook pode receber eventos de invoices que não existem na nossa base 
   (ex: invoices criadas diretamente no Stripe Dashboard, ou de outras integrações). `.single()` 
   com 0 linhas lança erro e retorna 500, causando retries infinitos do Stripe.
2. Se invoice não encontrada: logar warning e retornar 200 (evento reconhecido, sem ação)
3. Atualizar status para `pago` / `paid`
4. **NOVO**: Iterar sobre `invoice.lines.data`
5. Para cada linha com `metadata.lesson_id`:
   - Atualizar `class_participants.status` para `confirmada`
   - Atualizar `class_participants.confirmed_at`
6. [CORREÇÃO v2.2 - Gap 94] `payment_method`: Extrair o método de pagamento REAL via charge associado.
   **NÃO** usar `payment_settings.payment_method_types[0]` — isso retorna a lista de métodos 
   **permitidos** na invoice, NÃO o método efetivamente usado pelo aluno. A fonte correta é 
   o charge vinculado ao pagamento:
   ```typescript
   let paymentMethod = 'stripe_invoice'; // fallback
   const chargeId = typeof succeededInvoice.charge === 'string' 
     ? succeededInvoice.charge 
     : succeededInvoice.charge?.id;
   if (chargeId && stripeAccountId) {
     try {
       const charge = await stripe.charges.retrieve(chargeId, { stripeAccount: stripeAccountId });
       paymentMethod = charge.payment_method_details?.type || 'stripe_invoice';
     } catch (chargeError) {
       logStep("Could not retrieve charge for payment method", { chargeId, error: chargeError });
     }
   }
   ```
   Se `charge` é null (ex: invoice $0, credit balance), usar `'stripe_invoice'` como fallback.
7. Campos temporários (boleto_url, pix_qr_code) são gerenciados pelo Stripe Invoice; não precisam ser limpos manualmente aqui.

### 8.2 invoice.finalized (NOVO)

> **[CORREÇÃO v2.1 - Gap 90]**: Quando `process-class-billing` chama `finalizeInvoice` (passo v),
> o Stripe envia o evento `invoice.finalized`. Se o `switch` do webhook-stripe-connect NÃO tem
> case para `invoice.finalized`, o evento cai no `default` case. Se o default apenas faz `break`
> e cai no `completeEventProcessing(true)`, está OK. MAS se o default retorna erro ou NÃO chama
> `completeEventProcessing`, o evento fica preso (per Gaps 82/83).
>
> **FIX**: Adicionar case explícito para `invoice.finalized`:
> ```typescript
> case 'invoice.finalized':
>   logStep("Invoice finalized (no action needed)", { invoiceId: eventObject.id });
>   break;
> ```
> Isso garante que o evento é reconhecido e marcado como processado com sucesso,
> sem nenhuma ação no banco de dados (a finalização é apenas um trigger interno do Stripe).

### 8.3 invoice.voided

Handler já existe (linha 420-438). Quando o Stripe notifica void:
- Atualizar status da invoice no banco para `cancelada`
- **Nenhuma ação adicional necessária** sobre aulas — o void é resultado do cancelamento que já tratou a aula.

### 8.4 payment_intent.succeeded (existente)

> **[CORREÇÃO v1.6 - Gap 59]**: O handler existente de `payment_intent.succeeded` TAMBÉM 
> sobrescreve `payment_origin` incondicionalmente. Aplicar a mesma correção do Gap 53:
> verificar o valor atual de `payment_origin` e só definir `'automatic'` se for null.

> **[CORREÇÃO v1.7 - Gap 68]**: O handler `payment_intent.succeeded` (linhas 464-501) 
> também faz `stripe_hosted_invoice_url: null` (linha 481). Para faturas pré-pagas que 
> usam Stripe Invoice, o `hosted_invoice_url` é a URL do "Pagar Agora". Embora faturas 
> pré-pagas normalmente disparem `invoice.paid` (não `payment_intent.succeeded`), proteger 
> contra edge cases:
> ```typescript
> // [Gap 68] Só limpar campos temporários se a fatura NÃO é do tipo Stripe Invoice
> // (faturas pré-pagas usam Invoice flow e precisam preservar hosted_invoice_url)
> const invoiceToUpdate = existingPI; // já buscado acima
> const clearFields: Record<string, any> = {
>   pix_qr_code: null, pix_copy_paste: null, pix_expires_at: null,
>   boleto_url: null, linha_digitavel: null, boleto_expires_at: null, barcode: null,
> };
> // Só limpar stripe_hosted_invoice_url se não é fatura de Stripe Invoice
> if (!invoiceToUpdate?.stripe_invoice_id) {
>   clearFields.stripe_hosted_invoice_url = null;
> }
> ```

> **[CORREÇÃO v2.0 - Gap 83]**: O `catch` externo do webhook (linhas 551-558) NÃO chama
> `completeEventProcessing(false, error)`. Se um erro não capturado ocorre dentro de um 
> handler APÓS `processEventIdempotency` marcar o evento como "processing" (linha 161),
> o evento fica permanentemente preso nesse estado — impedindo retries do Stripe de serem
> processados (idempotência rejeita o evento por estar "processing").
>
> **FIX**: No catch externo, verificar se `event` e `supabaseClient` estão definidos
> e chamar `completeEventProcessing`:
> ```typescript
> } catch (error) {
>   const errorMessage = error instanceof Error ? error.message : String(error);
>   logStep("ERROR in webhook-stripe-connect", { message: errorMessage });
>   
>   // [Gap 83] Completar processamento do evento em caso de erro não capturado
>   // para evitar que o evento fique preso em "processing"
>   if (typeof event !== 'undefined' && typeof supabaseClient !== 'undefined') {
>     try {
>       await completeEventProcessing(supabaseClient, event.id, false, error instanceof Error ? error : new Error(errorMessage));
>     } catch (completeError) {
>       logStep("Failed to complete event processing in outer catch", { error: (completeError as Error).message });
>     }
>   }
>   
>   return new Response(JSON.stringify({ error: errorMessage }), {
>     status: 500,
>     headers: { ...corsHeaders, "Content-Type": "application/json" }
>   });
> }
> ```

---

## 9. Compatibilidade com Sistema Existente

| Componente | Impacto | Ação |
|-----------|---------|------|
| `automated-billing` (tradicional) | Baixo | Aulas pré-pagas já terão `invoice_classes`, serão filtradas pela RPC |
| `automated-billing` (mensalidades) | **Médio** | [Gap 76] Alunos COM mensalidade ativa NÃO devem ser cobrados pré-pago. `process-class-billing` deve verificar `student_monthly_subscriptions.is_active` antes de criar invoice. Sem isso, aula é cobrada pré-pago E não entra na franquia da mensalidade (double-billing). |
| `create-invoice` (manual) | Nenhum | Continua funcionando independentemente |
| `create-payment-intent-connect` | Nenhum | Continua para pagamentos de faturas existentes |
| `Financeiro.tsx` (lista faturas) | **Médio** | [Gap 1/11] Substituir `getInvoiceTypeBadge` inline por `InvoiceTypeBadge` importado; novas faturas `prepaid_class` aparecem na lista |
| `Faturas.tsx` (aluno) | **Médio** | [Gap 78] `Faturas.tsx` NÃO usa `PaymentOptionsCard` (verificação de código confirma 0 referências). O fluxo existente `handlePayNow → openExternalUrl(hosted_invoice_url)` já funciona para faturas pré-pagas. A correção real é: ocultar o botão `change-payment-method` (RefreshCw icon) para `invoice_type === 'prepaid_class'`, pois troca de método via `change-payment-method` edge function não se aplica ao Invoice flow do Stripe. |
| `InvoiceTypeBadge.tsx` | **Médio** | Adicionar tipo `prepaid_class` e `cancellation` ao mapeamento |
| `PaymentOptionsCard` | **Nenhum** | [Gap 78] CORREÇÃO: `Faturas.tsx` NÃO importa nem usa `PaymentOptionsCard`. O componente aparece apenas em `Financeiro.tsx` (visão do professor), onde já é contextual para faturas com Payment Intent. Nenhuma alteração necessária no `PaymentOptionsCard`. |
| `CancellationModal.tsx` | **Nenhum** | [Gap 7] Verificação movida para `process-cancellation` (backend). Frontend sem alteração. |
| `StudentImportDialog` | Nenhum | Import de alunos não interage com billing |
| Aulas antigas (sem `charge_timing`) | Nenhum | Continuam no fluxo pós-pago (automated-billing) |
| Professores sem business_profile | Nenhum | Sem Stripe, cobrança não se aplica |
| `materialize-virtual-class` (edge) | Nenhum | Materialização server-side não dispara billing |

---

## 10. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Duplicidade de cobrança (pré-pago + automated-billing) | Média | Alto | RPC `get_unbilled_participants_v2` filtra participantes já faturados via `invoice_classes` |
| **[Gap 76] Aluno com mensalidade cobrado pré-pago** | **Alta** | **Alto** | **`process-class-billing` DEVE verificar `student_monthly_subscriptions.is_active` antes de criar invoice. Sem isso, aluno perde franquia do plano e é cobrado 2x.** |
| Falha na criação do Invoice no Stripe | Baixa | Médio | Não impede criação da aula; professor pode cobrar manualmente depois |
| Aluno sem customer_id no Stripe Connected | Média | Médio | Criar customer automaticamente na primeira cobrança pré-paga |
| Professor muda de prepaid para postpaid com faturas pendentes | Baixa | Baixo | Faturas existentes não são afetadas; apenas novas aulas seguem nova config |
| Cancelamento de aula com fatura já paga | Baixa | Alto | Não permitir void; log warning; reembolso é manual |
| Recorrência com prepaid cobrando todas de uma vez | Média | Alto | Cobrança ocorre na materialização, não na criação do template |
| Customer Stripe duplicado para mesmo aluno | Baixa | Médio | Buscar customer existente por email no Connected Account antes de criar |
| Materialização pelo aluno não dispara billing | Baixa | Baixo | Design intencional: billing é responsabilidade do professor |
| Professor com múltiplos business_profiles | Baixa | Médio | [Gap 89] ATUALIZADO: Usar `teacher_student_relationships.business_profile_id` como fonte para AMBOS `charge_timing` e `stripe_connect_id`. Fallback para primeiro business_profile do professor se relationship não tem profile. |
| Invoice do Stripe sem metadata.lesson_id | Baixa | Médio | Validar que `lesson_id` está em metadata de cada InvoiceItem; logar se ausente |
| **[Gap 77] Class IDs de outro professor processados** | **Baixa** | **Alto** | **Validar `classes.teacher_id === authenticated_teacher_id` para cada class_id antes de processar billing** |
| **[Gap 81] Falha de pagamento em fatura pré-paga sem tratamento** | **Baixa** | **Médio** | **Documentado como edge case: aula permanece `confirmada`, fatura fica `falha_pagamento`. Professor decide ação (cancelar aula ou cobrar manualmente).** |
| **[Gap 82] Eventos Stripe presos em "processing" por early return** | **Média** | **Alto** | **Handlers `invoice.paid` e `invoice.marked_uncollectible` retornam 500 sem `completeEventProcessing(false)`. Evento fica permanentemente preso. FIX: chamar `completeEventProcessing` antes de `return`.** |
| **[Gap 83] Outer catch do webhook não completa evento** | **Baixa** | **Alto** | **Erros não capturados dentro dos handlers propagam para o catch externo, que não chama `completeEventProcessing`. Evento fica preso. FIX: chamar `completeEventProcessing` no catch externo.** |
| **[Gap 84] Webhook downgrades status `concluida` para `confirmada`** | **Baixa** | **Médio** | **Se professor completa aula antes do pagamento chegar (ex: boleto), webhook reverte status. FIX: filtrar `.neq('status', 'concluida')`.** |
| **[Gap 86] `invoice.marked_uncollectible` sobrescreve pagamento manual** | **Baixa** | **Alto** | **Handler não verifica `payment_origin === 'manual'`. Pode reverter decisão do professor. FIX: adicionar check como nos outros handlers.** |
| **[Gap 88] `payment_account_used_id` ausente em faturas pré-pagas** | **Baixa** | **Médio** | **`process-class-billing` não setava `payment_account_used_id` na invoice. Relatórios financeiros que agrupam por conta de pagamento ignorariam faturas pré-pagas. FIX: buscar `payment_accounts.id` no passo 2.5 e salvar no passo 3c.vi.** |
| **[Gap 89] Source inconsistente de `business_profile`** | **Média** | **Alto** | **Step 2 buscava qualquer profile do teacher (`LIMIT 1`); step 3c.i usava profile da relationship. Se teacher tem múltiplos profiles com `charge_timing` diferente, poderia usar prepaid de um e stripe_connect_id de outro. FIX: usar consistentemente o profile da relationship.** |
| **[Gap 90] Evento `invoice.finalized` não tratado no webhook** | **Baixa** | **Médio** | **`finalizeInvoice` dispara evento. Se webhook default case não processa corretamente, evento fica preso. FIX: case explícito com `break` e sem ação.** |
| **[Gap 92] Race condition no check de idempotência de `process-class-billing`** | **Baixa** | **Alto** | **TOCTOU entre check de `invoice_classes` e criação no Stripe. Double-click rápido cria duplicatas. FIX: Stripe Idempotency Keys em todas as chamadas `invoiceItems.create` e `invoices.create`.** |
| **[Gap 93] `relationship.business_profile_id` nullable sem fallback** | **Baixa** | **Médio** | **Se relationship não tem `business_profile_id`, invoice é criada com `null`. FIX: fallback para `business_profile.id` do step 2.** |
| **[Gap 94] `payment_method` extraído de fonte errada no webhook** | **Média** | **Médio** | **Gap 72 sugeria `payment_settings.payment_method_types[0]` que retorna métodos PERMITIDOS, não o usado. FIX: usar charge associado (`stripe.charges.retrieve(chargeId).payment_method_details.type`). Fallback para `'stripe_invoice'`.** |
| **[Gap 95] `process-cancellation` void usa business_profile genérico** | **Baixa** | **Alto** | **Void busca `business_profile` por `user_id = teacher_id` → pode pegar o perfil ERRADO se professor tem múltiplos. FIX: usar `invoices.business_profile_id` da fatura sendo anulada → `business_profiles.stripe_connect_id`.** |
| **[Gap 96] `process-class-billing` sem `verify_jwt = false` em config.toml** | **Alta** | **Alto** | **Sem essa config, Supabase rejeita requisição com 401 antes da função executar. FIX: adicionar `[functions.process-class-billing] verify_jwt = false` em config.toml.** |
| **[Gap 97] Resposta de `process-class-billing` não segue padrão do projeto** | **Baixa** | **Médio** | **Padrão: HTTP 200 + `success: false` para erros de business logic. Interface retornava `charge_timing` string sem `success` boolean. FIX: adicionar `success: boolean` e `error?: string` na interface; usar HTTP 200 para todos os retornos.** |
| **[Gap 98] `invoice.payment_failed` handler sem código explícito de fix** | **Média** | **Alto** | **Gap 79 mencionava no checklist mas não fornecia código. Handler (linhas 380-393) faz `if (error) { log }` sem return → evento falho marcado como success. FIX: código explícito com `completeEventProcessing(false, error)` + return 500.** |
| **[Gap 99] `payment_intent.payment_failed` handler sem código explícito de fix** | **Média** | **Alto** | **Mesmo problema do Gap 98 para handler de payment_intent (linhas 514-535). FIX: código explícito fornecido na seção 5.3.** |

---

## 11. Sequência de Implementação

```text
FASE 1: Migração de Banco de Dados
│  - charge_timing em business_profiles
│  - stripe_invoice_item_id em invoice_classes
│  - Regenerar tipos TypeScript
│
▼
FASE 2: Frontend - BillingSettings + i18n + Financeiro refactor
│  - Card "Momento da Cobrança"
│  - Estado, load, save
│  - Traduções i18n (PT/EN) para billing.json e financial.json
│  - Atualizar InvoiceTypeBadge com novos tipos
│  - [Gap 1/11] Refatorar Financeiro.tsx: substituir getInvoiceTypeBadge inline por InvoiceTypeBadge
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
│  - [Gap 8] Indicador visual (ícone Receipt) para aulas com fatura emitida
│  - [Gap 19] Bloqueio de edição de serviço/participantes em aulas faturadas (seção 7.3)
│
▼
FASE 5: Cancelamento - process-cancellation (backend only)
│  - [Gap 7] Verificação de fatura pré-paga movida para backend
│  - [Gap 3] Adicionar import Stripe no process-cancellation
│  - Lógica de void/delete condicional no Stripe
│  - Proteção contra void de faturas já pagas
│  - CancellationModal.tsx: SEM alteração
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
| `src/pages/Financeiro.tsx` | **Modificar** | 2 | [Gap 1/11] Substituir `getInvoiceTypeBadge` inline (linhas 30-45, usos 581/716) pelo componente `InvoiceTypeBadge` importado |
| `supabase/functions/process-class-billing/index.ts` | **Criar** | 3 | Router de cobrança central |
| `src/pages/Agenda.tsx` | **Modificar** | 4 | Chamar process-class-billing em handleClassSubmit e materializeVirtualClass; [Gap 8] Indicador visual de fatura emitida no calendário |
| `src/components/CancellationModal.tsx` | **Sem alteração** | 5 | [Gap 7] Verificação movida para backend |
| `supabase/functions/process-cancellation/index.ts` | **Modificar** | 5 | [Gap 3] Adicionar import Stripe; [Gap 7] Verificação de fatura pré-paga no backend; void de fatura no Stripe |
| `supabase/functions/webhook-stripe-connect/index.ts` | **Modificar** | 6 | Processar lesson_id em invoice.paid e invoice.payment_succeeded; [Gap 72] extrair payment_method real; [Gap 75] usar .maybeSingle() |
| `supabase/functions/automated-billing/index.ts` | **Redeployer** | 7 | [Gap 73] Confirmar que RPC filtra aulas pré-pagas; REDEPLOYER para refresh do schema cache após migração |
| `supabase/functions/create-payment-intent-connect/index.ts` | **Modificar** | 7 | [Gap 74] Atualizar Stripe SDK de v14.21.0 para v14.24.0 |
| `src/pages/Faturas.tsx` | **Modificar** | 4 | [Gap 71] Ocultar PaymentOptionsCard para `invoice_type === 'prepaid_class'`; exibir apenas link Stripe hosted |

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
- [ ] [v1.3] Verificar que webhook busca invoice completa via `retrieve` (não confia no payload)
- [ ] [v1.3] Verificar que webhook atualiza participante específico (não todos da aula)
- [ ] Verificar `InvoiceTypeBadge` exibe `prepaid_class`, `cancellation` e `orphan_charges`
- [ ] Verificar que materialização server-side (aluno) NÃO gera cobrança
- [ ] [v1.3] Verificar `Financeiro.tsx` usa `InvoiceTypeBadge` importado (sem função inline)
- [ ] [v1.3] Verificar `stripe_hosted_invoice_url` habilita botão "Pagar Agora" em Faturas.tsx
- [ ] [v1.3] Verificar indicador visual (ícone Receipt) na Agenda para aulas faturadas
- [ ] [v1.4] Verificar que `process-class-billing` invoca `send-invoice-notification` após criar fatura
- [ ] [v1.4] Verificar que `stripe_customer_id` é persistido em `teacher_student_relationships`
- [ ] [v1.4] Verificar que webhook usa `listLineItems` com auto-paginação (não `expand: ['lines']`)
- [ ] [v1.4] Verificar que erros no webhook chamam `completeEventProcessing(false, error)`
- [ ] [v1.4] Verificar `payment_origin: 'prepaid'` salvo na tabela `invoices`
- [ ] [v1.4] Verificar rollback de Invoice Items em caso de falha na criação da Invoice
- [ ] [v1.4] Verificar idempotência: double-click no agendamento não gera cobrança duplicada
- [ ] [v1.4] Verificar que `apiVersion: "2023-10-16"` é padronizado em todas novas funções Stripe
- [ ] [v1.5] Verificar que `send-invoice-notification` recebe `notification_type: 'invoice_created'` (não apenas `invoice_id`)
- [ ] [v1.5] Verificar que indicador visual na Agenda usa query em `invoice_classes` (view não tem `has_prepaid_invoice`)
- [ ] [v1.6] Verificar que versão do Stripe SDK é `stripe@14.24.0` em TODAS as edge functions (alinhado com webhook existente)
- [ ] [v1.5] Verificar que `invoice.paid` webhook NÃO sobrescreve `payment_origin: 'prepaid'` com `'automatic'`
- [ ] [v1.5] Verificar que `process-cancellation` itera TODAS as faturas pré-pagas (não `.limit(1)`)
- [ ] [v1.5] Verificar que `Agenda.tsx` exibe toast de feedback após `process-class-billing`
- [ ] [v1.5] Verificar que `invoice.paid` e `invoice.payment_succeeded` chamam `completeEventProcessing(false, error)` em TODOS os caminhos de erro
- [ ] [v1.5] Verificar que webhook usa `.autoPagingToArray()` em vez de `for await` para listLineItems
- [ ] [v1.6] Verificar que CORS headers incluem `x-supabase-client-platform` e demais headers do cliente Supabase
- [ ] [v1.6] Verificar que `process-class-billing` autentica via JWT (`auth.getUser(token)`) e ignora `teacher_id` do body
- [ ] [v1.6] Verificar que `process-class-billing` consulta `stripe_customer_id` em `teacher_student_relationships` ANTES de chamar API Stripe
- [ ] [v1.6] Verificar que `payment_intent.succeeded` handler NÃO sobrescreve `payment_origin: 'prepaid'` com `'automatic'`
- [ ] [v1.6] Verificar que `get_unbilled_participants_v2` filtra por `participant_id` (billing parcial em grupo funciona)
- [ ] [v1.7] Verificar que migração SQL define `charge_timing = 'postpaid'` para professores EXISTENTES (preservar comportamento atual)
- [ ] [v1.7] Verificar que cancelamento de participante individual em grupo filtra `invoice_classes` por `participant_id` (não anula fatura de outros)
- [ ] [v1.7] Verificar que `invoice.payment_succeeded` handler chama `completeEventProcessing(false, error)` e faz `return` (não cai no fluxo de sucesso)
- [ ] [v1.7] Verificar que `payment_intent.succeeded` NÃO limpa `stripe_hosted_invoice_url` para faturas com `stripe_invoice_id`
- [ ] [v1.7] Verificar que `create-payment-intent-connect` usa mesma versão do Stripe SDK (`14.24.0`)
- [ ] [v1.7] Verificar que `get_unbilled_participants_v2` RPC filtra corretamente aulas pré-pagas (via `LEFT JOIN invoice_classes ... WHERE ic.id IS NULL`)

- [ ] [v1.8] Verificar que `process-cancellation` filtra `class_participants` por `dependent_id` quando presente (Gap 70)
- [ ] [v1.8] ~~Verificar que `Faturas.tsx` oculta `PaymentOptionsCard` para `invoice_type === 'prepaid_class'`~~ [Gap 78] CORRIGIDO: `Faturas.tsx` não usa `PaymentOptionsCard`. Verificar que botão `change-payment-method` (RefreshCw) é ocultado para `invoice_type === 'prepaid_class'`
- [ ] [v1.8] Verificar que `invoice.payment_succeeded` extrai `payment_method` real do Stripe (não hardcoda `'stripe_invoice'`) (Gap 72)
- [ ] [v1.8] Verificar que `automated-billing` foi redeployado após migração de schema (Gap 73)
- [ ] [v1.8] Verificar que `create-payment-intent-connect` usa `stripe@14.24.0` (Gap 74)
- [ ] [v1.8] Verificar que handlers `invoice.paid`/`invoice.payment_succeeded` usam `.maybeSingle()` (não `.single()`) (Gap 75)

- [ ] [v1.9] Verificar que `process-class-billing` consulta `student_monthly_subscriptions.is_active` e PULA participantes com mensalidade ativa (Gap 76)
- [ ] [v1.9] Verificar que `process-class-billing` valida `classes.teacher_id === authenticated_teacher_id` para cada class_id (Gap 77)
- [ ] [v1.9] Verificar que `Faturas.tsx` oculta botão `change-payment-method` (RefreshCw) para faturas `prepaid_class` (Gap 78)
- [ ] [v1.9] Verificar que TODOS os handlers de webhook (`invoice.voided`, `invoice.payment_failed`, `payment_intent.payment_failed`) chamam `completeEventProcessing(false, error)` em caminhos de erro (Gap 79)
- [ ] [v1.9] Verificar que `invoice.paid` handler extrai `stripeAccountId` do evento Stripe (não do objeto invoice) para `listLineItems` (Gap 80)
- [ ] [v1.9] Verificar que falha de pagamento em fatura pré-paga é tratada como edge case documentado (Gap 81)

- [ ] [v2.0] Verificar que `invoice.paid` e `invoice.marked_uncollectible` chamam `completeEventProcessing(false, error)` ANTES de retornar 500 (Gap 82)
- [ ] [v2.0] Verificar que o outer `catch` do webhook chama `completeEventProcessing(false, error)` quando `event.id` disponível (Gap 83)
- [ ] [v2.0] Verificar que `invoice.paid` handler NÃO faz downgrade de `concluida` para `confirmada` — filtrar `.neq('status', 'concluida')` (Gap 84)
- [ ] [v2.0] Verificar que `stripeAccountId` usa `event.account` (não `paidInvoice.account`) conforme Gap 80 — inconsistência interna resolvida (Gap 85)
- [ ] [v2.0] Verificar que `invoice.marked_uncollectible` verifica `payment_origin === 'manual'` antes de atualizar status (Gap 86)
- [ ] [v2.0] Verificar que `invoice.paid` handler faz UMA query consolidada (`.maybeSingle()` com null guard + manual check + payment_origin check), não queries separadas (Gap 87)

- [ ] [v2.1] Verificar que `process-class-billing` seta `payment_account_used_id` no registro `invoices` (Gap 88)
- [ ] [v2.1] Verificar que `process-class-billing` busca `charge_timing` do business_profile da RELATIONSHIP (não do primeiro profile do professor) (Gap 89)
- [ ] [v2.1] Verificar que webhook-stripe-connect tem case explícito para `invoice.finalized` (return OK sem ação) (Gap 90)
- [ ] [v2.1] Verificar que `process-class-billing` usa Stripe Idempotency Keys (`idempotencyKey`) em `invoiceItems.create` e `invoices.create` (Gap 92)
- [ ] [v2.1] Verificar que `process-class-billing` faz fallback de `relationship.business_profile_id` para `businessProfile.id` do step 2 quando nullable (Gap 93)

- [ ] [v2.2] Verificar que extração de `payment_method` em `invoice.paid`/`invoice.payment_succeeded` usa charge associado (NÃO `payment_settings.payment_method_types`) (Gap 94)
- [ ] [v2.2] Verificar que `process-cancellation` void busca `stripe_connect_id` via `invoices.business_profile_id` (NÃO `user_id = teacher_id`) (Gap 95)
- [ ] [v2.2] Verificar que `supabase/config.toml` tem `[functions.process-class-billing] verify_jwt = false` (Gap 96)
- [ ] [v2.2] Verificar que `process-class-billing` retorna HTTP 200 com `success: false` para erros de business logic (Gap 97)
- [ ] [v2.2] Verificar que `invoice.payment_failed` handler chama `completeEventProcessing(false, error)` e faz `return` com status 500 (Gap 98)
- [ ] [v2.2] Verificar que `payment_intent.payment_failed` handler chama `completeEventProcessing(false, error)` e faz `return` com status 500 (Gap 99)

### Deploy

- [ ] Executar migração SQL em produção
- [ ] Deploy de edge functions (process-class-billing, process-cancellation, webhook-stripe-connect, create-payment-intent-connect, automated-billing)
- [ ] Publicar frontend
- [ ] Testar fluxo completo em produção com valor mínimo

### Pós-Deploy

- [ ] Monitorar logs do `automated-billing` no próximo ciclo
- [ ] Verificar que aulas pré-pagas não são duplicadas no faturamento automático
- [ ] Testar fluxo completo com professor real em produção
- [ ] Verificar que professores sem business_profile não são afetados
- [ ] Verificar que a troca prepaid→postpaid não afeta faturas existentes
- [ ] [v1.3] Verificar que `process-cancellation` usa queries sequenciais (sem FK join)
- [ ] [v1.5] Verificar que cancelamento de aula em grupo anula TODAS as faturas pré-pagas dos participantes

---

## Apêndice A: Gaps Corrigidos

### Revisão v1.1

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

### Revisão v1.2

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 15 | `getInvoiceTypeBadge` duplicado em `Financeiro.tsx` (Gap 1/11) | Adicionar `Financeiro.tsx` na Fase 2; substituir função inline (linhas 30-45, usos 581/716) pelo componente `InvoiceTypeBadge` importado |
| 16 | `stripe_hosted_invoice_url` não salvo (Gap 2) | Adicionado explicitamente no passo 3c.vi de `process-class-billing`: salvar `hosted_invoice_url` e `invoice_pdf` do Stripe na tabela `invoices` |
| 17 | Import do Stripe ausente em `process-cancellation` (Gap 3) | Adicionado `import Stripe from "https://esm.sh/stripe@14.21.0"` como alteração explícita na seção 5.4 |
| 18 | `payment_due_days` sem fonte definida (Gap 4) | Adicionado passo 2.6 em `process-class-billing`: buscar de `profiles` (não `business_profiles`). Default: 7 |
| 19 | Tratamento de dependentes incompleto (Gap 5) | Detalhado passo 3c.iii: buscar nome do dependente, descrição `[NomeDependente] - Aula de...`, salvar `dependent_id` em `invoice_classes` |
| 20 | Validação de `stripe_connect_id`/`charges_enabled` ausente (Gap 6) | Adicionado passo 2.5: verificar `stripe_connect_id` não-null e `stripe_charges_enabled = true` em `payment_accounts`. Se falhar: retornar `stripe_not_ready` |
| 21 | Join `invoices!inner` falha por RLS no `CancellationModal` (Gap 7) | Verificação movida para `process-cancellation` (backend). `CancellationModal.tsx` sem alteração. |
| 22 | Indicador visual de fatura emitida na Agenda (Gap 8) | Nova seção 4.5: ícone `Receipt` no card do calendário; badge "Fatura emitida" nos detalhes; query join com `invoice_classes` |
| 23 | Participante adicionado a aula em grupo já faturada (Gap 9) | Documentado como edge case: bloquear adição de participantes a aulas com fatura prepaid, ou permitir com cobrança manual. NÃO gerar fatura automática. |
| 24 | `handleCompleteClass` e billing (Gap 10) | Documentado: NÃO precisa chamar `process-class-billing`. Aulas normais: billing na criação. Virtuais: billing na materialização. Antigas: `automated-billing`. |
| 25 | `Financeiro.tsx` não importa `InvoiceTypeBadge` (Gap 11) | Coberto pelo Gap 15 (mesmo arquivo). Import + substituição das 3 ocorrências. |

### Revisão v1.3

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 26 | FK join `invoices!inner` no Edge Function `process-cancellation` (Gap 12) | Reescrita para queries sequenciais independentes. FK joins falham no Deno runtime por cache de schema. |
| 27 | Webhook `invoice.paid` confirma TODOS participantes da aula (Gap 13) | Filtrar por `participant_id` do metadata do Invoice Item, não por `class_id`. Evita confirmar participantes que não pagaram em aulas em grupo. |
| 28 | `invoice.lines.data` pode não estar expandido no webhook (Gap 14) | Handler deve buscar invoice completa via `stripe.invoices.retrieve(id, { expand: ['lines'] })`. Não confiar no payload do evento. |
| 29 | `due_date` NOT NULL omitido no passo 3c.vi (Gap 15) | Adicionado cálculo: `new Date(Date.now() + paymentDueDays * 86400000)`. |
| 30 | `description` omitido no passo 3c.vi (Gap 16) | Adicionado: `Fatura pré-paga - Aula(s) de ${serviceName}`. |
| 31 | `auto_advance: true` + `finalizeInvoice` redundante (Gap 17) | Alterado para `auto_advance: false` para controlar finalização explicitamente no passo v. |
| 32 | `orphan_charges` ausente do `InvoiceTypeBadge` (Gap 18) | Adicionado `orphan_charges` ao mapeamento na seção 4.4 e traduções i18n. |
| 33 | Indicador visual e bloqueio de edição sem fase definida (Gap 19) | Movidos explicitamente para Fase 4 na sequência de implementação. |
| 34 | CORS headers ausentes em `process-class-billing` (Gap 20) | Adicionados `corsHeaders` e handler `OPTIONS` na interface da edge function. |
| 35 | `stripe_not_ready` ausente da interface `ProcessClassBillingResponse` (Gap 21) | Adicionado como quarto valor possível do campo `charge_timing`. |
| 36 | i18n faltante para textos de indicador visual e bloqueio (Gap 22) | Adicionadas chaves `prepaidIndicator.*` em `financial.json` (PT/EN). |
| 37 | Checklist de deploy incompleto para v1.2/v1.3 (Gap 23) | Adicionados 7 novos itens no checklist pré-deploy e 1 no pós-deploy. |

### Revisão v1.4

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 38 | `process-class-billing` não invoca `send-invoice-notification` | Adicionado passo 4 explícito: após criar fatura no banco, invocar `send-invoice-notification` com `invoice_id`. Sem isso, aluno não recebe email/notificação. |
| 39 | `stripe_customer_id` não persistido em `teacher_student_relationships` | Adicionado no passo 3c.ii: após buscar/criar customer no Connected Account, fazer UPDATE em `teacher_student_relationships` para salvar `stripe_customer_id`. Evita re-criação em cobranças futuras. |
| 40 | `stripe.invoices.retrieve({ expand: ['lines'] })` limita a 10 items | Substituído por `stripe.invoices.listLineItems` com auto-paginação. Garante processamento correto para aulas em grupo com >10 participantes. |
| 41 | Erros no webhook não chamam `completeEventProcessing` | Adicionado `completeEventProcessing(false, error)` no catch do handler de invoice. Mantém integridade do sistema de idempotência (doc: `stripe-webhook-idempotency.md`). |
| 42 | `payment_origin` ausente na criação de invoice prepaid | Adicionado `payment_origin: 'prepaid'` no passo 3c.vi. Diferencia de `automated` e `manual`. |
| 43 | Handler `invoice.payment_succeeded` sem código explícito | Especificado que deve conter a MESMA lógica completa do handler `invoice.paid`, incluindo paginação e idempotência. |
| 44 | Descrição da invoice imprecisa para múltiplos serviços | Detalhada lógica: se fatura tem múltiplos serviços diferentes, listar todos. Se mesmo serviço, usar formato `3x Aula de Piano`. |
| 45 | `invoices.class_id` indefinido para faturas multi-aula | Definido: `class_id = classIds[0]` se 1 aula, `null` se múltiplas. Relação N:N via `invoice_classes`. |
| 46 | Indicador visual na Agenda usa query direta em vez de view existente | Revertido: view `class_billing_status` NÃO tem campo `has_prepaid_invoice`. Usar query direta em `invoice_classes`. |
| 47 | Rollback de Invoice Items em caso de falha sem detalhamento | Adicionada lógica explícita: guardar IDs em `createdItemIds[]`, em caso de falha deletar via `stripe.invoiceItems.del()`. Se Invoice draft criada, deletar via `stripe.invoices.del()`. |
| 48 | Sem idempotência/proteção contra double-click em `process-class-billing` | Adicionado passo 3a de verificação: se `invoice_classes` com `item_type = 'prepaid_class'` já existe para o `class_id`, pular. |
| 49 | `apiVersion` Stripe inconsistente entre funções | Padronizado `apiVersion: "2023-10-16"` em todas as novas funções e documentado como requisito. |

### Revisão v1.5

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 50 | `send-invoice-notification` requer `notification_type` obrigatório no payload | Corrigido passo 4: payload agora inclui `notification_type: 'invoice_created'`. Sem ele, a edge function não sabe qual template usar e falha silenciosamente. |
| 51 | View `class_billing_status` não tem campo `has_prepaid_invoice` | Revertido Gap 46: campos da view são apenas `class_id`, `teacher_id`, `total_participants`, `billed_participants`, `fully_billed`, `has_billed_items`. `has_billed_items` é genérico (todos os tipos). Para prepaid específico, usar query direta em `invoice_classes` com filtro `item_type = 'prepaid_class'`. |
| 52 | Versão do Stripe SDK inconsistente entre edge functions | [Atualizado v1.6 - Gap 58] Padronizado `stripe@14.24.0` em TODAS as edge functions (alinhado com webhook-stripe-connect existente). |
| 53 | Webhook `invoice.paid` sobrescreve `payment_origin: 'prepaid'` com `'automatic'` | Corrigido: handler agora verifica `payment_origin` atual antes de atualizar. Se já tem valor (ex: `'prepaid'`, `'manual'`), preserva. Só define `'automatic'` se `payment_origin` é null. |
| 54 | `process-cancellation` usa `.limit(1)` para faturas pré-pagas | Corrigido: removido `.limit(1).maybeSingle()`. Agora busca TODAS as faturas pré-pagas vinculadas e itera com `for...of` para void de cada uma. Crucial para aulas em grupo com múltiplas faturas (uma por aluno). |
| 55 | `Agenda.tsx` sem feedback visual após `process-class-billing` | Adicionado: tratar resposta da edge function com toasts para `prepaid` (sucesso), `stripe_not_ready` (warning) e erros. Adicionadas chaves i18n `chargeTiming.prepaidInvoiceCreated` e `chargeTiming.stripeNotReady`. |
| 56 | Handlers `invoice.paid` e `invoice.payment_succeeded` sem `completeEventProcessing` em caminhos de erro | Corrigido: adicionado `completeEventProcessing(supabaseClient, event.id, false, error)` em TODOS os catches e caminhos de erro dos handlers, incluindo falha no update do banco e falha ao buscar line items. |
| 57 | `for await` incompatível com Stripe SDK no Deno runtime | Substituído por `.autoPagingToArray({ limit: 10000 })` que é mais confiável no Deno. `for await` pode falhar com certos async iterators do SDK Stripe em ambientes não-Node.js. |

### Revisão v1.6

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 58 | Versão do Stripe SDK divergente: plano dizia `v14.21.0` mas webhook já usa `v14.24.0` | Padronizado `stripe@14.24.0` em TODAS as edge functions. A versão v14.24.0 já está em produção no `webhook-stripe-connect`. Usar versão menor causaria incompatibilidades de tipos. |
| 59 | Handler `payment_intent.succeeded` também sobrescreve `payment_origin: 'prepaid'` | Aplicada mesma correção do Gap 53: verificar `payment_origin` atual antes de definir `'automatic'`. O handler `payment_intent.succeeded` processa pagamentos de faturas criadas por `create-payment-intent-connect` (PIX/Boleto), que podem ter `payment_origin: 'prepaid'` se originadas por `process-class-billing`. |
| 60 | CORS headers de `process-class-billing` faltam headers específicos do Supabase | Adicionados `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version` aos CORS headers. Sem eles, requisições do cliente Supabase JS podem ser bloqueadas pelo preflight. |
| 61 | `process-class-billing` usa `teacher_id` do body sem validação | Corrigido: autenticação via `supabase.auth.getUser(token)` com JWT do header `Authorization`. O `teacher_id` do body é ignorado; o professor autenticado é determinado pelo JWT. Segue padrão de `create-invoice` e `teacher-context-security-pattern.md`. |
| 62 | `create-payment-intent-connect` cria Stripe customers sem persistir `stripe_customer_id` | Documentado: `process-class-billing` deve PRIMEIRO verificar `teacher_student_relationships.stripe_customer_id` antes de chamar a API Stripe. Se já existe, usar diretamente. A correção no `create-payment-intent-connect` é desejável mas fora do escopo desta implementação. |
| 63 | `get_unbilled_participants_v2` filtra por `participant_id` — comportamento em grupo | Confirmado e documentado: a RPC filtra por `participant_id` (não `class_id`), permitindo billing parcial em grupo (3 de 4 alunos cobrados pré-pago, 4º capturado pelo `automated-billing`). Isso é correto e intencional, mas precisa ser documentado para evitar confusão em testes. |

### Revisão v1.7

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 64 | Migração `DEFAULT 'prepaid'` altera comportamento de TODOS os professores existentes | **CRÍTICO**: A migração `ADD COLUMN charge_timing DEFAULT 'prepaid'` ativaria cobrança imediata para todos os professores existentes sem aviso. Adicionado `UPDATE business_profiles SET charge_timing = 'postpaid'` na migração para preservar o comportamento atual (pós-pago). Novos professores criam com `'prepaid'` (default da coluna). |
| 65 | Cancelamento de participante individual em grupo anula fatura de OUTROS alunos | A query de void em `process-cancellation` filtra por `class_id`, pegando invoice_classes de TODOS os participantes. Para cancelamento individual (um aluno/dependente sai do grupo), deve filtrar também por `participant_id` para voiding apenas a fatura daquele aluno, não de todos. Adicionada lógica condicional na seção 5.4. |
| 66 | Stripe SDK `create-payment-intent-connect` não listado para atualização | `create-payment-intent-connect` (linha 2) usa `stripe@14.21.0`. É chamado diretamente no fluxo de pagamento (PIX/Boleto) e interage com o mesmo Connected Account que `process-class-billing`. Deve ser atualizado para `stripe@14.24.0` junto com as demais 21 funções. Adicionado à lista de arquivos e ao checklist. |
| 67 | `invoice.payment_succeeded` error handler não interrompe fluxo | O handler (linhas 354-368) usa pattern `if (error) { log } else { log }` sem `return`. Quando o update falha, a execução continua e o evento é marcado como `success: true` na linha 544 (via `completeEventProcessing`). Isso impede retries automáticos. Adicionado `return` com status 500 após `completeEventProcessing(false, error)`. |
| 68 | `payment_intent.succeeded` limpa `stripe_hosted_invoice_url` incondicionalmente | O handler (linha 481) seta `stripe_hosted_invoice_url: null`. Para faturas que têm `stripe_invoice_id` (faturas pré-pagas usam Stripe Invoice flow), essa URL é necessária para o botão "Pagar Agora". Adicionada verificação: só limpar se a fatura NÃO tem `stripe_invoice_id`. |
| 69 | Verificação explícita da RPC `get_unbilled_participants_v2` | Confirmado via SQL: a RPC usa `LEFT JOIN invoice_classes ic ON cp.id = ic.participant_id WHERE ic.id IS NULL`. Isso significa que QUALQUER `invoice_classes` (incluindo `item_type = 'prepaid_class'`) exclui o participante dos "não-faturados". Aulas pré-pagas são corretamente filtradas pelo `automated-billing`. Sem ação adicional necessária. |

### Revisão v1.8

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 70 | `process-cancellation` lookup de participante para voiding não filtra por `dependent_id` | **Ambiguidade**: Se um responsável tem 2+ dependentes na mesma aula em grupo, a query `.eq('student_id', cancelled_by).maybeSingle()` retorna null (PGRST116: multiple rows). Sem o `participant_id`, o filtro de `invoice_classes` é pulado e TODAS as faturas pré-pagas são voidadas. FIX: Adicionar `.eq('dependent_id', dependent_id)` quando presente, ou `.is('dependent_id', null)` para o responsável direto. |
| 71 | `Faturas.tsx` não diferencia faturas pré-pagas para o aluno | O `PaymentOptionsCard` (que cria Payment Intents via `create-payment-intent-connect`) apareceria para faturas `prepaid_class`, conflitando com o Stripe Invoice flow. FIX: Se `invoice_type === 'prepaid_class'`, ocultar `PaymentOptionsCard` e exibir apenas o botão "Pagar Agora" redirecionando para `stripe_hosted_invoice_url`. O `change-payment-method` também não se aplica. |
| 72 | `invoice.payment_succeeded` hardcoda `payment_method: 'stripe_invoice'` | Handler (linha 359) define `payment_method: 'stripe_invoice'` para todas faturas pagas via Invoice flow. Para faturas pré-pagas, o aluno pode pagar via boleto, PIX ou cartão na página hosted. FIX: Extrair o método real do evento Stripe via charge associado (`succeededInvoice.charge` → `stripe.charges.retrieve(chargeId, { stripeAccount }).payment_method_details.type`). Fallback para `'stripe_invoice'` se indisponível. [ATUALIZADO v2.2 — Gap 94: `payment_settings.payment_method_types` é lista de métodos PERMITIDOS, não o método usado. Usar charge é a fonte correta.] |
| 73 | Deploy checklist não inclui `automated-billing` para redeployment | `automated-billing` usa FK joins (`profiles!teacher_id`, `profiles!student_id`, `classes!inner`) que podem ficar stale no Deno runtime após a migração adicionar `charge_timing` a `business_profiles`. FIX: Incluir `automated-billing` e `create-payment-intent-connect` na lista de edge functions a serem redeployadas. Mesmo sem modificações de código, o redeploy força refresh do schema cache. |
| 74 | `create-payment-intent-connect` não listado como arquivo a modificar | Apesar do Gap 66 identificar a versão divergente do SDK (`14.21.0` vs `14.24.0`), o arquivo não constava na tabela "Arquivos a Criar/Modificar" (seção 12). A atualização do SDK é uma modificação real que deve ser rastreada. FIX: Adicionado à tabela na Fase 7. |
| 75 | Webhook handlers usam `.single()` para buscar invoices por `stripe_invoice_id` | Os handlers `invoice.paid` (linha 310), `invoice.payment_succeeded` (linha 347) e `payment_intent.succeeded` (linha 457) usam `.single()`. Se o `stripe_invoice_id`/`stripe_payment_intent_id` não existir no banco (invoice criada diretamente no Stripe Dashboard, ou de outra integração), `.single()` lança erro → webhook retorna 500 → Stripe retenta indefinidamente (até 3 dias). FIX: Substituir por `.maybeSingle()` e, se null, logar warning e retornar 200 (evento reconhecido, sem ação). |

---

### Revisão v1.9

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 76 | **CRÍTICO**: `process-class-billing` não verifica mensalidade ativa do aluno | Sem verificação, alunos com `student_monthly_subscriptions.is_active = true` seriam cobrados individualmente (prepaid). Isso cria `invoice_classes` que impedem `get_unbilled_participants_v2` de contar a aula na franquia do plano. Resultado: dupla cobrança (prepaid + mensalidade base). FIX: Antes do passo 3b, buscar `student_monthly_subscriptions` via `relationship_id` (de `teacher_student_relationships`). Se `is_active = true`, pular participante. Para dependentes, usar `responsible_id` para encontrar a relação. Adicionado passo 3a-ter na seção 5.1. |
| 77 | `process-class-billing` não valida ownership dos `class_ids` | Um professor autenticado poderia passar `class_ids` de outro professor. A função usaria o `business_profile` correto (do JWT) mas criaria `invoice_classes` referenciando aulas alheias. FIX: Para cada `class_id`, validar `classes.teacher_id === authenticated_teacher_id`. Se diferente, rejeitar com erro 403. Adicionado passo 1.5 na seção 5.1. |
| 78 | Gap 71 afirma que `Faturas.tsx` usa `PaymentOptionsCard` — INCORRETO | Verificação de código confirma: `Faturas.tsx` NÃO importa nem renderiza `PaymentOptionsCard` (0 referências). O componente só aparece em `Financeiro.tsx` (visão professor). O fluxo existente `handlePayNow → openExternalUrl(hosted_invoice_url)` já funciona para faturas pré-pagas. A correção REAL necessária é: ocultar o botão `change-payment-method` (ícone RefreshCw, linha 371-379) quando `invoice.invoice_type === 'prepaid_class'`, pois `change-payment-method` edge function manipula Payment Intents, não Stripe Invoices. Tabela de compatibilidade (seção 9) atualizada. |
| 79 | Handlers de webhook `invoice.voided`, `invoice.payment_failed`, `payment_intent.payment_failed` não chamam `completeEventProcessing(false, error)` | O Gap 67 identificou o problema para `invoice.payment_succeeded` e disse "aplicar o MESMO pattern em TODOS os handlers", mas não listou explicitamente os demais. Handlers afetados: `invoice.voided` (linhas 420-438): usa `if/else` sem return, erro cai no `completeEventProcessing(true)` na linha 544. `invoice.payment_failed` (linhas 372-393): mesmo padrão. `payment_intent.payment_failed` (linhas 504-537): mesmo padrão. FIX: Todos devem usar o pattern `if (error) { completeEventProcessing(false, error); return 500; }`. |
| 80 | `invoice.paid` handler extrai `stripeAccountId` do objeto invoice, pode ser null | O código proposto (linha 746 do plano) usa `paidInvoice.account as string`. Para webhooks Connect, o Connected Account ID está no campo `account` do EVENTO (`event.account`), não necessariamente no objeto invoice. Para webhooks recebidos via platform endpoint, `event.account` é o campo confiável. FIX: Usar `(event as any).account || paidInvoice.account` como fallback, com validação de null antes de chamar `listLineItems`. Se null, logar warning e pular iteração de line items. |
| 81 | `invoice.payment_failed` para faturas pré-pagas não tem tratamento específico | Quando uma fatura `prepaid_class` falha no pagamento (ex: boleto não pago, PIX expirado), a aula permanece `confirmada` mas sem pagamento. O plano não documenta este cenário. Decisão: a aula NÃO é cancelada automaticamente (poderia causar problemas se o aluno pagar depois). Professor é responsável por decidir ação (cancelar aula manualmente ou esperar pagamento). Adicionado como edge case documentado (Apêndice B.3) e à tabela de riscos. |

---

### Revisão v2.0

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 82 | Handlers `invoice.paid` e `invoice.marked_uncollectible` retornam 500 SEM chamar `completeEventProcessing(false, error)` | **Diferente do Gap 79** (que cobre handlers com pattern `if/else` que caem no fluxo de sucesso), estes handlers fazem **early return** com `return new Response(..., { status: 500 })`. Isso bypassa completamente o `completeEventProcessing(true)` da linha 544. O evento fica permanentemente preso em "processing" no sistema de idempotência — retries do Stripe são rejeitados pela função `start_stripe_event_processing`. FIX: Chamar `completeEventProcessing(false, error)` ANTES de cada `return` com status 500, como já documentado para o handler de `invoice.paid` no código proposto (seção 5.3), mas faltava para `invoice.marked_uncollectible`. |
| 83 | Outer `catch` do webhook (linhas 551-558) não chama `completeEventProcessing(false, error)` | Erros não capturados dentro dos handlers propagam para o catch externo. Se o erro ocorre APÓS `processEventIdempotency` marcar o evento como "processing" (linha 161), o evento fica permanentemente preso — impedindo retries. FIX: No catch externo, verificar se `event` e `supabaseClient` estão definidos e chamar `completeEventProcessing(false, error)` com try/catch de proteção (seção 8.3). |
| 84 | Proposta de `invoice.paid` handler faz downgrade de `concluida` para `confirmada` | O handler proposto (seção 5.3) atualiza `class_participants.status` para `confirmada` com `.neq('status', 'cancelada')`. Mas se o professor completou a aula (`concluida`) antes do pagamento chegar (ex: boleto pago 3 dias depois), o webhook reverteria o status. FIX: Adicionado `.neq('status', 'concluida')` ao filtro do update na seção 5.3. |
| 85 | Código proposto do `invoice.paid` (linha 766) usa `paidInvoice.account` — contradiz Gap 80 | O Gap 80 especifica usar `(event as any).account || paidInvoice.account` como fonte confiável do Connected Account ID. O código na seção 5.3 usava `paidInvoice.account as string` diretamente. FIX: Corrigido na seção 5.3 para usar `(event as any).account || (paidInvoice as any).account` conforme Gap 80. |
| 86 | `invoice.marked_uncollectible` não verifica `payment_origin === 'manual'` | Os handlers `invoice.paid` e `invoice.payment_succeeded` já verificam se `payment_origin === 'manual'` para evitar sobrescrever decisões do professor. O handler `marked_uncollectible` NÃO faz essa verificação. Se o professor marcou pagamento manualmente e o Stripe marca a invoice como incobrável, o webhook sobrescreveria `paid` com `overdue`. FIX: Adicionar verificação de `payment_origin === 'manual'` antes do update (seção 5.3). |
| 87 | Proposta de `invoice.paid` faz 2 queries separadas para a mesma invoice | O código proposto fazia uma query para checar `payment_origin === 'manual'` (linhas 306-315 originais) e outra para checar `payment_origin` para Gap 53 (linhas 731-735). Consolidado em UMA query com `.maybeSingle()` que já implementa Gap 75 (null safety), Gap 53 (preservar payment_origin) e Gap 87 (eficiência). Se `currentInvoice` é null, logar warning e break (per Gap 75). |

---

### Revisão v2.1

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 88 | `process-class-billing` passo 3c.vi NÃO inclui `payment_account_used_id` na tabela `invoices` | Campo existente na tabela `invoices`, usado pelo `automated-billing` para rastreamento financeiro por conta de pagamento. Sem ele, relatórios financeiros e dashboards do professor que agrupam por conta de pagamento ignorariam faturas pré-pagas. FIX: No passo 2.5, ao buscar `payment_accounts`, GUARDAR o `payment_accounts.id` como `paymentAccountId`. No passo 3c.vi, salvar `payment_account_used_id: paymentAccountId` no registro de invoice. |
| 89 | `process-class-billing` busca `charge_timing` do PRIMEIRO business_profile (`LIMIT 1`), mas usa `business_profile_id` da relationship para Stripe | **Inconsistência**: Se professor tem múltiplos business_profiles (ex: PJ com `prepaid` e PF com `postpaid`), poderia usar `charge_timing = 'prepaid'` do profile PJ enquanto cria invoice no Connected Account do profile PF. FIX: Buscar o business_profile da relationship PRIMEIRO. Se `relationship.business_profile_id` não é null, usar ESSE profile para `charge_timing` E `stripe_connect_id`. Fallback para `WHERE user_id = teacher_id LIMIT 1` apenas se relationship não tem profile. Step 2 reescrito na seção 5.1. |
| 90 | Evento `invoice.finalized` do Stripe não é tratado no webhook | `process-class-billing` chama `finalizeInvoice` → Stripe envia `invoice.finalized`. Se o `switch` do webhook não tem case para este tipo e o default NÃO chama `completeEventProcessing` (per Gap 83), o evento fica preso em "processing". FIX: Adicionar case explícito `'invoice.finalized'` com `logStep` + `break` (sem ação no banco). Documentado na seção 8.2. |
| 92 | Race condition no check de idempotência de `process-class-billing` (TOCTOU) | A verificação "se `invoice_classes` com `item_type = 'prepaid_class'` já existe" (passo 3a) e a criação dos InvoiceItems no Stripe NÃO são atômicas. Dois requests simultâneos (double-click rápido com debounce falho, retry automático do frontend) podem ambos passar o check e criar InvoiceItems duplicados no Stripe. O check no banco previne duplicação de `invoice_classes`, mas NÃO previne duplicação de InvoiceItems no Stripe. FIX: Usar Stripe Idempotency Keys (`idempotencyKey` no segundo argumento de chamadas Stripe): `invoiceItems.create` com key `prepaid-item-${classId}-${participantId}`, e `invoices.create` com key `prepaid-invoice-${customerId}-${classIds.sort().join('-')}`. Stripe rejeita automaticamente chamadas duplicadas com a mesma key dentro de 24h. |
| 93 | `teacher_student_relationships.business_profile_id` é nullable — sem fallback | Se a relationship não tem `business_profile_id` definido (professor não atribuiu perfil de negócio ao aluno), step 3c.vi salvaria `business_profile_id: null` na invoice. Mas step 2 já encontrou um `business_profile` (com `charge_timing`). Sem fallback, a invoice fica "órfã" de business_profile. FIX: Se `relationship.business_profile_id` é null, usar `businessProfile.id` do step 2 como fallback. Isso mantém consistência entre a decisão de cobrança (step 2) e o registro da fatura (step 3c.vi). Adicionado na seção 5.1 passo 3c.vi. |

---

### Revisão v2.2

| # | Gap Identificado | Resolução |
|---|------------------|-----------|
| 94 | `payment_method` extraction usa `payment_settings.payment_method_types[0]` — fonte ERRADA | Gap 72 sugeria usar `payment_settings.payment_method_types[0]` como alternativa ao hardcode. MAS `payment_settings.payment_method_types` é a lista de métodos **permitidos** na invoice, NÃO o método efetivamente usado pelo aluno. Ex: invoice permite `['boleto', 'card']`, aluno paga com `card`, mas sistema salva `'boleto'`. FIX: Usar o charge associado como fonte correta: `stripe.charges.retrieve(chargeId, { stripeAccount }).payment_method_details.type`. Fallback para `'stripe_invoice'` se charge é null (ex: invoice $0). Código atualizado nas seções 5.3 e 8.1. |
| 95 | `process-cancellation` void busca `business_profile` por `user_id = teacher_id` — pode usar conta Stripe ERRADA | O código de void (seção 5.4) busca `business_profiles WHERE user_id = teacher_id` para obter `stripe_connect_id`. Se professor tem múltiplos profiles (PF + PJ), pode retornar o perfil ERRADO. O void seria executado na conta Connect errada → Stripe retorna erro ou anula fatura de outro contexto. FIX: Buscar `stripe_connect_id` via `invoices.business_profile_id` da fatura sendo anulada (a invoice sabe de qual profile veio). Fallback para `user_id = teacher_id` apenas se `business_profile_id` é null. Código atualizado na seção 5.4. |
| 96 | `process-class-billing` sem `verify_jwt = false` em `config.toml` | Per convenção do projeto (documentada no guia de edge functions), TODAS as edge functions chamadas pelo frontend devem ter `verify_jwt = false` em `config.toml` com validação in-code via `auth.getUser(token)`. Sem isso, o Supabase gateway rejeita a requisição com 401 ANTES de a função executar — mesmo com JWT válido no header Authorization. FIX: Adicionar `[functions.process-class-billing]\nverify_jwt = false` em `supabase/config.toml`. Nota adicionada na seção 5.1. |
| 97 | Resposta de `process-class-billing` não segue padrão de error handling do projeto | O padrão do projeto (documentado em memória) é: HTTP 200 + `success: false` + mensagem user-friendly para erros de business logic. A interface `ProcessClassBillingResponse` retornava `charge_timing` como indicador implícito de erro/sucesso, sem campo `success` explícito nem `error` string. O frontend não consegue distinguir erro técnico de resultado de negócio. FIX: Adicionado `success: boolean` (obrigatório) e `error?: string` na interface. Todos os retornos usam HTTP 200. Documentado na seção 5.1. |
| 98 | `invoice.payment_failed` handler — Gap 79 mencionava no checklist mas NÃO fornecia código | O handler existente (linhas 380-393) usa `if (failedError) { logStep }` sem `return`. Se update falha, execução cai no `break` e depois em `completeEventProcessing(true)` (linha 544). Evento com falha é marcado como sucesso → idempotência corrompida, retries do Stripe processam evento como "já processado com sucesso". FIX: Código explícito fornecido na seção 5.3 com `completeEventProcessing(false, error)` + `return new Response(500)`. |
| 99 | `payment_intent.payment_failed` handler — mesmo problema do Gap 98 | O handler existente (linhas 514-535) usa pattern `if (error) { log } else if { log } else { log }` sem `return`. Falha no update marca evento como sucesso. FIX: Código explícito fornecido na seção 5.3, seguindo o mesmo pattern do Gap 98. |

---

## Apêndice B: Edge Cases Documentados na v1.2

### B.1 Participante adicionado a aula em grupo após faturamento (Gap 9)

**Cenário**: Professor cria aula em grupo com 3 alunos. Sistema gera fatura pré-paga. Depois, professor tenta adicionar 4º aluno.

**Decisão**: 
- **Opção A (recomendada)**: Bloquear adição de novos participantes. Exibir alerta: "Esta aula já possui fatura pré-paga emitida. Não é possível adicionar novos participantes."
- **Opção B**: Permitir adição, mas o professor deverá cobrar o novo participante manualmente via módulo financeiro (criar fatura manual).
- **NÃO** gerar fatura automática para o novo participante (evita complexidade de fatura parcial).

**Implementação**: No `Agenda.tsx`, ao abrir modal de edição de participantes, verificar se a aula tem `invoice_classes` com `item_type = 'prepaid_class'`. Se sim, desabilitar botão "Adicionar participante" e exibir tooltip explicativo.

### B.2 handleCompleteClass e billing (Gap 10)

**Cenário**: Professor conclui uma aula (muda status para `concluida`). Deve `handleCompleteClass` chamar `process-class-billing`?

**Decisão**: **NÃO**. Razões:
1. **Aulas normais**: Billing pré-pago ocorre na criação (`handleClassSubmit`). Ao concluir, a fatura já existe.
2. **Aulas virtuais**: Billing pré-pago ocorre na materialização (`materializeVirtualClass`), que é chamada internamente por `handleCompleteClass`.
3. **Aulas antigas (pré-feature)**: Não possuem `invoice_classes`. Serão capturadas pelo `automated-billing` normalmente no próximo ciclo, como sempre foram.

Portanto, `handleCompleteClass` (linha ~1537-1581 em Agenda.tsx) **permanece inalterado**.

### B.3 Falha de pagamento em fatura pré-paga (Gap 81)

**Cenário**: Professor tem `charge_timing = 'prepaid'`. Cria aula → fatura pré-paga gerada → aluno não paga (boleto expirou, PIX expirou, cartão recusado).

**Estado resultante**:
- Aula: `status = 'confirmada'` (permanece inalterada)
- Fatura: `status = 'falha_pagamento'`
- Participante: `status = 'confirmada'` (já foi confirmado na criação)

**Decisão**: **Não cancelar a aula automaticamente**. Razões:
1. O aluno pode pagar depois (retry, novo método de pagamento)
2. Cancelar automaticamente por falha de pagamento seria agressivo e poderia gerar conflitos
3. O professor tem visibilidade da fatura no Financeiro e pode decidir a ação

**Ações possíveis pelo professor**:
- Aguardar pagamento (Stripe pode retentar automaticamente dependendo da configuração)
- Cancelar a aula manualmente (process-cancellation fará void da fatura)
- Cobrar manualmente via módulo financeiro
- Conceder anistia (se aplicável)
