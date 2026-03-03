

# Atualizar Plano de Timezone v2.4: 7 Database Functions (RPCs) Faltantes

## Resumo

Adicionar ao documento `docs/timezone-multi-support-implementation-plan.md` a refatoracao de **7 database functions (RPCs)** que usam `CURRENT_DATE` ou `EXTRACT` de `timestamptz` de forma sensivel a timezone.

## Alteracoes ao Documento

### 1. Versao (linha 5)
Atualizar de `2.3` para `2.4`.

### 2. Novo Passo 5.3 (apos Passo 5.2, antes do Passo 6)

Criar secao **"Passo 5.3: Refatorar Database Functions (RPCs) para Timezone-Awareness"** com 7 sub-itens:

**5.3.1** `count_completed_classes_in_month` — Adicionar parametro `p_timezone text DEFAULT 'America/Sao_Paulo'` e usar `EXTRACT(... FROM c.class_date AT TIME ZONE p_timezone)`.

**5.3.2** `get_student_subscription_details` (2 overloads) — Fazer JOIN com `profiles` para obter timezone do professor, converter `CURRENT_DATE` com `(NOW() AT TIME ZONE tz)::DATE` antes de passar ano/mes para `count_completed_classes_in_month`.

**5.3.3** `get_subscription_assigned_students` — Mesmo padrao: obter timezone via JOIN e propagar.

**5.3.4** `get_student_active_subscription` — Adicionar `p_timezone` e comparar `ends_at` com `(NOW() AT TIME ZONE p_timezone)::DATE`.

**5.3.5** `get_billing_cycle_dates` — Adicionar `p_timezone text DEFAULT 'America/Sao_Paulo'` e substituir default `CURRENT_DATE` por `(NOW() AT TIME ZONE p_timezone)::DATE`.

**5.3.6** `count_completed_classes_in_billing_cycle` — Adicionar `p_timezone`, propagar para `get_billing_cycle_dates`, e substituir `c.class_date::DATE` por `(c.class_date AT TIME ZONE p_timezone)::DATE`.

**5.3.7** `get_teacher_notifications` — Substituir `CURRENT_DATE` por `(NOW() AT TIME ZONE tz)::DATE` no calculo de `days_overdue`, obtendo timezone via `auth.uid()` -> `profiles.timezone`.

### 3. Secao 3 (Arquivos Impactados) — Adicionar linha

| Arquivo | Tipo de Mudanca |
|---|---|
| Migration SQL (refatorar 7 RPCs) | Adicionar `p_timezone` e `AT TIME ZONE` em `count_completed_classes_in_month`, `get_student_subscription_details` (2x), `get_subscription_assigned_students`, `get_student_active_subscription`, `get_billing_cycle_dates`, `count_completed_classes_in_billing_cycle`, `get_teacher_notifications` |

### 4. Secao 4 (Riscos) — Adicionar linha

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| RPCs com `CURRENT_DATE` calculam data UTC em vez de local | Alta | Alto | Adicionar `p_timezone` e usar `NOW() AT TIME ZONE` |

### 5. Secao 8 (Checklist) — Adicionar item 15

```
15. ⬜ Backend: refatorar 7 RPCs de banco de dados (Passo 5.3)
```

Tambem corrigir numeracao duplicada (linhas 673-674 tem `13.` duplicado, linha 675 tem `14.` duplicado).

### Detalhes tecnicos

- Todas as RPCs afetadas estao no mesmo banco e usam `CURRENT_DATE` (que no Postgres e equivalente a `(NOW() AT TIME ZONE session_timezone)::DATE` — e como a session timezone e UTC, retorna data UTC).
- A correcao e uniforme: substituir `CURRENT_DATE` por `(NOW() AT TIME ZONE p_timezone)::DATE` e `EXTRACT(... FROM timestamptz)` por `EXTRACT(... FROM timestamptz AT TIME ZONE p_timezone)`.
- O parametro `p_timezone` tera default `'America/Sao_Paulo'` para retrocompatibilidade.

## Arquivo a Modificar

- `docs/timezone-multi-support-implementation-plan.md` (unico arquivo)

