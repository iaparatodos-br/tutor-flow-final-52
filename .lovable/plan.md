

# Avaliação dos 5 Pontos do Gemini vs. Plano v3.2

## Análise Ponto a Ponto

### Ponto 1: Conversão de `working_hours` na visão do Aluno — PARCIALMENTE CORRETO

**O que o Gemini diz**: `get-teacher-availability` retorna `working_hours` (09:00-18:00) sem timezone do professor. Aluno em Lisboa vê horários errados.

**Análise do código real**: Confirmado. A edge function (linha 84) retorna `start_time`/`end_time` puros. No frontend (`StudentScheduleRequest.tsx`, linhas 180-187), o componente aplica esses horários diretamente ao `Date` local do aluno:

```typescript
const [startHour, startMinute] = workingHour.start_time.split(':').map(Number);
startTime.setHours(startHour, startMinute, 0, 0);
```

Se professor e aluno estão em fusos diferentes, o aluno verá horários errados e poderá agendar fora do expediente do professor.

**Veredicto**: Gap **real e crítico**. O plano v3.2 lista `StudentScheduleRequest.tsx` na tabela do Passo 8, mas apenas como "migrar datas para utilitário". Falta:
1. `get-teacher-availability` deve retornar o `timezone` do professor na resposta.
2. `StudentScheduleRequest.tsx` deve converter `working_hours` do fuso do professor para o fuso do aluno.
3. O `request-class` edge function deve validar que o horário solicitado cai dentro do expediente do professor no fuso do professor.

---

### Ponto 2: Notificações de Email com fuso do destinatário — CORRETO

**O que o Gemini diz**: Emails de lembrete enviados ao aluno usam timezone do professor, mas deveriam usar o do aluno.

**Análise**: O plano v3.2 (Passo 5.1) diz consistentemente "buscar timezone do professor". Isso funciona quando professor e aluno estão no mesmo fuso, mas quando diferem, o aluno recebe horário no fuso errado.

**Veredicto**: Gap **real e importante**. O plano deve ser refinado:
- Emails para o **professor** usam timezone do professor.
- Emails para o **aluno** usam timezone do aluno.
- Boa prática: incluir acrônimo do fuso (ex: "15:00 BRT") via `timeZoneName: 'short'`.

Isso afeta: `send-class-reminders` (5.1.1), `send-class-confirmation-notification` (5.1.2), `send-cancellation-notification` (5.1.3), `send-class-request-notification` (5.1.5), `send-class-report-notification` (5.1.6). Para `send-invoice-notification` (5.1.4) e `send-boleto-subscription-notification` (5.1.7), o destinatário é tipicamente o aluno/responsável, então deve usar timezone do aluno.

---

### Ponto 3: Horário de Verão (DST) em aulas recorrentes — PARCIALMENTE CORRETO, MAS BAIXA PRIORIDADE

**O que o Gemini diz**: `manage-future-class-exceptions` usa `setDate(getDate() + 7)` em UTC, causando drift de 1h ao cruzar DST.

**Análise do código** (linhas 133-146): Usa `Date.setDate()` nativo do JS. Porém:
- `setDate()` opera no **horário local do servidor** (UTC no Deno), não em milissegundos puros como `getTime() + 7*86400000`. No UTC, não há DST — a aritmética de dias é correta.
- As datas são armazenadas como `timestamptz` no banco. O cálculo em UTC preserva o instante correto.
- O verdadeiro risco de DST está na **apresentação** (frontend), não na geração de exceções.

**Veredicto**: Gap **menor/teórico**. Em UTC puro (como no Deno), `setDate(getDate() + 7)` funciona corretamente sem drift. O risco de DST afeta apenas a exibição no frontend, que já está coberta pela migração dos componentes no Passo 8. Adicionar uma nota ao plano é suficiente — não requer refatoração de `manage-future-class-exceptions`.

---

### Ponto 4: `AvailabilityManager.tsx` ausente da migração — CORRETO

**O que o Gemini diz**: O componente usa `moment(dateTime).format('DD/MM/YYYY HH:mm')` (linha 258) e foi esquecido.

**Análise**: Confirmado. Linha 258 do `AvailabilityManager.tsx`:
```typescript
const formatDateTime = (dateTime: string) => {
  return moment(dateTime).format('DD/MM/YYYY HH:mm');
};
```

