# Plano de Testes — Timezone Multi-Support v3.6.3

> **Objetivo**: Validar que todas as camadas do Tutor Flow (DB, RPCs, Edge Functions, Frontend) respeitam o fuso horário do perfil do utilizador.
>
> **Pré-requisito global**: Dois utilizadores de teste — um professor com `timezone = 'America/New_York'` (UTC-5/UTC-4 DST) e um aluno com `timezone = 'Europe/Lisbon'` (UTC+0/UTC+1 DST). O professor padrão BRT (`America/Sao_Paulo`) serve como controlo.

---

## 1. Registo e Detecção Automática

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 1.1 | Browser configurado em `America/New_York` | Criar conta de **professor** via signup | `profiles.timezone` = `'America/New_York'` no banco |
| 1.2 | Browser configurado em `Europe/Lisbon` | Criar conta de **aluno** via convite do professor | `profiles.timezone` = `'Europe/Lisbon'` no banco |
| 1.3 | Browser com `Intl.DateTimeFormat` indisponível (simulado) | Criar conta | `profiles.timezone` = `'America/Sao_Paulo'` (fallback) |
| 1.4 | Utilizador existente sem coluna `timezone` preenchida | Fazer login | Coluna preenchida com `'America/Sao_Paulo'` (default da migração) |

### Passo a passo — Teste 1.1

1. Abrir DevTools → Console → executar `Intl.DateTimeFormat().resolvedOptions().timeZone` e confirmar que retorna `America/New_York`.
2. Navegar até `/auth` e preencher o formulário de registo como professor.
3. Submeter o formulário.
4. No Supabase, executar:
   ```sql
   SELECT timezone FROM profiles WHERE email = '<email_do_teste>';
   ```
5. Confirmar que o valor é `America/New_York`.

---

## 2. Sincronização de Timezone (`useTimezoneSync`)

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 2.1 | Professor com `timezone = 'America/Sao_Paulo'`; browser em `America/New_York` | Fazer login | Toast aparece: "Fuso horário diferente detectado" com opções "Atualizar" e "Manter" |
| 2.2 | Cenário 2.1 ativo | Clicar em **"Atualizar"** | `profiles.timezone` atualizado para `America/New_York`; página recarrega; toast de confirmação |
| 2.3 | Cenário 2.1 ativo | Clicar em **"Manter"** | `sessionStorage['tz-sync-dismissed']` = `'America/New_York'`; toast fecha |
| 2.4 | Cenário 2.3 concluído | Navegar para outra página e voltar | Toast **não** reaparece na mesma sessão |
| 2.5 | Cenário 2.3 concluído | Fechar o separador e abrir nova sessão | Toast reaparece (sessionStorage limpo) |
| 2.6 | Professor com `timezone = 'America/New_York'`; browser em `America/New_York` | Fazer login | Nenhum toast aparece (fusos iguais) |

### Passo a passo — Teste 2.1

1. No Supabase, garantir que o professor de teste tem `timezone = 'America/Sao_Paulo'`.
2. Configurar o browser para `America/New_York` (via OS ou extensão de override de timezone).
3. Fazer login.
4. Verificar que o toast com as opções aparece em até 5 segundos.
5. **Não** clicar em nenhum botão — verificar que o toast desaparece após 15 segundos (duração configurada).

### Passo a passo — Teste 2.6 (Seletor Manual)

1. Fazer login como professor.
2. Navegar para **Configurações → Perfil**.
3. Localizar o campo "Fuso Horário" (select/dropdown).
4. Alterar de `America/Sao_Paulo` para `America/New_York`.
5. Salvar.
6. Verificar no banco: `profiles.timezone = 'America/New_York'`.
7. Recarregar a página — confirmar que o componente `TimezoneInfo` exibe o novo fuso.

---

## 3. Exibição de Datas no Frontend

> **Regra**: Todas as datas com hora devem refletir o fuso do perfil. Campos do tipo `date` (sem hora) nunca sofrem shift.

### 3.1 Datas com hora (timestamptz)

