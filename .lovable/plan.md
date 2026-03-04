

# Plano: Documento de Testes de Validação do Timezone Multi-Support

Criar o ficheiro `docs/timezone-test-plan.md` com cobertura completa dos cenários de teste, organizados por área funcional.

## Estrutura do Documento

O documento cobrirá **7 áreas de teste** com passo-a-passo detalhado:

1. **Registo e Detecção Automática** — Validar captura do timezone no signup (professor e aluno), fallback para `America/Sao_Paulo`, e persistência na coluna `profiles.timezone`.

2. **Sincronização de Timezone (useTimezoneSync)** — Testar o toast de atualização quando o browser muda de fuso, o comportamento do botão "Manter" com sessionStorage, e o seletor manual em Configurações > Perfil.

3. **Exibição de Datas no Frontend (40 componentes)** — Verificar que datas de aulas, faturas, recibos, calendário, inbox, histórico e materiais usam o fuso do perfil. Testar com professor em `America/New_York` e confirmar que horários refletem o fuso correto.

4. **Input Parsing de Formulários** — Validar que `ClassForm`, `Agenda`, `ClassExceptionForm`, `FutureClassExceptionForm` e `AvailabilityManager` gravam datas UTC corretas usando `fromUserZonedTime` do perfil (não do browser).

5. **Billing Automatizado (Hourly Sweeper)** — Testar a RPC `get_relationships_to_bill_now` com professores em fusos diferentes, validar idempotência (cron roda 2x na mesma hora), validar `getDueDateString` e `getBillingCycleDates` com timezone dinâmico.

6. **Edge Functions de Notificação** — Verificar que emails de lembrete, confirmação, cancelamento, relatório, fatura e boleto formatam datas no fuso do **destinatário** (aluno ou professor). Validar inclusão do acrónimo do fuso (ex: "BRT").

7. **RPCs PostgreSQL** — Validar que `count_completed_classes_in_month`, `get_student_subscription_details`, `get_billing_cycle_dates`, `get_teacher_notifications` e `get_student_active_subscription` retornam resultados corretos quando `p_timezone` é passado com fusos não-BRT.

## Cenários Transversais

- **Campos `date` (due_date, birth_date, expense_date)**: Nunca sofrem shift — o dia exibido é sempre o dia armazenado.
- **Professor viajando**: Timezone do perfil difere do browser — formulários devem usar o timezone do perfil.
- **DST**: Aulas recorrentes mantêm a hora local correta após mudança de horário de verão.
- **Disponibilidade cross-timezone**: Aluno em Lisboa vê slots do professor BRT convertidos para seu fuso.

## Implementação

Um único ficheiro markdown com ~300 linhas, organizado em secções com tabelas de "Pré-condição / Ação / Resultado Esperado" para cada teste.

