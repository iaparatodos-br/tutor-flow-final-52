

# Consolidacao Final do Plano de Cobranca Hibrida -- v5.24

## Problema Identificado

O plano esta fragmentado em dois documentos desincronizados:
- `docs/hybrid-billing-implementation-plan.md` -- parado na v5.17 com 147 pontas soltas
- `.lovable/plan.md` -- avancou ate v5.23 com 180 pontas soltas

Alem disso, encontrei **3 duplicatas**, **2 inconsistencias de fase** e **4 itens nao integrados nas fases**. Nenhuma ponta solta genuinamente nova foi encontrada -- a cobertura de 100% das 75 Edge Functions esta validada.

---

## 1. Duplicatas Confirmadas (a resolver)

| Item .lovable/plan.md | Duplicata de (main doc) | Descricao |
|---|---|---|
| #166 | #80 | process-cancellation usa SERVICE_ROLE_KEY como Bearer token para create-invoice |
| #169 (parcial) | #98 + #104 | Status 'paid' vs 'paga' em webhook-stripe-connect e cancel-payment-intent |
| #153 | Subsumido por #177 | `.single()` em create-payment-intent-connect (ja declarado como subsumido) |
| #154 | Subsumido por #179 | `.single()` em change-payment-method (ja declarado como subsumido) |

**Acao**: Marcar #166 como duplicata de #80. Manter #169 como item expandido que complementa #98/#104 com 3 ocorrencias adicionais no webhook. Manter #153/#154 como subsumidos (ja esta assim).

## 2. Itens Implementados Nao Refletidos no Main Doc

Os seguintes itens foram implementados mas o main doc nao foi atualizado:

| # | Descricao | Status |
|---|---|---|
| #148 | generate-boleto-for-invoice: `.single()` trocado por `.maybeSingle()` | Implementado |
| #149 | process-orphan-cancellation-charges: `.single()` em 2 lookups internos | Implementado |
| #150 | process-orphan-cancellation-charges: filtro `is_paid_class` adicionado | Implementado |
| #151 | generate-boleto-for-invoice: guard clause de status adicionada | Implementado |