| # | Componente | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|---|
| 3.1.1 | `CalendarView` | Professor em `America/New_York`; aula às `2026-03-10T17:00:00Z` | Abrir calendário | Aula exibida às **13:00 EDT** (não 14:00 BRT) |
| 3.1.2 | `SimpleCalendar` | Mesmo cenário | Abrir calendário simplificado | Mesmo resultado: 13:00 |
| 3.1.3 | `MobileCalendarList` | Mesmo cenário, viewport mobile | Abrir lista mobile | Horário exibido como 13:00 |
| 3.1.4 | `Agenda.tsx` | Mesmo cenário | Abrir página de agenda | Aula listada às 13:00 com label do fuso |
| 3.1.5 | `Historico.tsx` | Aula concluída no passado | Abrir histórico | Data/hora formatada no fuso do perfil |
| 3.1.6 | `Inbox` (NotificationItem) | Notificação com timestamp | Abrir inbox | Hora da notificação no fuso do perfil |
| 3.1.7 | `ClassReportView` | Relatório de aula | Visualizar relatório | Data/hora do relatório no fuso do perfil |
| 3.1.8 | `ArchivedDataViewer` | Dados arquivados | Abrir visualizador | Timestamps no fuso do perfil |
| 3.1.9 | `CancellationModal` | Cancelar aula | Abrir modal | Data/hora da aula no fuso do perfil |
| 3.1.10 | `ClassReportModal` | Criar relatório | Abrir modal | Data da aula no fuso do perfil |

### 3.2 Campos do tipo `date` (sem hora)

| # | Campo | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|---|
| 3.2.1 | `due_date` em faturas | Fatura com `due_date = '2026-03-15'`; professor em NY | Abrir lista de faturas | Exibe **15/03/2026** (sem shift para 14/03) |
| 3.2.2 | `birth_date` em dependentes | Dependente com `birth_date = '2015-06-01'` | Abrir perfil do dependente | Exibe **01/06/2015** |
| 3.2.3 | `expense_date` | Despesa com `expense_date = '2026-02-28'` | Abrir lista de despesas | Exibe **28/02/2026** |
| 3.2.4 | `due_date` no Recibo | Fatura paga com `due_date = '2026-03-01'` | Abrir recibo (`/recibo/:id`) | Exibe **01/03/2026** |

### Passo a passo — Teste 3.1.1

1. No Supabase, criar/verificar uma aula com `class_date = '2026-03-10T17:00:00+00:00'` para o professor de teste.
2. Garantir que `profiles.timezone = 'America/New_York'` para esse professor.
3. Fazer login como o professor.
4. Navegar para **Agenda** → visualização de calendário.
5. Localizar a aula do dia 10/03.
6. Confirmar que o horário exibido é **13:00** (UTC-4 em março = EDT).
7. Alterar `profiles.timezone` para `'America/Sao_Paulo'` no banco.
8. Recarregar a página.
9. Confirmar que o horário agora exibe **14:00** (UTC-3 = BRT).

### Passo a passo — Teste 3.2.1

1. No Supabase, criar uma fatura com `due_date = '2026-03-15'` (campo tipo `date`).
2. Fazer login como professor em `America/New_York`.
3. Navegar para **Faturas**.
4. Confirmar que a data de vencimento exibe **15/03/2026**.
5. Alterar timezone para `Pacific/Auckland` (UTC+13).
6. Recarregar — confirmar que **continua** 15/03/2026 (sem shift).

---

## 4. Input Parsing de Formulários

> **Regra**: Ao submeter um formulário com data/hora, o sistema deve interpretar o input no fuso do **perfil** (não do browser), usando `fromUserZonedTime`.

