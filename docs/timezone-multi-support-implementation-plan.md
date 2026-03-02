# Plano de Implementação: Suporte a Múltiplos Fusos Horários

> **Status**: Pendente de implementação  
> **Data**: 2026-03-02  
> **Versão**: 1.0

---

## 1. Contexto e Motivação

O sistema **Tutor Flow** opera atualmente com fuso horário fixo de Brasília (`America/Sao_Paulo`, UTC-3). Esta abordagem simplifica o desenvolvimento, mas impede a expansão para tutores e alunos em outros fusos horários.

### Objetivo

Evoluir o sistema para suporte multi-timezone com:
- **Detecção automática** no frontend (sem selects/dropdowns nesta fase).
- **Hourly Sweeper** no backend para billing timezone-aware.
- **Retrocompatibilidade** total com utilizadores existentes.

### Princípios

1. **Frictionless UX** — detecção 100% automática, sem interação manual para escolha de timezone.
2. **Retrocompatível** — utilizadores existentes mantêm `America/Sao_Paulo` como default.
3. **Idempotente** — execução horária do billing não pode gerar faturas duplicadas.

---

## 2. Passos de Implementação

### Passo 1: Migração da Base de Dados

Adicionar coluna `timezone` à tabela `profiles`:

```sql
ALTER TABLE public.profiles 
ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
```

- Tipo `text` para armazenar identificadores IANA (ex: `'Europe/Lisbon'`, `'America/New_York'`).
- Default `'America/Sao_Paulo'` garante retrocompatibilidade.
- Todos os utilizadores existentes recebem automaticamente o valor default.

---

### Passo 2: Frontend — Capturar Timezone no Registo/Login

#### Detecção Automática

Usar a API nativa do browser:

```typescript
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
```

#### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-teacher/index.ts` | Aceitar campo `timezone` no body; preencher coluna ao criar perfil |
| `supabase/functions/create-student/index.ts` | Aceitar campo `timezone` no body; preencher coluna ao criar perfil |
| `src/contexts/AuthContext.tsx` | No `signUp`, capturar timezone do browser e enviar no payload |
| `src/components/ProfileSetup.tsx` | Ao submeter profile setup, enviar timezone do browser |

#### Fallback

Se `Intl.DateTimeFormat` não estiver disponível ou retornar `undefined`, usar `'America/Sao_Paulo'` silenciosamente.

---

### Passo 3: Hook `useTimezoneSync` — Sincronização Inteligente

#### Novo arquivo: `src/hooks/useTimezoneSync.ts`

Custom hook que:

1. Roda após login / carregamento da app (quando `profile` está disponível).
2. Compara `Intl.DateTimeFormat().resolvedOptions().timeZone` com `profile.timezone`.
3. Se diferentes, mostra toast com ação:
   > _"Detetámos que estás num novo fuso horário ([novo]). Queres atualizar?"_
4. Se o utilizador aceitar, faz mutation para atualizar a coluna `timezone` no Supabase.
5. Usa `sessionStorage` para não repetir o toast na mesma sessão se o utilizador recusar.

#### Integração

- Chamar `useTimezoneSync()` no `Layout.tsx` (componente que envolve todas as rotas autenticadas).

#### Atualizar interface `Profile`

- Adicionar campo `timezone: string` na interface `Profile` em `AuthContext.tsx`.
- Incluir `timezone` no `loadProfile`.

---

### Passo 4: Alterar Cron Job para Execução Horária

#### Configuração atual

```
jobname: automated-billing-daily
schedule: 0 9 * * *  (diário às 09:00 UTC)
```

#### Nova configuração

```
jobname: automated-billing-hourly
schedule: 0 * * * *  (a cada hora, minuto 0)
```

#### Ação

Executar SQL para:
1. `SELECT cron.unschedule('automated-billing-daily');`
2. `SELECT cron.schedule('automated-billing-hourly', '0 * * * *', ...);`

---

### Passo 5: Refatorar `automated-billing` (Hourly Sweeper)

#### Lógica atual (problema)

```typescript
const today = new Date().getDate(); // Usa UTC do servidor
// .eq('billing_day', today)
```

Usa `new Date()` (UTC do servidor) para determinar o dia de billing. Falha para utilizadores em fusos diferentes de UTC.

#### Nova lógica — RPC PostgreSQL

Criar função `get_relationships_to_bill_now()`:

```sql
CREATE OR REPLACE FUNCTION public.get_relationships_to_bill_now()
RETURNS SETOF teacher_student_relationships
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tsr.*
  FROM teacher_student_relationships tsr
  JOIN profiles p ON p.id = tsr.teacher_id
  WHERE tsr.is_active = true
    AND tsr.billing_day = EXTRACT(DAY FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo')))
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone, 'America/Sao_Paulo'))) = 1
$$;
```

**Lógica**: Retorna apenas os relacionamentos cujo professor está na hora `01:00` local. A maioria das execuções horárias retorna 0 registros.

#### Alterações na Edge Function

