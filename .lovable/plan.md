

# Refatoracao do Plano de Cobranca Hibrida — Novas Regras de Negocio

## Contexto

O plano atual (v3.10, 228 gaps, ~2939 linhas) foi construido com premissas diferentes das novas regras definidas pelo usuario. As principais diferencas sao:

1. **O plano atual trata `charge_timing` como configuracao global do professor.** As novas regras definem que a escolha de "paga antes" ou "paga depois" e feita **por aula, no momento do agendamento**, nao globalmente.
2. **O plano atual cria Invoice Items no Stripe para pre-pago.** As novas regras simplificam drasticamente: nao ha integracao com Stripe no agendamento. "Paga antes" significa apenas que a cobranca e gerada imediatamente como fatura individual; "paga depois" acumula para o ciclo.
3. **O plano atual possui logica complexa de reembolso/void para cancelamentos.** As novas regras eliminam reembolsos: cancelamento de aula paga antes e tratado fora do sistema; cancelamento de aula paga depois usa anistia existente.
4. **Recorrencia e bloqueada para "paga antes"**, mas permitida para "paga depois" e aulas gratuitas.

---

## Novas Regras de Negocio (4 Casos de Uso)

### Caso 1: Mensalidade + Avulsa Depois
- Aluno **tem** mensalidade ativa
- Professor configura cobranca **depois**
- Professor agenda aula e seleciona "aula paga":
  - Aula **pode** ser recorrente
  - Aulas concluidas ate o dia de geracao da proxima fatura da mensalidade sao somadas e adicionadas a fatura da mensalidade seguinte
- Se "aula nao paga": recorrencia liberada normalmente

### Caso 2: Mensalidade + Avulsa Antes
- Aluno **tem** mensalidade ativa
- Professor configura cobranca **antes**
- Professor agenda aula e seleciona "aula paga":
  - Aula **nao pode** ser recorrente
  - Fatura individual gerada imediatamente
- Se "aula nao paga": recorrencia liberada normalmente

### Caso 3: Avulsa Depois (sem mensalidade)
- Aluno **nao tem** mensalidade
- Professor configura cobranca **depois**
- Sistema mostra opcao "aula paga ou nao"
- Aula **pode** ser recorrente
- Aulas concluidas ate o dia de fechamento do aluno sao somadas em unica fatura

### Caso 4: Avulsa Antes (sem mensalidade)
- Aluno **nao tem** mensalidade
- Professor configura cobranca **antes**
- Sistema mostra opcao "aula paga ou nao"
- Aula **nao pode** ser recorrente (quando paga)

### Cancelamento (todos os casos)
- **Aula nao paga**: cancelamento normal, sem impacto financeiro
- **Aula paga antes**: cancelamento normal, sem reembolso/credito/anistia. Tratamento combinado entre professor e aluno fora do sistema
- **Aula paga depois e cancelada com cobranca**:
  - Se aula **ainda nao foi faturada**: botao de anistia aparece no modal da aula (ja existe)
  - Se aula **ja foi faturada**: label de aviso substitui o botao dizendo "nao e mais possivel oferecer anistia pois a aula ja foi faturada"
  - Se professor concede anistia: aula nao e incluida na proxima fatura

### Card Informativo
- No local onde o professor escolhe "paga antes" ou "paga depois", exibir card explicativo detalhando cada modelo, fluxo e tratamento de cancelamento

---

## Impacto no Plano Atual

### O que MUDA fundamentalmente

1. **`charge_timing` permanece como configuracao global** (em `business_profiles`), mas agora controla se o professor cobra antes ou depois. A escolha "paga/nao paga" e feita por aula no ClassForm.

2. **ClassForm.tsx precisa de novo campo**: checkbox/switch "Aula paga" (visivel apenas quando nao e experimental). Quando `charge_timing = 'prepaid'` e "aula paga" = true, recorrencia e desabilitada.

3. **Logica de cancelamento simplificada drasticamente**: eliminar void de faturas Stripe, eliminar reembolsos, eliminar creditos. Para pre-pago, cancelamento e simples. Para pos-pago, manter anistia existente com nova condicao de "ja faturada".

4. **AmnestyButton.tsx precisa de validacao adicional**: verificar se a aula ja foi incluida em alguma fatura (`invoice_classes`). Se sim, mostrar label em vez do botao.