| # | Formulário | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|---|
| 4.1 | `ClassForm` | Professor com `timezone = 'America/New_York'`; browser em BRT | Criar aula para 10/03 às 14:00 | `class_date` gravado como `2026-03-10T18:00:00Z` (14:00 EDT = 18:00 UTC), **não** `2026-03-10T17:00:00Z` (14:00 BRT) |
| 4.2 | `Agenda.tsx` (criação rápida) | Mesmo cenário | Criar aula via agenda | Mesmo resultado: UTC reflete o fuso do perfil |
| 4.3 | `ClassExceptionForm` | Professor em NY; exceção para 15/03 às 10:00 | Criar exceção | `new_start_time` interpreta 10:00 como horário de NY |
| 4.4 | `FutureClassExceptionForm` | Mesmo cenário | Criar exceção futura | Idem |
| 4.5 | `AvailabilityManager` (bloqueios) | Professor em NY | Criar bloqueio de 09:00 a 12:00 no dia 20/03 | `start_datetime` e `end_datetime` gravados em UTC com offset de NY |
| 4.6 | `StudentScheduleRequest` | Aluno em Lisboa; professor em BRT | Solicitar aula às 15:00 | Timestamp gravado reflete 15:00 no fuso de Lisboa (15:00 UTC+0 = 15:00Z em março) |
| 4.7 | `ClassForm` (Hora Inexistente - DST Spring Forward) | Professor em `America/New_York`; dia da virada DST (2º domingo de março) | Criar aula às 02:30 AM | `date-fns-tz` (`fromZonedTime`) faz shift automático para 03:30 AM local (07:30 UTC). O sistema **não** deve gravar 02:30 (hora que não existe). Verificar no banco que o UTC gravado corresponde a 03:30 EDT. |

### Passo a passo — Teste 4.7 (Hora Inexistente durante DST)

1. No Supabase, definir `profiles.timezone = 'America/New_York'` para o professor.
2. Identificar a data do "Spring Forward" (2º domingo de março, ex: 08/03/2026).
3. Fazer login e criar uma aula para esse dia às **02:30 AM**.
4. Submeter o formulário.
5. No Supabase, verificar o `class_date`:
   ```sql
   SELECT class_date FROM classes WHERE teacher_id = '<id>' ORDER BY created_at DESC LIMIT 1;
   ```
6. **Esperado**: O timestamp UTC corresponde a **03:30 EDT** (07:30 UTC), pois `fromZonedTime` avança automaticamente a hora inexistente.
7. **Falha se**: O UTC gravado corresponder a 02:30 EST (07:30 UTC — coincidência numérica neste caso, mas verificar que o frontend não exibe "02:30" ao reabrir).

### Passo a passo — Teste 4.1 (Cenário Crítico: Professor Viajando)

1. No Supabase, definir `profiles.timezone = 'America/New_York'` para o professor.
2. Configurar o **browser** para `America/Sao_Paulo` (simula viagem ao Brasil).
3. Fazer login como professor.
4. Navegar para **Agenda** → criar nova aula.
5. Selecionar data: 10/03/2026, hora: 14:00.
6. Submeter.
7. No Supabase, verificar o `class_date`:
   ```sql
   SELECT class_date FROM classes WHERE teacher_id = '<id>' ORDER BY created_at DESC LIMIT 1;
   ```
8. **Esperado**: `2026-03-10T18:00:00+00:00` (14:00 em NY = UTC-4 em março).
9. **Falha se**: `2026-03-10T17:00:00+00:00` (significaria que usou o fuso do browser BRT).

---

## 5. Billing Automatizado (Hourly Sweeper)

### 5.1 RPC `get_relationships_to_bill_now`

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 5.1.1 | Professor A em `America/Sao_Paulo` (03:00 local); Professor B em `America/New_York` (01:00 local) | Cron dispara às 06:00 UTC | Ambos retornados pela RPC (hora local ≥ 01:00) |
| 5.1.2 | Professor C em `Pacific/Auckland` (19:00 local do dia anterior) | Cron dispara às 06:00 UTC | Professor C **não** retornado (hora local < 01:00 do dia seguinte) |
| 5.1.3 | Professor A já faturado hoje | Cron dispara novamente às 07:00 UTC | Professor A **não** retornado (idempotência via `NOT EXISTS`) |

