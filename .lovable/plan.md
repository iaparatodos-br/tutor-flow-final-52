

# Auditoria das Sugestões do Gemini (Rodada 2)

## Análise Ponto a Ponto

### Sugestões VÁLIDAS (a adicionar)

**1. Fall Back DST (4.8 - Hora Sobreposta)** — VÁLIDO.
O plano cobre Spring Forward (4.7) mas ignora Fall Back. Quando o relógio atrasa no 1º domingo de novembro (NY), 01:30 ocorre duas vezes. `fromZonedTime` do `date-fns-tz` resolve assumindo a primeira ocorrência (EDT). Vale documentar o comportamento esperado.

**2. Fusos fracionados (5.1.4 - Asia/Kolkata)** — VÁLIDO.
O plano só testa fusos inteiros. UTC+5:30 é um edge case real — 06:00 UTC = 11:30 local. A RPC `get_relationships_to_bill_now` com `AT TIME ZONE` suporta isso nativamente, mas vale ter o teste documentado.

**3. Visão do Aluno (3.1.11)** — VÁLIDO.
O `StudentDashboard.tsx` já importa `formatInTimezone` e `startOfMonthTz`, mas o plano de testes foca quase exclusivamente no professor. Adicionar teste de perspectiva do aluno.

**4. Mudança Definitiva de Fuso (2.7)** — VÁLIDO.
Cenário "professor se muda de país". O sistema armazena UTC, então alterar o perfil só deve mudar a exibição. Teste simples e de alto valor documental.

**5. Gravação de campos `date` via input (4.9)** — VÁLIDO.
O teste 8.4.3 cobre parcialmente, mas não testa o round-trip completo com browser em fuso extremo (Tokyo UTC+9 ou Honolulu UTC-10). Reforçar com teste explícito.

### Sugestões PARCIALMENTE VÁLIDAS

**6. Lembretes — timing do disparo (6.11)** — PARCIALMENTE VÁLIDO.
O `send-class-reminders` (L41-42) já usa `.gte("class_date", now.toISOString()).lte("class_date", tomorrow.toISOString())` — comparação puramente UTC. Funciona corretamente independente de timezone. Mas vale documentar que o disparo é UTC-based para evitar confusão.

**7. Date Range Filtering (7.7)** — BAIXO VALOR.
Não há date range pickers com filtros start/end nos relatórios — o Dashboard usa `startOfMonthTz` com mês fixo. Não existe a vulnerabilidade descrita. Anotar como cenário futuro.

### Sugestões INVÁLIDAS (não aplicáveis)

**8. Exportação CSV** — NÃO EXISTE. O sistema só tem import (StudentImportDialog). Sem feature de export, não há teste a fazer.

**9. iCal / .ics** — NÃO EXISTE. Nenhuma funcionalidade de exportação de calendário. Cenário futuro.

**10. DST Assimétrico (EUA vs Europa)** — JÁ COBERTO IMPLICITAMENTE. O sistema armazena tudo em UTC. O frontend converte usando o timezone do viewer. Quando EUA muda DST mas Europa não, o offset muda automaticamente via `date-fns-tz`. Não é um bug, é o comportamento correto por design. Mas vale como teste documental rápido.

**11. Stripe Webhooks (5.5)** — JÁ COBERTO pelo teste 7.6.1/7.6.2. Webhooks atualizam status de faturas que já foram criadas com datas corretas. A agregação no Dashboard (testada em 7.6) é onde o fuso importa, não no webhook em si.

**12. RLS com CURRENT_DATE** — VERIFICADO. As ocorrências de `CURRENT_DATE` estão apenas em **migrations de seed data** (scripts únicos de teste), não em policies RLS ativas. Sem risco.

## Plano de Alteração do Documento

Adicionar ao `docs/timezone-test-plan.md`:

1. **Seção 2.7**: Mudança definitiva de fuso (professor altera perfil, aulas existentes mudam exibição sem mutar UTC)
2. **Seção 3.1.11**: Perspectiva do aluno (StudentDashboard) com fuso diferente do professor
3. **Seção 4.8**: Fall Back DST (hora sobreposta, comportamento do `fromZonedTime`)
4. **Seção 4.9**: Round-trip de campos `date` com browser em fuso extremo
5. **Seção 5.1.4**: Fuso fracionado (Asia/Kolkata UTC+5:30)
6. **Seção 6.11**: Nota documental sobre timing UTC-based dos lembretes
7. **Atualizar checklist** (Seção 9) com os novos cenários

