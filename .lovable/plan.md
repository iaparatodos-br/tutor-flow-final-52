

# Plano de Atualização do Documento Teacher Inbox - Revisão 6

## Objetivo
Atualizar o documento `docs/teacher-inbox-implementation.md` com as 2 novas lacunas identificadas (29 e 30), corrigindo as inconsistências críticas relacionadas ao status `overdue` e padronização de status de cancelamento.

---

## Lacunas Identificadas na Revisão 6

### Lacuna 29: Status `overdue` é Valor Físico no Banco (NÃO FOI ATUALIZADO)

**Evidência da Query:**
```
SELECT status, COUNT(*) FROM invoices GROUP BY status;
-- overdue: 12 faturas (VALOR FÍSICO!)
-- paga: 3 faturas  
-- paid: 1 fatura (inconsistência)
-- pendente: 1 fatura
```

**Impacto Crítico:**
- Edge Function atual busca apenas `status = 'pendente'`, ignorando 12 faturas com `status = 'overdue'` físico
- Trigger de auto-remoção não trata transição de `overdue` para `paga`/`paid`

### Lacuna 30: Inconsistência de Status `cancelado` vs `cancelada` nos Triggers

**Problema:** O trigger `remove_notification_on_invoice_paid` (linha 1065) verifica `NEW.status IN ('pago', 'cancelado')`, mas o banco usa `'cancelada'` para faturas e classes.

---

## Alterações no Documento

### 1. Atualizar Comentário na Edge Function (linhas 821-826)

**De:**
```typescript
// NOTA: Status 'pendente' + due_date < now = overdue (calculado)
```

**Para:**
```typescript
// LACUNA 29: Status 'overdue' é um valor FÍSICO no banco (12 faturas encontradas)
// A varredura deve buscar AMBOS os cenários:
// 1. Faturas com status = 'overdue' (atualização automática por cron existente)
// 2. Faturas com status = 'pendente' E due_date < now (fallback para legado)
// NOTA: Também existe inconsistência de nomenclatura: 'paga' vs 'paid'
```

### 2. Atualizar Query de Faturas na Edge Function (linhas 840-868)

**De:**
```typescript
const { data: overdueInvoices, error: overdueError } = await supabase
  .from("invoices")
  .select("id, teacher_id, business_profile_id")
  .eq("status", "pendente")
  .lt("due_date", now)
  ...
```

**Para:**
```typescript
// LACUNA 29: Status 'overdue' é valor físico no banco
// Query 1: Faturas com status físico 'overdue'
const { data: physicalOverdue, error: physicalError } = await supabase
  .from("invoices")
  .select("id, teacher_id, business_profile_id")
  .eq("status", "overdue")
  .gte("due_date", thirtyDaysAgo)
  .not("business_profile_id", "is", null);

// Query 2: Faturas com status 'pendente' mas vencidas (fallback legado)
const { data: calculatedOverdue, error: calculatedError } = await supabase
  .from("invoices")
  .select("id, teacher_id, business_profile_id")
  .eq("status", "pendente")
  .lt("due_date", now)
  .gte("due_date", thirtyDaysAgo)
  .not("business_profile_id", "is", null);

// Combinar resultados (deduplicar por ID)
const overdueInvoices = [
  ...(physicalOverdue || []),
  ...(calculatedOverdue || []).filter(
    calc => !(physicalOverdue || []).some(phys => phys.id === calc.id)
  )
];
```

### 3. Atualizar Comentário do Trigger (linhas 1058-1060)

**De:**
```sql
-- Remove notificação quando fatura é paga ou cancelada
-- NOTA: Status de faturas no banco são 'pendente', 'pago', 'cancelado'
-- 'overdue' NÃO é um status real - é calculado quando due_date < now()
```

**Para:**
```sql
-- Remove notificação quando fatura é paga ou cancelada
-- LACUNA 29: Status 'overdue' É um valor físico no banco (12 faturas encontradas)
-- LACUNA 30: Inconsistência de nomenclatura: 'paga' vs 'paid', 'cancelado' vs 'cancelada'
-- Trigger deve tratar transição de QUALQUER status pendente para QUALQUER status resolvido
```

### 4. Atualizar Condições do Trigger (linhas 1064-1070)