### 5.2 `getDueDateString`

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 5.2.1 | Professor com `payment_due_days = 7`, timezone `America/New_York`; cron roda às 05:00 UTC (01:00 NY) do dia 10/03 | Gerar `due_date` | `due_date = '2026-03-17'` (hoje em NY é 10/03 + 7 dias) |
| 5.2.2 | Mesmo cenário mas cron roda às 03:00 UTC (23:00 NY do dia 09/03, ainda dia 09/03 em NY) | Gerar `due_date` | `due_date = '2026-03-16'` (hoje em NY é 09/03 + 7 dias) |

### 5.3 Idempotência

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 5.3.1 | Cron rodou às 06:00 UTC e faturou Professor A | Cron roda novamente às 07:00 UTC | Zero faturas duplicadas para Professor A |
| 5.3.2 | Cron falhou às 06:00 UTC (timeout) | Cron roda às 07:00 UTC | Professor A é faturado normalmente (recuperação) |

### 5.4 Marcação de Faturas Vencidas (`check-overdue-invoices`)

> **Regra**: O "hoje" é calculado no fuso do professor via `getTodayInTimezone(teacherTz)`. Faturas só são marcadas como vencidas quando o dia local do professor ultrapassou o `due_date`.

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 5.4.1 | Fatura pendente com `due_date = '2026-03-10'`; Professor em `America/New_York` | Cron diário roda às 02:00 UTC do dia 11/03 (22:00 NY do dia 10/03) | Fatura **não** é marcada como `vencida` (para o professor, ainda é dia 10 e o cliente ainda tem 2 horas para pagar) |
| 5.4.2 | Mesmo cenário | Cron roda às 05:00 UTC do dia 11/03 (01:00 NY do dia 11/03) | Fatura **é** marcada como `vencida` |
| 5.4.3 | Fatura pendente com `due_date = '2026-03-10'`; Professor em `Pacific/Auckland` (UTC+13) | Cron roda às 10:00 UTC do dia 10/03 (23:00 NZ do dia 10/03) | Fatura **não** é marcada como `vencida` |
| 5.4.4 | Mesmo cenário NZ | Cron roda às 11:00 UTC do dia 10/03 (00:00 NZ do dia 11/03) | Fatura **é** marcada como `vencida` |

### Passo a passo — Teste 5.4.1

1. No Supabase, criar uma fatura com `due_date = '2026-03-10'` e `status = 'pendente'` para o professor de teste.
2. Configurar `profiles.timezone = 'America/New_York'` para o professor.
3. Invocar `check-overdue-invoices` manualmente simulando o horário de 02:00 UTC do dia 11/03.
4. Verificar que o `status` da fatura permanece `pendente`.
5. Invocar novamente simulando 05:00 UTC do dia 11/03.
6. Verificar que o `status` mudou para `vencida`.

### Passo a passo — Teste 5.2.1

1. No Supabase, configurar professor com:
   - `timezone = 'America/New_York'`
   - `payment_due_days = 7`
   - Pelo menos 1 relationship ativa com aulas completadas não faturadas.
2. Invocar a edge function `automated-billing` manualmente (ou via cURL) às 05:00 UTC.
3. Verificar a fatura gerada:
   ```sql
   SELECT due_date, description FROM invoices
   WHERE teacher_id = '<id>' ORDER BY created_at DESC LIMIT 1;
   ```
4. **Esperado**: `due_date = '2026-03-17'` e `description` contém datas formatadas no fuso de NY.

---

## 6. Edge Functions de Notificação

> **Regra**: E-mails devem formatar datas no fuso do **destinatário** e incluir o acrónimo do fuso.

