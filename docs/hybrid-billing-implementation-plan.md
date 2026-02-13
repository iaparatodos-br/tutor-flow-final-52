# Plano de Cobrança Híbrida — v4.9

**Data**: 2026-02-13
**Status Fase 1 (Migração SQL)**: ✅ Concluída

---

## Contexto

O plano anterior (v3.10, 228 gaps, ~2939 linhas) foi substituído por regras de negócio simplificadas na v4.0. A v4.1 incorporou 16 pontas soltas, a v4.2 adicionou 7 (#17-#23) e 4 melhorias (M1-M4). A v4.3 adicionou 6 pontas soltas (#24-#29) e 3 melhorias (M5-M7). A v4.4 adicionou 6 pontas soltas (#30-#35) e 3 melhorias (M8-M10). A v4.5 adicionou 5 pontas soltas (#36-#40) e 2 melhorias (M11-M12). A v4.6 adicionou 6 pontas soltas (#41-#46) e 3 melhorias (M13-M15). A v4.7 adicionou 5 pontas soltas (#47-#51) e 2 melhorias (M16-M17). A v4.8 adicionou 5 pontas soltas (#52-#56) e 2 melhorias (M18-M19). Esta v4.9 adiciona 5 novas pontas soltas (#57-#61) e 3 melhorias (M20-M22).

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
| 4 | automated-billing RPC + materialize (filtro `is_paid_class`) | #7.1, #8.1, #17, #27, #35, #45, #52, M3 | Pendente |
| 5 | Agenda.tsx: persistir `is_paid_class` + gerar fatura pré-paga | #2.4, #17, #18, #4.3, #23, #24, #25, #31, #36, #38, #40, #42, #55, M5, M7, M9, M13 | Pendente |
| 6 | Cancelamento: process-cancellation + CancellationModal | #5.1, #5.2, #19, #20, #28, #29, #30, #43, M6, M14 | Pendente |
| 7 | AmnestyButton: verificação de faturamento + label | #6.1, #28, #37, M11 | Pendente |
| 8 | InvoiceTypeBadge consolidação + i18n + testes + notificações + bugs | #9.1, #21, #10.1, #16, #32, #34, #39, #46, #47, #48, #49, #50, #51, #53, #54, #56, M10, M12, M15, M16, M17, M18, M19 | Pendente |

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

## Histórico de Versões

| Versão | Data | Mudanças |
|--------|------|----------|
| v4.0 | 2026-02-12 | Simplificação radical: charge_timing + is_paid_class |
| v4.1 | 2026-02-13 | 16 pontas soltas identificadas e incorporadas |
| v4.2 | 2026-02-13 | +7 pontas soltas (#17-#23), +4 melhorias (M1-M4), reordenação de fases |
| v4.3 | 2026-02-13 | +6 pontas soltas (#24-#29), +3 melhorias (M5-M7), decisão sobre automated-billing + charge_timing, invariante prepaid+cancellation, índices consolidados |
| v4.4 | 2026-02-13 | +6 pontas soltas (#30-#35), +3 melhorias (M8-M10): notificações prepaid, payment_method dinâmico no automated-billing, taxa Stripe variável, FK joins no automated-billing |
| v4.5 | 2026-02-13 | +5 pontas soltas (#36-#40), +2 melhorias (M11-M12): bug crítico no AmnestyButton, FK joins adicionais, labels de email incorretos |
| v4.6 | 2026-02-13 | +6 pontas soltas (#41-#46), +3 melhorias (M13-M15): idempotência de notificações, rollback de fatura pré-paga, due_date hard-coded |
| v4.7 | 2026-02-13 | +5 pontas soltas (#47-#51), +2 melhorias (M16-M17), 2 resolvidas (#33, M9): notificações duplicadas, .single() no webhook |
| v4.8 | 2026-02-13 | +5 pontas soltas (#52-#56), +2 melhorias (M18-M19): FK join em validateTeacherCanBill, .single() em send-invoice-notification, payment_method no SELECT de notificação, dependent_id perdido na materialização, status atualizado antes do envio |
| v4.9 | 2026-02-13 | +5 pontas soltas (#57-#61), +3 melhorias (M20-M22): FK join em create-invoice e automated-billing principal, process-cancellation sem is_paid_class, boleto hardcoded, materialize sem is_paid_class, label incorreto no email |

## Memórias do Projeto a Atualizar

Após implementação, atualizar:
1. `constraints/concorrencia-faturamento-pre-post-pago` — referencia `process-class-billing`
2. `features/billing/arquitetura-implementacao-hibrida` — referencia `process-class-billing` como "roteador central"
3. `features/billing/prepaid-cancellation-refund-policy` — menciona "void automático no Stripe"
4. `payment/stripe-pix-configuration-logic` — menciona taxa fixa de R$3,49 por boleto (atualizar para taxas variáveis)
5. `features/teacher-inbox/amnesty-flow-calendar` — deve documentar a limitação da anistia para faturas consolidadas (#37/M11)
6. `features/billing/prazo-vencimento-padrao-consistencia` — deve documentar que create-invoice agora respeita payment_due_days (#44/M13)
7. `database/invoice-overdue-notification-tracking` — deve documentar solução da ponta #47 (bug de idempotência crítico)
8. `infrastructure/supabase-query-patterns` — deve listar #52, #57, #58 como exemplos de FK joins a corrigir
9. `features/billing/ui-feedback-constraints` — deve documentar que stripe_hosted_invoice_url armazena boleto_url (M22)