**Total implementado atualizado**: 8 (originais #132-#137) + 4 (#148-#151) = **12 implementadas**

## 3. Itens Nao Atribuidos a Fases

Os seguintes itens da auditoria (#152-#180) nao estao mapeados nas 8 fases do roadmap:

| # | Descricao | Fase Sugerida |
|---|---|---|
| #152 | process-orphan: verificacao de erro apos filtragem | 8 (Polish) |
| #155 | check-overdue-invoices: guard clause no UPDATE | **1 (Critico)** -- ja assinalado no Batch 1 |
| #156 | auto-verify-pending-invoices: guard clause no UPDATE | **1 (Critico)** |
| #157 | verify-payment-status: `.single()` | 8 |
| #158 | verify-payment-status: guard clause no UPDATE | **1 (Critico)** |
| #159 | send-invoice-notification: `.single()` em 3 lookups | 8 |
| #160 | webhook-stripe-connect: verificacao payment_origin nos handlers de falha | **1 (Critico)** |
| #161 | process-cancellation: `.single()` na linha 107 | 6 |
| #162 | create-invoice: `.single()` nas linhas 154, 382 | 5 |
| #163 | automated-billing: FK joins na query principal | 4 |
| #164 | create-invoice: FK join para relationship | 5 |
| #165 | create-invoice: FK joins aninhados para classes | 5 |
| #166 | DUPLICATA de #80 -- remover | -- |
| #167 | handle-student-overage: `.single()` | 8 |
| #168 | send-cancellation-notification: `.single()` em 4 lookups | 8 |
| #169 | webhook + cancel-payment-intent: status 'paid' vs 'paga' (5 locais) | **1 (Critico)** |
| #170 | change-payment-method: bypass autorizacao | **1 (Critico)** |
| #171 | generate-boleto-for-invoice: FK joins | 5 |
| #172 | automated-billing: FK join diagnostico | 4 |
| #173 | webhook-stripe-connect: `.single()` em 3 handlers | 8 |
| #174 | cancel-payment-intent: `.single()` | 8 |
| #175 | create-payment-intent-connect: SEM autenticacao | **1 (Critico)** |
| #176 | create-payment-intent-connect: FK joins triplos | 5 |
| #177 | create-payment-intent-connect: `.single()` cascata | 5 |
| #178 | check-overdue-invoices: usa class_notifications para faturas | 8 |
| #179 | change-payment-method: FK joins + `.single()` | 8 |
| #180 | automated-billing: FK joins na query principal | 4 |

## 4. Atualizacao das Fases com Itens Criticos

A tabela de fases atualizada fica:

| Fase | Descricao | Pontas Soltas (atualizado) |
|------|-----------|---------------------------|
| **0** | **Batch 1 Critico (NOVO)** | **#155, #156, #158, #160, #169, #170, #175** |
| 1 | Migracao SQL | Concluida |
| 2 | Settings/BillingSettings | #3.2, #22, M4, M37 |
| 3 | ClassForm + request-class | #2.3, #138, M1, M8 |
| 4 | RPC + materialize + automated-billing | #7.1, #8.1, #17, #27, #35, #45, #52, #163, #172, #180, M3, M18 |
| 5 | Agenda.tsx + create-invoice + pagamento | #2.4, #17, #18, #4.3, #23, #24, #25, #31, #36, #38, #40, #42, #55, #162, #164, #165, #171, #176, #177, M5, M7, M9, M13, M35 |
| 6 | Cancelamento | #5.1, #5.2, #19, #20, #28, #29, #30, #43, #80, #83, #84, #161, M6, M14, M33 |
| 7 | AmnestyButton | #6.1, #28, #37, #82, #100, M11 |
| 8 | Polish, i18n, bugs | #9.1, #16, #21, #10.1, e todos os demais itens de `.single()`, CORS, HTTP 500, FK joins nao criticos |

**Nota critica**: A **Fase 0** deve ser implementada ANTES de qualquer outra fase, pois contem vulnerabilidades de seguranca ativas e race conditions que causam perda financeira.

## 5. Verificacao de Fluxos Completos

Verifiquei cada fluxo end-to-end contra o codigo atual:

### Fluxo Prepaid (criar aula paga antes)
- ClassForm adiciona `is_paid_class` -- #2.3, #66 (Fase 3)
- handleClassSubmit persiste `is_paid_class` -- #2.4, #62 (Fase 5)
- handleClassSubmit chama create-invoice -- #18 (Fase 5)
- create-invoice aceita `prepaid_class` -- #23 (Fase 5)
- create-invoice valida minimo condicional -- #24 (Fase 5)
- create-invoice gera pagamento via hierarquia -- ja funciona
- Bloqueio de recorrencia para prepaid+paga -- Fase 3
- **Verificado**: Fluxo completo coberto

### Fluxo Postpaid (cobranca depois)
- Aulas acumuladas -- ja funciona
- automated-billing filtra `is_paid_class` via RPC -- #7.1, #65 (Fase 4)
- automated-billing gera pagamento com hierarquia -- #31, #36, #40, M27 (Fase 4/5)
- **Verificado**: Fluxo completo coberto

### Fluxo Cancelamento
- process-cancellation busca `is_paid_class` -- #5.1 (Fase 6)
- process-cancellation busca `charge_timing` -- #5.2 (Fase 6)
- Aula gratuita: shouldCharge = false -- #5.1 (Fase 6)
- Aula prepaid: shouldCharge = false -- #5.2 (Fase 6)
- Aula postpaid: fluxo existente com anistia -- ja funciona
- AmnestyButton verifica faturamento -- #6.1, #28 (Fase 7)
- AmnestyButton verifica is_paid_class -- #82 (Fase 7)
- **Verificado**: Fluxo completo coberto

### Fluxo Pagamento (PIX/Boleto/Cartao)
- create-payment-intent-connect: auth -- #175 (Fase 0)
- create-payment-intent-connect: FK joins -- #176 (Fase 5)
- webhook recebe pagamento e atualiza status -- #169 (status em PT, Fase 0)
- webhook preserva payment_method -- #74 (Fase 8)
- webhook preserva dados de pagamento -- #86 (Fase 8)
- change-payment-method: auth bypass -- #170 (Fase 0)
- verify-payment-status: guard clause -- #158 (Fase 0)
- auto-verify: guard clause -- #156 (Fase 0)
- **Verificado**: Fluxo coberto, com 4 itens criticos na Fase 0

### Fluxo Materialização de Aulas Virtuais
- materialize-virtual-class propaga `is_paid_class` -- #8.1, #61 (Fase 4)
- Frontend materializeVirtualClass propaga `is_paid_class` -- #17, #63 (Fase 4/5)
- Participantes propagam `dependent_id` -- #55 (Fase 5)
- **Verificado**: Fluxo completo coberto

## 6. Acao Concreta

Consolidar os dois documentos em um unico `docs/hybrid-billing-implementation-plan.md` atualizado para v5.24:

1. **Atualizar cabecalho**: v5.17 para v5.24, 180 pontas soltas (12 implementadas, 168 pendentes, 1 duplicata removida = **179 unicas**)
2. **Adicionar Fase 0** (Batch Critico) na tabela de fases
3. **Integrar #148-#180** no indice de pontas soltas (atualmente para em #91 no indice principal, com #92-#147 em secoes separadas)
4. **Marcar #166 como duplicata** de #80
5. **Atualizar tabela de cobertura** com as 55 funcoes auditadas (atual: 47)
6. **Mover conteudo relevante do `.lovable/plan.md`** para o doc principal e limpar o arquivo de audit
7. **Adicionar secao "Itens Implementados"** unificada listando #132-#137 e #148-#151

---

## Secao Tecnica: Totais Finais Consolidados

```text
Pontas Soltas Totais:     180
  - Duplicatas:             1 (#166 = #80)
  - Unicas:               179
  - Implementadas:          12 (#132-#137, #148-#151)
  - Pendentes:            167

Melhorias (M):              52

Funcoes Cobertas:           48 (+ 27 fora de escopo = 75 total)

Fases:
  Fase 0 (Critico):         7 itens (#155, #156, #158, #160, #169, #170, #175)
  Fase 1 (SQL):            Concluida
  Fase 2 (Settings):        4 itens
  Fase 3 (ClassForm):       4 itens
  Fase 4 (RPC/Billing):    12 itens
  Fase 5 (Agenda/Invoice): 25 itens
  Fase 6 (Cancelamento):   15 itens
  Fase 7 (Amnesty):         5 itens
  Fase 8 (Polish):        ~95 itens
```