| # | Edge Function | Destinatário | Pré-condição | Resultado Esperado |
|---|---|---|---|---|
| 6.1 | `send-class-reminders` | Aluno em `Europe/Lisbon` | Aula às 17:00 UTC | E-mail exibe "18:00 WEST" (UTC+1 em horário de verão) ou "17:00 WET" (inverno) |
| 6.2 | `send-class-confirmation-notification` | Aluno em `America/New_York` | Aula confirmada às 20:00 UTC | E-mail exibe "16:00 EDT" (março) |
| 6.3 | `send-cancellation-notification` | Aluno em Lisboa; Professor em BRT | Professor cancela aula das 14:00 BRT | E-mail do aluno exibe "17:00 WET"; e-mail do professor exibe "14:00 BRT" |
| 6.4 | `send-class-report-notification` | Aluno em `Asia/Tokyo` | Relatório de aula que foi às 10:00 UTC | E-mail exibe "19:00 JST" |
| 6.5 | `send-invoice-notification` | Aluno em `Europe/Lisbon` | Fatura gerada com `due_date = '2026-03-15'` | E-mail exibe "15/03/2026" (campo date, sem shift) |
| 6.6 | `send-boleto-subscription-notification` | Aluno em BRT | Boleto gerado | E-mail exibe datas em BRT |
| 6.7 | `send-class-request-notification` | Professor em `America/New_York` | Aluno solicita aula às 18:00 UTC | E-mail do professor exibe "14:00 EDT" |
| 6.8 | `send-material-shared-notification` | Aluno em `Europe/Berlin` | Material compartilhado | Timestamp no e-mail em CET/CEST |
| 6.9 | `send-student-invitation` | Aluno novo | Convite enviado | E-mail sem horários específicos (apenas boas-vindas) — sem risco de shift |
| 6.10 | `generate-teacher-notifications` | Professor em NY | Notificações geradas | Datas no inbox usam fuso do professor |

### Passo a passo — Teste 6.3

1. Configurar:
   - Professor: `timezone = 'America/Sao_Paulo'`
   - Aluno: `timezone = 'Europe/Lisbon'`
   - Aula: `class_date = '2026-03-10T17:00:00Z'` (14:00 BRT = 17:00 WET)
2. Cancelar a aula (via UI ou edge function `process-cancellation`).
3. Verificar os logs da edge function `send-cancellation-notification`:
   ```
   supabase functions logs send-cancellation-notification --tail
   ```
4. No e-mail enviado ao **aluno**: confirmar que a data exibe "17:00 WET" ou "17:00 (Horário de Lisboa)".
5. No e-mail enviado ao **professor**: confirmar que exibe "14:00 BRT" ou "14:00 (Horário de Brasília)".

---

## 7. RPCs PostgreSQL

> **Regra**: Todas as RPCs que fazem cálculos baseados em mês/dia devem receber `p_timezone` e usar `AT TIME ZONE`.

| # | RPC | Parâmetros de Teste | Resultado Esperado |
|---|---|---|---|
| 7.1 | `count_completed_classes_in_month` | `p_timezone = 'America/New_York'`, `p_month = 3`, `p_year = 2026`; aula em `2026-03-01T04:30:00Z` | Aula contada em **fevereiro** em NY (00:30 do dia 28/02 EST), mas em **março** em BRT (01:30 do dia 01/03) |
| 7.2 | `get_student_subscription_details` | `p_timezone = 'Pacific/Auckland'` | Datas de ciclo calculadas com base no fuso NZ |
| 7.3 | `get_billing_cycle_dates` | `p_timezone = 'America/New_York'`, `p_billing_day = 1` | `cycle_start` = `2026-03-01` em NY (não em UTC) |
| 7.4 | `get_teacher_notifications` | `p_timezone = 'Europe/London'` | Notificações do "hoje" calculadas no fuso de Londres |
| 7.5 | `get_student_active_subscription` | `p_timezone = 'Asia/Tokyo'` | Datas de expiração avaliadas no fuso de Tokyo |

### 7.6 Agregações do Dashboard (`startOfMonthTz`)

> **Regra**: O Dashboard calcula receita mensal, despesas e pendências usando `startOfMonthTz(date, userTimezone)` para determinar o início/fim do mês no fuso do perfil.