| Local | Mudança |
|---|---|
| Query de billing day | Substituir `.eq('billing_day', today)` pela chamada à RPC |
| `getBillingCycleDates` | Receber timezone e calcular datas no fuso local do professor |

---

### Passo 6: Garantia de Idempotência (CRÍTICO)

A idempotência **já existe** no código atual:

- **Billing mensal**: Verifica `existingMonthlyInvoice` por `teacher_id + student_id + invoice_type + monthly_subscription_id + created_at range` (linhas ~706-725 do `automated-billing`).
- **Billing por aula**: Garantida pela RPC `get_unbilled_participants_v2` que só retorna participantes não faturados.

Com execução horária, estas verificações continuam válidas. **Nenhuma alteração necessária**, apenas validar que funciona corretamente com os novos ciclos timezone-aware.

#### Ponto de atenção

A window de `created_at` usada para verificar duplicatas deve ser calculada no timezone do professor, não em UTC.

---

### Passo 7: Dependência `date-fns-tz`

Adicionar ao `package.json`:

```bash
bun add date-fns-tz
```

Para uso futuro em:
- Componentes de calendário com formatação timezone-aware.
- Conversões visuais de horários entre fusos.
- Substituição progressiva do `moment.js`.

---

## 3. Arquivos Impactados

| Arquivo | Tipo de Mudança |
|---|---|
| Migration SQL (`profiles.timezone`) | Nova coluna |
| RPC SQL `get_relationships_to_bill_now` | Nova função PostgreSQL |
| `supabase/functions/create-teacher/index.ts` | Aceitar campo timezone |
| `supabase/functions/create-student/index.ts` | Aceitar campo timezone |
| `supabase/functions/automated-billing/index.ts` | Refatorar para hourly sweeper |
| `src/contexts/AuthContext.tsx` | Interface Profile + signUp payload |
| `src/hooks/useTimezoneSync.ts` | **Novo** — hook de sincronização |
| `src/components/Layout.tsx` | Integrar hook |
| `src/components/ProfileSetup.tsx` | Enviar timezone no setup |
| Cron job SQL | Alterar schedule para horário |
| `package.json` | Adicionar `date-fns-tz` |

---

## 4. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Utilizadores existentes sem timezone | Nula | — | Default `'America/Sao_Paulo'` na coluna |
| Cron horário = 24x mais invocações | Média | Baixo | RPC filtra no Postgres; maioria retorna 0 registros |
| Billing cycle dates calculados em UTC vs local | Alta | Alto | Passar timezone para `getBillingCycleDates` |
| `date-fns-tz` conflito com `moment.js` | Baixa | Baixo | São libs independentes, sem conflito |
| Browser sem suporte a `Intl.DateTimeFormat` | Muito baixa | Baixo | Fallback silencioso para `'America/Sao_Paulo'` |
| Toast de timezone incomodar utilizadores | Baixa | Baixo | `sessionStorage` limita a 1x por sessão |

---

## 5. Plano de Testes

### Testes Unitários

1. **Hook `useTimezoneSync`**: Verificar que detecta diferença e mostra toast.
2. **RPC `get_relationships_to_bill_now`**: Testar com profiles em diferentes fusos, validar que só retorna os corretos para a hora atual.

### Testes de Integração

1. **Registo com timezone**: Criar professor, verificar que `profiles.timezone` foi preenchido.
2. **Billing horário**: Simular execução em diferentes horas UTC e validar que apenas os professores no fuso correto são processados.
3. **Idempotência**: Executar billing 2x na mesma hora e verificar que não duplica faturas.

### Testes de Regressão

1. **Utilizadores existentes**: Verificar que billing continua funcionando normalmente com default `'America/Sao_Paulo'`.
2. **Fluxo de login/signup**: Verificar que timezone é capturado sem erros.
3. **Calendar/Agenda**: Verificar que a visualização de aulas não é afetada pela nova coluna.

---

## 6. Sequência de Execução Recomendada

1. ✅ Criar este documento de referência
2. ⬜ Migração DB (Passo 1) — adicionar coluna `timezone`
3. ⬜ Adicionar `date-fns-tz` (Passo 7) — sem risco
4. ⬜ Frontend: capturar timezone no registo (Passo 2)
5. ⬜ Frontend: hook `useTimezoneSync` (Passo 3)
6. ⬜ Backend: criar RPC `get_relationships_to_bill_now` (Passo 5)
7. ⬜ Backend: refatorar `automated-billing` (Passo 5)
8. ⬜ Cron job: alterar para horário (Passo 4)
9. ⬜ Validar idempotência (Passo 6)
10. ⬜ Testes end-to-end

---

## 7. Referências

- [Documentação atual de timezone](../docs/timezone-implementation.md)
- [Utilitários de timezone](../src/utils/timezone.ts)
- [IANA Time Zone Database](https://www.iana.org/time-zones)
- [`date-fns-tz` docs](https://github.com/marnusw/date-fns-tz)