**De:**
```sql
IF NEW.status IN ('pago', 'cancelado') 
   AND OLD.status = 'pendente' THEN
  DELETE FROM teacher_notifications ...
```

**Para:**
```sql
-- LACUNA 29: Tratar status 'overdue' como status de origem
-- LACUNA 30: Tratar inconsistência paga/paid e cancelado/cancelada
IF NEW.status IN ('pago', 'paga', 'paid', 'cancelado', 'cancelada') 
   AND OLD.status IN ('pendente', 'overdue') THEN
  DELETE FROM teacher_notifications 
  WHERE source_id = NEW.id 
    AND source_type = 'invoice';
END IF;
```

### 5. Adicionar Seção Lacuna 29 (após linha ~3148)

```markdown
### Lacuna 29: Status `overdue` é Valor Físico no Banco (Não Calculado)

**Problema:** O documento assumia que `overdue` era um status calculado (`pendente` + `due_date < now`). 
Query no banco revelou que `overdue` é um valor físico armazenado (12 faturas).

**Verificação:**
| Status | Quantidade |
|--------|------------|
| overdue | 12 (FÍSICO!) |
| paga | 3 |
| paid | 1 (inconsistência) |
| pendente | 1 |

**Impacto:**
- Edge Function `generate-teacher-notifications` deve buscar AMBOS cenários
- Trigger de auto-remoção deve tratar transição de `overdue` para `pago/paga/paid`
- Inconsistência de nomenclatura (`paga` vs `paid`) deve ser tratada

**Solução:**
1. **Edge Function:** Duas queries combinadas (status físico + fallback calculado)
2. **Trigger:** Expandir condições para `OLD.status IN ('pendente', 'overdue')`
3. **Trigger:** Expandir condições de saída para `NEW.status IN ('pago', 'paga', 'paid', 'cancelado', 'cancelada')`
```

### 6. Adicionar Seção Lacuna 30 (após Lacuna 29)

```markdown
### Lacuna 30: Inconsistência de Status `cancelado` vs `cancelada`

**Problema:** O documento e triggers usam `'cancelado'` (masculino), mas o banco usa `'cancelada'` (feminino) para faturas e classes.

**Verificação:**
- Trigger documentado (linha 1065): `NEW.status IN ('pago', 'cancelado')`
- Banco de dados: Status real é `'cancelada'`

**Solução:**
Padronizar todos os triggers e código para usar array com ambos os valores:
```sql
NEW.status IN ('pago', 'paga', 'paid', 'cancelado', 'cancelada')
```
```

### 7. Atualizar Tabela de Resumo (linha ~3205)

**De:**
```markdown
| **TOTAL** | **50 itens** | **Pronto para implementação** |
```

**Para:**
```markdown
| Lacunas adicionais (Revisão 5) | 1 | ⬜ Requer implementação |
| Lacunas adicionais (Revisão 6) | 2 | ⬜ Requer implementação |
| **TOTAL** | **52 itens** | **Pronto para implementação** |
```

### 8. Atualizar Tabela de Lacunas (linha ~3209)

Adicionar linhas:
```markdown
| **29** | **Status `overdue` é valor físico no banco** | **Crítica** | **Ajustar Edge Function e triggers** |
| **30** | **Inconsistência `cancelado` vs `cancelada`** | **Alta** | **Padronizar para array com ambos** |
```

### 9. Atualizar Última Atualização (linha ~3264)

```markdown
**Última atualização:** Revisão 6 - Identificadas lacunas críticas de status `overdue` físico e inconsistência de nomenclatura `cancelado/cancelada`
```

---

## Checklist Consolidado (39 itens)

### Fase 1: Backend - 18 itens
- Tabela + índices + RLS + RPCs + triggers
- **Lacuna 29:** Query dupla para overdue
- **Lacuna 30:** Padronizar status

### Fase 2: Frontend - 13 itens  
- Types + hooks + componentes + i18n

### Fase 3: Integração - 8 itens
- Rotas + deep-linking + testes

---

## Resumo Final

| Categoria | Quantidade |
|-----------|------------|
| Correções já aplicadas | 22 |
| Lacunas (Revisão 1-4) | 28 |
| **Lacunas (Revisão 6)** | **2** |
| **TOTAL** | **52 itens validados** |
| Progresso de implementação | **0%** |