| # | Pré-condição | Ação | Resultado Esperado |
|---|---|---|---|
| 7.6.1 | Pagamento registado em `2026-03-31T23:00:00Z`; Professor em `America/Sao_Paulo` (BRT = 20:00 do dia 31/03) | Abrir Dashboard → Resumo de Março | Pagamento **incluído** na receita de março |
| 7.6.2 | Mesmo pagamento; Professor com `timezone = 'Europe/Lisbon'` (WET = 00:00 do dia 01/04) | Abrir Dashboard → Resumo de Março | Pagamento **não** incluído em março; aparece em abril |
| 7.6.3 | Despesa com `expense_date = '2026-03-01'`; `created_at = '2026-03-01T02:00:00Z'`; Professor em `America/New_York` (22:00 do dia 28/02) | Abrir Dashboard → Resumo de Março | Despesa incluída em março (campo `expense_date` é tipo `date`, sem shift) |

### Passo a passo — Teste 7.6.2

1. No Supabase, inserir uma fatura paga com `created_at = '2026-03-31T23:00:00Z'` e `status = 'pago'`.
2. Definir `profiles.timezone = 'Europe/Lisbon'` para o professor.
3. Fazer login e abrir o Dashboard.
4. Verificar que a receita de **março** não inclui esse pagamento.
5. Navegar para **abril** — confirmar que o pagamento aparece lá.
6. Alterar `profiles.timezone = 'America/Sao_Paulo'` e recarregar.
7. Verificar que agora o pagamento aparece em **março**.

### Passo a passo — Teste 7.1 (Caso Crítico: Aula na Fronteira de Mês)

1. Criar uma aula completada com `class_date = '2026-03-01T04:30:00+00:00'`.
2. Executar a RPC com fuso de NY:
   ```sql
   SELECT * FROM count_completed_classes_in_month(
     p_teacher_id := '<id>',
     p_student_id := '<student_id>',
     p_month := 3,
     p_year := 2026,
     p_timezone := 'America/New_York'
   );
   ```
3. **Esperado**: A aula **não** é contada em março (em NY, 04:30 UTC = 23:30 do dia 28/02).
4. Executar com fuso BRT:
   ```sql
   SELECT * FROM count_completed_classes_in_month(
     p_teacher_id := '<id>',
     p_student_id := '<student_id>',
     p_month := 3,
     p_year := 2026,
     p_timezone := 'America/Sao_Paulo'
   );
   ```
5. **Esperado**: A aula **é** contada em março (em BRT, 04:30 UTC = 01:30 do dia 01/03).

---

## 8. Cenários Transversais

### 8.1 Professor Viajando

| # | Cenário | Ação | Resultado Esperado |
|---|---|---|---|
| 8.1.1 | Professor com perfil `America/New_York`, browser em `America/Sao_Paulo` | Criar aula às 14:00 | Gravada como 14:00 NY (18:00 UTC), não 14:00 BRT (17:00 UTC) |
| 8.1.2 | Mesmo cenário | Visualizar calendário | Aulas exibidas em horário de NY |
| 8.1.3 | Mesmo cenário | Toast de sincronização aparece | Opção de "Manter" preserva o fuso de NY |

### 8.2 Horário de Verão (DST)

| # | Cenário | Ação | Resultado Esperado |
|---|---|---|---|
| 8.2.1 | Aula recorrente semanal às 14:00 NY; DST inicia em 08/03 | Verificar aula de 15/03 | Continua às 14:00 NY (agora 18:00 UTC em vez de 19:00 UTC) |
| 8.2.2 | Professor em `America/Sao_Paulo`; DST do Brasil (se aplicável) | Verificar aulas durante transição | Horários locais mantidos |
| 8.2.3 | **DST na Materialização de Aulas Virtuais**: Professor em `America/New_York` cria aula recorrente semanal às 14:00 com início em 01/03 (antes do Spring Forward) e fim em 30/03 (depois) | Visualizar calendário no dia 15/03 (após DST) | Aula materializada exibida às **14:00 NY**. Internamente, o UTC gravado/calculado deve ter mudado de `19:00 UTC` (pré-DST, EST) para `18:00 UTC` (pós-DST, EDT) para manter a hora local |

### Passo a passo — Teste 8.2.3 (DST na Materialização)

