

# Avaliação dos 3 Pontos do Gemini vs. Plano v3.6

## Resultado: 1 gap real. 2 pontos já cobertos.

---

### Ponto 1: `AvailabilityManager.tsx` — GAP REAL (Input Parsing)

O Gemini está **correto**. No `AvailabilityManager.tsx` (linha 134):

```typescript
const startDateTime = new Date(`${newBlock.start_date}T${newBlock.start_time}`);
const endDateTime = new Date(`${newBlock.end_date}T${newBlock.end_time}`);
```

Este é exatamente o mesmo padrão `new Date(\`${date}T${time}\`)` que a **REGRA CRÍTICA de Input Parsing** (linha 632-643 do plano) manda corrigir com `zonedTimeToUtc`. Porém, a lista de arquivos afetados na linha 643 é:

> **Aplicar em**: `ClassForm.tsx`, `Agenda.tsx`, `ClassExceptionForm.tsx`, `FutureClassExceptionForm.tsx`

`AvailabilityManager.tsx` **não está nesta lista**. O componente aparece na tabela de migração do Passo 8 (linha 804/908), mas apenas para o problema de `moment().format()` (exibição). O bug de **input parsing** é diferente e não está coberto.

**Ação**: Adicionar `AvailabilityManager.tsx` à lista da REGRA CRÍTICA de Input Parsing (linha 643).

---

### Ponto 2: `end-recurrence` — JÁ COBERTO (v3.5)

O plano já cobre isto desde a v3.5:
- Passo 5.1.13 (linha 412+) detalha a correção
- Tabela de arquivos impactados (linha 911)
- Tabela de riscos (linha 943)
- Checklist item 14 (linha 1054)

**Nenhuma ação necessária.**

---

### Ponto 3: `manage-class-exception` / `exception_date` — JÁ COBERTO

O Gemini sugere que o `exception_date` pode desalinhar se o frontend enviar a data no fuso errado. Isto é **exatamente** o que a REGRA CRÍTICA de Input Parsing já resolve:

- `ClassExceptionForm.tsx` está listado na linha 643 como alvo de `zonedTimeToUtc`
- `FutureClassExceptionForm.tsx` também está listado
- Ambos estão na tabela de migração (linhas 802-803, 906-907)

Se o frontend enviar o `exception_date` já convertido corretamente via `zonedTimeToUtc`, a edge function receberá o timestamp correto. **Nenhuma ação adicional necessária** na edge function.

---

## Resumo

| Alteração | Tipo | Local no documento |
|---|---|---|
| Adicionar `AvailabilityManager.tsx` à lista da REGRA CRÍTICA de Input Parsing | Correção de gap | Linha 643 do plano |

Apenas 1 arquivo a adicionar numa lista existente. Contagem de componentes e RPCs não muda.

