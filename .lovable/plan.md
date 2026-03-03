

# Auditoria Final de Queries v3.2: 2 Gaps Menores Encontrados

## Resumo

Cruzamento completo de todas as queries e calculos propostos no plano v3.2 com o codigo real. O plano esta **substancialmente correto**. Encontrei **2 gaps menores** que nao alteram a arquitetura mas devem ser corrigidos no documento para evitar que sejam esquecidos na implementacao.

---

## Gap 1: `automated-billing` tem 5 `toLocaleDateString`, nao 4

### Onde o plano diz

Secao 3 (Arquivos Impactados), linha 618:
> "4 `toLocaleDateString` internos"

### Ocorrencias reais no codigo

| Linha | Codigo | Contexto |
|---|---|---|
| 412 | `new Date(classItem.class_date).toLocaleDateString('pt-BR')` | Descricao de aula concluida (billing tradicional) |
| 472 | `now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })` | Descricao geral da fatura |
| 696 | `cycleStart.toLocaleDateString('pt-BR')` | Descricao do ciclo de mensalidade |
| 697 | `cycleEnd.toLocaleDateString('pt-BR')` | Descricao do ciclo de mensalidade |
| **939** | `new Date(classInfo.class_date).toLocaleDateString('pt-BR')` | **Descricao de aula avulsa fora do ciclo (processMonthlySubscriptionBilling)** |

A 5a ocorrencia (linha 939) esta dentro da funcao `processMonthlySubscriptionBilling`, na secao de aulas fora do ciclo de faturamento. Gera descricoes como "Aula avulsa (anterior a mensalidade) - Servico - 15/01/2026".

### Impacto

Baixo -- afeta apenas texto descritivo em faturas. Mas se nao for corrigido, a data na descricao pode mostrar o dia errado para professores em fusos positivos.

### Acao

Atualizar a contagem na Secao 3 de "4 `toLocaleDateString` internos" para "**5** `toLocaleDateString` internos" e mencionar explicitamente a ocorrencia na linha 939.

---

## Gap 2: `check-overdue-invoices` -- lembretes "proximos ao vencimento" tambem usam UTC

### Onde o plano cobre

Passo 5.2 discute a comparacao de faturas **vencidas** (overdue):
```typescript
.lt("due_date", now.toISOString().split('T')[0])
```

### O que falta

A mesma funcao tambem calcula faturas **proximas ao vencimento** (linhas 115-116):
```typescript
const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
.gte("due_date", now.toISOString().split('T')[0])
.lte("due_date", threeDaysFromNow.toISOString().split('T')[0])
```

`now` e `threeDaysFromNow` sao calculados em UTC. Para um professor em UTC+9 as 10:00 local do dia 15, `now.toISOString().split('T')[0]` = dia 15 (01:00 UTC). Mas para um professor em UTC-5 as 22:00 local do dia 15, `now.toISOString().split('T')[0]` = dia 16 (03:00 UTC). O lembrete de "proximo ao vencimento" pode ser enviado 1 dia antes ou depois do esperado.

### Impacto

Medio -- afeta o timing de lembretes de pagamento (pode enviar lembrete cedo demais ou tarde demais), mas nao afeta cobranca.

### Acao

No Passo 5.2, alem da comparacao de overdue, adicionar nota sobre a comparacao de "upcoming" (3 dias) que precisa do mesmo tratamento timezone-aware.

---

## Verificacoes Realizadas (Sem Gaps Adicionais)

### Edge Functions -- Queries confirmadas corretas

| Edge Function | Ocorrencias no plano | Verificacao |
|---|---|---|
| `send-class-reminders` | 2x `timeZone: "America/Sao_Paulo"` | Confirmado (linhas 168, 173) |
| `send-class-confirmation-notification` | 2x `timeZone: "America/Sao_Paulo"` | Confirmado (linhas 110, 115) |
| `send-cancellation-notification` | 1x `timeZone: 'America/Sao_Paulo'` | Confirmado (linha 161) |
| `send-invoice-notification` | 1x `timeZone: "America/Sao_Paulo"` | Confirmado (linha 194) |
| `send-class-request-notification` | 2x `timeZone: "America/Sao_Paulo"` | Confirmado (linhas 105, 110) |
| `send-class-report-notification` | 2x sem timezone | Confirmado (linhas 174-175) |
| `send-boleto-subscription-notification` | `formatDate` sem timezone | Confirmado (linhas 34-37) |
| `process-cancellation` | 1x sem timezone | Confirmado (linha 470) |
| `process-orphan-cancellation-charges` | 1x descricao + dueDate | Confirmado (linhas 233, 252) |
| `create-invoice` | 1x descricao + dueDate fallback | Confirmado (linhas 352, 199) |
| `generate-teacher-notifications` | `today` UTC | Confirmado (linha 192) |
| `check-pending-boletos` | `tomorrow` UTC | Confirmado (linhas 179-186) |

### `due_date` com `toISOString().split('T')[0]` -- 3 ocorrencias de negocio confirmadas

| Arquivo | Linha | Contexto |
|---|---|---|
| `automated-billing` | 499 | Billing tradicional |
| `automated-billing` | 823 | Mensalidade |
| `automated-billing` | 961 | Aulas fora do ciclo |
| `process-orphan-cancellation-charges` | 252 | Orphan charges |
| `create-invoice` | 199 | Fallback manual |

**Nota**: Linhas 700-702 e 774 do `automated-billing` tambem usam `toISOString().split('T')[0]` mas apenas em **log messages** (nao em dados gravados no banco). Nao precisam de correcao.

### `validate-payment-routing` -- Confirmado sem impacto

Linha 241 usa `toISOString().split('T')[0]` para um `due_date` de teste. E uma funcao de validacao/debug, nao de producao. Corretamente excluida do plano.

### RPCs -- Todas confirmadas corretas

As 7 RPCs listadas no Passo 5.3 cobrem todos os casos identificados. A arvore de propagacao de `p_timezone` esta correta.

### RPC `get_relationships_to_bill_now` -- Query confirmada correta

A query com `EXTRACT(DAY/HOUR FROM now() AT TIME ZONE tz)` e o filtro por hora=1 estao logicamente corretos.

---

## Alteracoes Propostas ao Documento

### 1. Secao 3 (Arquivos Impactados) -- Corrigir contagem

**Antes**: "4 `toLocaleDateString` internos"
**Depois**: "**5** `toLocaleDateString` internos (inclui descricao de aulas fora do ciclo em `processMonthlySubscriptionBilling`, linha 939)"

### 2. Passo 5.2 -- Adicionar nota sobre lembretes "upcoming"

Apos o bloco de codigo do Passo 5.2 (Opcao A/B), adicionar:

> **Nota**: A mesma funcao tambem calcula faturas proximas ao vencimento (3 dias) usando `threeDaysFromNow.toISOString().split('T')[0]` (linhas 115-116). Esta comparacao precisa do mesmo tratamento timezone-aware para que os lembretes sejam enviados no dia correto no fuso do professor.

### 3. Versao do documento

Manter em **v3.2** (sao correcoes de documentacao, nao novos gaps de arquitetura). Ou atualizar para **v3.2.1** se preferir rastreabilidade granular.