1. Definir `profiles.timezone = 'America/New_York'` para o professor.
2. Criar uma aula recorrente semanal às **14:00** com data de início **01/03/2026** e fim **30/03/2026**.
3. Verificar a aula gerada para **08/03** (último dia antes do DST):
   - Deve estar às 14:00 NY = **19:00 UTC** (EST, UTC-5).
4. Verificar a aula gerada para **15/03** (primeiro após DST):
   - Deve estar às 14:00 NY = **18:00 UTC** (EDT, UTC-4).
5. **Falha se**: A aula de 15/03 aparece às **15:00 NY** (significaria que o sistema somou 7 dias ao UTC sem compensar o DST).

### 8.3 Disponibilidade Cross-Timezone

| # | Cenário | Ação | Resultado Esperado |
|---|---|---|---|
| 8.3.1 | Professor em BRT com horário 08:00-18:00; aluno em `Europe/Lisbon` | Aluno abre solicitação de aula | Slots exibidos como 11:00-21:00 (UTC+0 → BRT+3) no fuso de Lisboa |
| 8.3.2 | Professor em `America/New_York` com horário 09:00-17:00; aluno em BRT | Aluno abre solicitação | Slots convertidos para o fuso BRT do aluno |
| 8.3.3 | **Backend Constraint (Soft Check)**: Professor em `America/New_York` (Expediente 09:00-17:00 local). | Aluno (via UI ou API) envia request para uma aula às 12:00 UTC (08:00 NY — fora do expediente) | A edge function `request-class` **loga um aviso** (soft check) indicando que o horário está fora do expediente do professor, mas **não bloqueia** o request. Verificar nos logs da função que o aviso aparece. |

### Passo a passo — Teste 8.3.3

1. Configurar professor com `timezone = 'America/New_York'` e `working_hours` de 09:00-17:00.
2. Fazer login como aluno e solicitar uma aula para as **12:00 UTC** (08:00 NY).
3. Verificar nos logs da edge function `request-class`:
   ```
   supabase functions logs request-class --tail
   ```
4. **Esperado**: Log de aviso contendo "outside working hours" ou similar.
5. **Confirmar**: O request foi criado com sucesso (comportamento atual: soft check, não hard block).

### 8.4 Campos `date` Nunca Sofrem Shift

| # | Cenário | Ação | Resultado Esperado |
|---|---|---|---|
| 8.4.1 | `due_date = '2026-01-01'`; professor em `Pacific/Auckland` (UTC+13) | Visualizar fatura | Exibe **01/01/2026**, não 31/12/2025 ou 02/01/2026 |
| 8.4.2 | `birth_date = '2000-12-31'`; qualquer fuso | Visualizar dependente | Exibe **31/12/2000** |
| 8.4.3 | Criar fatura manual com vencimento 15/03 | Professor em `Pacific/Honolulu` (UTC-10) | `due_date` gravado como `'2026-03-15'` (string, sem conversão UTC) |

### 8.5 Motor de Aulas Recorrentes (`end-recurrence` e `materialize-virtual-class`)

> **Regra**: Ambas as Edge Functions utilizam o fuso do professor para determinar fronteiras de data. `end-recurrence` usa `localDateToUtcMidnight` para converter a data de término. `materialize-virtual-class` usa `getNowInTimezone` para avaliar expiração de templates.

| # | Cenário | Ação | Resultado Esperado |
|---|---|---|---|
| 8.5.1 | **`end-recurrence` (Fronteira de Data)**: Aula ocorreu ontem às 22:00 BRT (`01:00 UTC de hoje`). Professor em BRT encerra a recorrência com `endDate` = "hoje". | Clicar em "Encerrar Recorrência" | A aula das 22:00 de ontem **não** é apagada (mesmo que no UTC dessa aula já fosse "hoje"). Apenas aulas estritamente futuras no fuso local são limpas. |
| 8.5.2 | **`materialize-virtual-class` (Expiração Prematura)**: Template com `recurrence_end_date = '2026-03-15'`. Professor em `Pacific/Honolulu` (UTC-10). Hoje é dia 15 em UTC, mas dia 14 no Hawaii. | Aluno visualiza calendário ou sistema tenta materializar aula do dia 15. | O template **ainda gera instâncias virtuais**, pois para o professor a data limite ainda não expirou. |
| 8.5.3 | Mesmo cenário 8.5.2, mas agora é dia 15 no Hawaii (dia 16 em UTC). | Sistema tenta materializar aula do dia 16. | O template **não** gera instâncias — a data limite expirou no fuso do professor. |