5. **Eliminacao da edge function `process-class-billing`**: o plano atual previa uma edge function complexa para criar Invoice Items no Stripe. Nas novas regras, pre-pago simplesmente gera uma fatura local (similar a `create-invoice`), sem Invoice Items no Stripe Connect.

6. **BillingSettings.tsx**: adicionar card de selecao `charge_timing` com card informativo explicando cada modelo

### O que PERMANECE

- Estrutura de dados basica (`charge_timing` em `business_profiles`)
- Fluxo pos-pago via `automated-billing` (ja funciona)
- Sistema de mensalidades (intacto)
- InvoiceTypeBadge, InvoiceStatusBadge (componentes existentes)
- Gaps de correcao no webhook (Fase 0) — continuam validos
- Gaps de i18n e migracao SQL — maioria permanece

---

## Detalhamento Tecnico

### 1. Banco de Dados

#### 1.1 business_profiles — charge_timing (sem mudanca)
```sql
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS charge_timing TEXT NOT NULL DEFAULT 'postpaid'
  CHECK (charge_timing IN ('prepaid', 'postpaid'));
```
Default e `postpaid` para professores existentes (preserva comportamento atual).

#### 1.2 classes — novo campo `is_paid_class`
```sql
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_paid_class BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.classes.is_paid_class IS
  'Indica se esta aula gera cobranca. false = aula gratuita (ex: reposicao, cortesia)';
```
Quando `is_paid_class = false`, a aula nunca gera cobranca independente do charge_timing.

#### 1.3 Indices adicionais
Nenhum novo indice necessario alem dos ja documentados.

### 2. Frontend — ClassForm.tsx

#### 2.1 Novo campo "Aula Paga"
- Adicionar switch/checkbox "Esta aula sera cobrada?" entre o card de Tipo de Aula e Selecao de Servico
- Visivel apenas quando `is_experimental = false`
- Default: `true` (aula paga)
- Quando `false`: servico ainda e selecionado (para duracao), mas sem cobranca

#### 2.2 Bloqueio de recorrencia
- Quando `charge_timing = 'prepaid'` E `is_paid_class = true`:
  - Desabilitar checkbox de recorrencia
  - Mostrar tooltip explicando: "Aulas cobradas antecipadamente nao podem ser recorrentes"
- Quando `is_paid_class = false`: recorrencia sempre liberada

#### 2.3 Dados necessarios
- ClassForm precisa receber `charge_timing` do professor (via props ou query ao business_profiles)
- ClassFormData precisa incluir `is_paid_class: boolean`

### 3. Frontend — BillingSettings.tsx

#### 3.1 Card "Modelo de Cobranca"
- Adicionar entre os cards existentes
- Dois cards selecionaveis: "Cobrar Antes" e "Cobrar Depois"
- Card informativo expandido explicando:
  - **Cobrar Antes**: fatura gerada no agendamento; recorrencia bloqueada para aulas pagas; cancelamento tratado fora do sistema
  - **Cobrar Depois**: aulas concluidas acumulam para a proxima fatura; recorrencia permitida; anistia disponivel para cancelamentos

#### 3.2 Carregamento e salvamento
- Buscar `charge_timing` do `business_profiles` no `loadSettings`
- Salvar via `UPDATE business_profiles SET charge_timing = ...`

### 4. Backend — Geracao de fatura pre-paga

#### 4.1 Quando gerar
- No submit do ClassForm (Agenda.tsx), apos criar a aula no banco
- Condicoes: `charge_timing = 'prepaid'` E `is_paid_class = true` E `is_experimental = false` E professor tem `business_profile`

#### 4.2 Como gerar
- Reutilizar logica existente do `create-invoice` (edge function ja existente)
- Criar fatura com `invoice_type = 'prepaid_class'`
- Fatura e criada no banco local com status `pendente`
- Metodo de pagamento segue hierarquia existente (Boleto > PIX > Nenhum)

#### 4.3 Simplificacao vs plano atual
- **Eliminar**: Invoice Items no Stripe Connect, Invoice no Stripe, Finalize
- **Manter**: criacao de fatura local + geracao de boleto/PIX via edge functions existentes

### 5. Backend — Cancelamento

#### 5.1 Aula nao paga (`is_paid_class = false`)
- Cancelamento normal sem impacto financeiro (ja funciona)

