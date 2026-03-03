

# Plano de Timezone Multi-Support — v2.9

## Status Atual

O documento `docs/timezone-multi-support-implementation-plan.md` está na versão **2.9** e cobre todos os gaps identificados nas auditorias v2.7, v2.8 e v2.9.

## Gaps Resolvidos na v2.9

### Gap 1: `src/pages/Financeiro.tsx` — Query logic sem timezone
- Cálculo de `currentMonth` com `new Date().toISOString()` pode retornar mês errado
- Já estava listado para formatação visual, agora inclui o bug de lógica de query

### Gap 2: `src/hooks/useMonthlySubscriptions.ts` — 6x datas sem timezone
- 6 ocorrências de `new Date().toISOString().split('T')[0]` para `starts_at`/`ends_at`
- Data escrita no banco pode ser dia anterior para usuários em fusos positivos

## Contagem Total
- **31 componentes frontend** para migração
- **17 edge functions** para refatoração
- **7 RPCs** para adicionar `p_timezone`

## Próximo Passo
Iniciar execução pela Sequência de Execução Recomendada (Seção 8 do documento).