### Passo a passo — Teste 8.5.1

1. No Supabase, configurar professor com `timezone = 'America/Sao_Paulo'`.
2. Criar uma aula template recorrente com uma instância materializada para ontem às 22:00 BRT (`class_date = 'ontem T 01:00:00Z'` — que em UTC já é "hoje").
3. Na UI, clicar em "Encerrar Recorrência" e definir `endDate` = data de hoje.
4. Verificar no banco:
   ```sql
   SELECT id, class_date, status FROM classes
   WHERE class_template_id = '<template_id>' ORDER BY class_date;
   ```
5. **Esperado**: A aula de ontem às 22:00 BRT ainda existe. Apenas aulas com data local futura foram removidas.

### Passo a passo — Teste 8.5.2

1. No Supabase, criar um template com `recurrence_end_date = '2026-03-15'` para professor com `timezone = 'Pacific/Honolulu'`.
2. Invocar `materialize-virtual-class` simulando a data atual como `2026-03-15T08:00:00Z` (que em Honolulu = 14/03 22:00).
3. **Esperado**: A materialização ocorre normalmente (template ainda válido no fuso do professor).
4. Invocar novamente com data `2026-03-16T10:00:00Z` (que em Honolulu = 16/03 00:00).
5. **Esperado**: Template expirado, nenhuma instância gerada.

---

## 9. Checklist de Regressão Rápida

Antes de cada release, executar estes testes mínimos:

- [ ] **Signup**: Novo utilizador → `profiles.timezone` preenchido corretamente
- [ ] **Toast de sync**: Login com browser em fuso diferente → toast aparece
- [ ] **Calendário**: Aula exibida no fuso do perfil (não do browser)
- [ ] **Criar aula**: Horário gravado em UTC com offset do perfil
- [ ] **Hora inexistente (DST)**: Aula criada às 02:30 durante Spring Forward → shift automático para 03:30
- [ ] **Fatura due_date**: Campo `date` sem shift em qualquer fuso
- [ ] **Billing automático**: `getDueDateString` retorna data no fuso do professor
- [ ] **Faturas vencidas**: `check-overdue-invoices` respeita o "hoje" no fuso do professor
- [ ] **E-mail de cancelamento**: Destinatário vê horário no seu fuso
- [ ] **RPC de contagem mensal**: `p_timezone` altera corretamente a contagem na fronteira de mês
- [ ] **Dashboard agregações**: Receita mensal calculada com `startOfMonthTz` no fuso do perfil
- [ ] **DST materialização**: Aulas virtuais mantêm hora local após cruzar fronteira do DST
- [ ] **end-recurrence**: Não apaga aulas do dia anterior no fuso local (mesmo que UTC já seja "hoje")
- [ ] **materialize-virtual-class**: Expiração de template avaliada no fuso do professor

---

## 10. Ferramentas de Teste

| Ferramenta | Uso |
|---|---|
| **Chrome DevTools → Sensors → Location** | Override de timezone do browser para testes 2.x e 4.x |
| **Supabase SQL Editor** | Executar RPCs e verificar dados gravados (testes 5.x, 7.x) |
| **`supabase functions logs <name> --tail`** | Verificar logs de edge functions (testes 6.x) |
| **Supabase Auth → Users** | Verificar `profiles.timezone` após signup (testes 1.x) |
| **Mailpit / SES Sandbox** | Verificar conteúdo dos e-mails (testes 6.x) |
| **`curl` para edge functions** | Invocar billing e notificações manualmente (testes 5.x, 6.x) |