#### 5.2 Aula paga antes (pre-paga com fatura existente)
- Cancelar aula normalmente
- **NAO** cancelar/void a fatura
- **NAO** gerar reembolso
- **NAO** gerar anistia
- Exibir mensagem no CancellationModal: "Esta aula ja foi cobrada. O tratamento financeiro deve ser combinado diretamente com o aluno."

#### 5.3 Aula paga depois (pos-paga)
- Cancelamento com politica de cobranca (ja funciona)
- Anistia continua disponivel via AmnestyButton
- **Nova regra**: verificar se aula ja foi faturada

### 6. Frontend — AmnestyButton.tsx (modificacoes)

#### 6.1 Verificacao de faturamento
- Antes de exibir o botao, consultar `invoice_classes` para verificar se a aula ja foi incluida em alguma fatura
- Query: `SELECT id FROM invoice_classes WHERE class_id = :classId AND item_type IN ('regular', 'cancellation')`

#### 6.2 Condicoes de exibicao
- **Aula cancelada com cobranca + NAO faturada**: mostrar botao de anistia (comportamento atual)
- **Aula cancelada com cobranca + JA faturada**: mostrar label "Nao e possivel conceder anistia. Esta aula ja foi incluida em uma fatura."
- **Aula pre-paga cancelada**: NAO mostrar botao de anistia (cancelamento tratado fora do sistema)

### 7. Backend — automated-billing (ajustes)

#### 7.1 Filtrar aulas gratuitas
- A RPC `get_unbilled_participants_v2` deve filtrar `is_paid_class = false`
- Adicionar: `AND c.is_paid_class = true` no WHERE

#### 7.2 Consolidacao com mensalidade
- Para alunos com mensalidade + aulas avulsas pos-pagas:
  - Aulas concluidas no ciclo sao somadas ao valor da mensalidade na mesma fatura
  - Isso ja e o comportamento existente do `automated-billing` (aulas extras = overage)

### 8. i18n

#### 8.1 Novas chaves (PT e EN)
- `billing.chargeTiming.title`
- `billing.chargeTiming.description`
- `billing.chargeTiming.prepaid.title` / `.description` / `.cancellationInfo`
- `billing.chargeTiming.postpaid.title` / `.description` / `.cancellationInfo`
- `billing.chargeTiming.infoCard.title` / `.content`
- `classes.isPaidClass` / `classes.isPaidClassDescription`
- `classes.recurrenceBlockedPrepaid`
- `cancellation.prepaidWarning`
- `amnesty.alreadyInvoiced`

---

## Fases de Implementacao (Revisadas)

| Fase | Descricao | Estimativa |
|------|-----------|------------|
| 0 | Correcoes criticas no webhook existente (Gaps 82-115 do plano original) | Mantida |
| 1 | Migracao SQL: `charge_timing` + `is_paid_class` + ajuste RPC | 1 sessao |
| 2 | BillingSettings: card de selecao charge_timing com card informativo | 1 sessao |
| 3 | ClassForm: campo "aula paga" + bloqueio de recorrencia condicional | 1 sessao |
| 4 | Agenda.tsx: gerar fatura pre-paga no submit (reutilizar create-invoice) | 1 sessao |
| 5 | Cancelamento: simplificar process-cancellation + CancellationModal | 1 sessao |
| 6 | AmnestyButton: verificacao de faturamento + label de aviso | 1 sessao |
| 7 | automated-billing: filtrar is_paid_class + i18n | 1 sessao |
| 8 | Testes e validacao end-to-end | 1 sessao |

---

## O que sera REMOVIDO do plano atual

1. Edge function `process-class-billing` (nao sera criada)
2. Logica de Invoice Items + Invoice + Finalize no Stripe Connect para pre-pago
3. Logica de void/cancel de faturas Stripe no cancelamento
4. Logica de reembolso (pending_refunds para pre-pago)
5. Complexidade de materialização com billing no frontend
6. ~60% dos 228 gaps originais que tratavam dessas funcionalidades eliminadas

## O que sera ADICIONADO

1. Campo `is_paid_class` na tabela `classes`
2. Switch "Aula paga" no ClassForm
3. Card informativo no BillingSettings explicando cada modelo
4. Verificacao de faturamento no AmnestyButton
5. Label "ja faturada" no modal da aula
6. Mensagem no CancellationModal para aulas pre-pagas