**Veredicto**: Gap **real mas menor**. Este componente é usado apenas pelo professor para gerenciar seus próprios bloqueios de disponibilidade. O `moment()` sem timezone usa o fuso local do browser, que para o professor logado é o comportamento desejado. Mesmo assim, deve ser migrado para consistência e remoção progressiva do `moment.js`.

---

### Ponto 5: Falso-positivo de expiração em `materialize-virtual-class` — CORRETO

**O que o Gemini diz**: Linha 224-226 compara `recurrence_end_date` (campo `date`) com `new Date()` (UTC), podendo expirar prematuramente.

**Análise do código**:
```typescript
if (template.recurrence_end_date) {
  const endDate = new Date(template.recurrence_end_date);
  if (endDate < new Date()) { ... }
}
```

`recurrence_end_date` é `timestamp with time zone` no schema (não `date`). Porém, os valores são tipicamente armazenados como `endOfDay` no fuso local do professor (conforme memory `logica-data-fim-recorrencia`). A comparação com `new Date()` (UTC) pode causar expiração prematura para professores em fusos negativos profundos (ex: UTC-12).

**Veredicto**: Gap **real mas de impacto reduzido**. Como `recurrence_end_date` é `timestamptz` (não `date`), e o frontend já armazena com `endOfDay` do fuso local, o risco é menor que o descrito pelo Gemini. Ainda assim, para consistência, a edge function deveria comparar com "fim do dia" no timezone do professor. Deve ser adicionado ao plano.

---

## Alterações Propostas ao Plano v3.2

### 1. NOVO — Passo 5.4: `get-teacher-availability` deve retornar timezone do professor

| Local | Mudança |
|---|---|
| Query de profiles | Incluir `timezone` no select (ou buscar do professor separadamente) |
| Response JSON | Adicionar campo `teacherTimezone` na resposta |
| `StudentScheduleRequest.tsx` | Converter `working_hours` do fuso do professor para o fuso do aluno |
| `request-class` edge function | Validar horário no fuso do professor |

### 2. Passo 5.1 — Refinar regra de timezone em emails

Adicionar regra explícita:
- **Destinatário = professor** → usar `profiles.timezone` do professor
- **Destinatário = aluno/responsável** → usar `profiles.timezone` do aluno
- **Ambos** → incluir `timeZoneName: 'short'` no formato (ex: "15:00 BRT")

Funções afetadas: 5.1.1 (`send-class-reminders` — email vai para aluno), 5.1.2, 5.1.3, 5.1.5, 5.1.6 (emails que podem ir para ambos), 5.1.4 e 5.1.7 (emails de fatura para aluno).

### 3. Passo 8 — Adicionar `AvailabilityManager.tsx` à tabela de migração

| Arquivo | Problema |
|---|---|
| `src/components/Availability/AvailabilityManager.tsx` | 1x `moment().format('DD/MM/YYYY HH:mm')` sem timezone explícito — migrar para utilitário timezone-aware |

### 4. NOVO — Passo 5.5: `materialize-virtual-class` — comparação de expiração timezone-aware

Linha 224-226: Buscar timezone do professor (dono do template) e comparar `recurrence_end_date` com "agora" no fuso local do professor, em vez de UTC puro.

### 5. Nota sobre DST em `manage-future-class-exceptions`

Adicionar nota ao plano (sem refatoração imediata): a aritmética de `setDate()` em UTC no Deno é segura para DST. O risco de DST está na apresentação (frontend), já coberta pela migração dos componentes.

### 6. Atualizar Seção 3 (Arquivos Impactados) e contagem total de componentes

- Adicionar `get-teacher-availability/index.ts`
- Adicionar `AvailabilityManager.tsx`
- Adicionar `materialize-virtual-class/index.ts`
- Atualizar contagem de componentes frontend de 35 para 36

### 7. Atualizar Seção 4 (Riscos)

Adicionar:
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Aluno agenda aula fora do expediente do professor (fusos diferentes) | Média | Alto | `get-teacher-availability` retorna timezone; frontend converte |
| Email de lembrete com horário no fuso errado para aluno | Alta | Alto | Usar timezone do destinatário, não do professor |
| Template expirado prematuramente em `materialize-virtual-class` | Baixa | Médio | Comparar com "agora" no fuso do professor |

