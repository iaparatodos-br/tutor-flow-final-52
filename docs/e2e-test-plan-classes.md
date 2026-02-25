# Plano de Testes E2E — Aulas (MVP)

> **Objetivo:** Testar exaustivamente todos os cenários de aulas antes do lançamento do MVP.
> **Última atualização:** 2026-02-25

---

## Matriz de Eixos

### Tipos de Aula

| Código | Tipo                                    |
| ------ | --------------------------------------- |
| T1     | Individual (1 aluno)                    |
| T2     | Individual com Dependente               |
| T3     | Grupo (múltiplos alunos)                |
| T4     | Grupo misto (alunos + dependentes)      |

### Recorrência

| Código | Tipo                  |
| ------ | --------------------- |
| R0     | Aula avulsa           |
| R1     | Recorrência finita    |
| R2     | Recorrência infinita  |

### Modelo de Cobrança

| Código | Tipo                 |
| ------ | -------------------- |
| C0     | Gratuita             |
| C1     | Pós-pago (postpaid)  |
| C2     | Pré-pago (prepaid)   |

### Ações / Situações

| Código | Situação                                              |
| ------ | ----------------------------------------------------- |
| S1     | Agendamento pelo professor                            |
| S2     | Solicitação pelo aluno                                |
| S3     | Cancelamento pelo professor                           |
| S4     | Cancelamento pelo aluno                               |
| S5     | Cancelamento pelo responsável (dependente)            |
| S6     | Confirmação de aula                                   |
| S7     | Conclusão de aula                                     |
| S8     | Relatório de aula                                     |
| S9     | Anistia                                               |
| S10    | Cancelar ocorrência recorrente (esta / esta e futuras)|
| S11    | Encerrar recorrência                                  |
| S12    | Faturamento automatizado                              |
| S13    | Faturamento manual                                    |

---

## Checklist de Testes

### Prioridade Alta — Fluxos Críticos

| #  | Cenário                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| 1  | T1+R0+C1+S1: Individual avulsa paga, prof agenda  | [ ]    |       |
| 2  | T1+R0+C1+S7: Concluir aula individual paga        | [ ]    |       |
| 3  | T1+R0+C1+S3: Professor cancela individual paga    | [ ]    |       |
| 4  | T1+R0+C1+S4: Aluno cancela (dentro do prazo)      | [ ]    |       |
| 5  | T1+R0+C1+S4: Aluno cancela (fora do prazo)        | [ ]    |       |
| 6  | T1+R0+C1+S9: Anistia após cancel tardio           | [ ]    |       |
| 7  | T1+R0+C1+S8: Criar relatório de aula              | [ ]    |       |
| 8  | T1+R0+C1+S12: Faturamento automático pós-pago     | [ ]    |       |
| 9  | T1+R1+C1+S1: Recorrência finita paga              | [ ]    |       |
| 10 | T1+R2+C1+S1: Recorrência infinita paga            | [ ]    |       |
| 11 | T1+R2+C1+S10: Cancelar 1 ocorrência recorrente    | [ ]    |       |
| 12 | T1+R2+C1+S10: Cancelar esta e futuras             | [ ]    |       |
| 13 | T1+R2+C1+S11: Encerrar recorrência                | [ ]    |       |
| 14 | T2+R0+C1+S1: Individual com dependente            | [ ]    |       |
| 15 | T2+R0+C1+S5: Responsável cancela aula dependente  | [ ]    |       |
| 16 | T2+R0+C1+S12: Fatura consolida no responsável     | [ ]    |       |
| 17 | T3+R0+C1+S1: Aula em grupo paga                   | [ ]    |       |
| 18 | T3+R0+C1+S4: Cancel parcial (1 aluno sai)         | [ ]    |       |
| 19 | T3+R0+C1+S8: Relatório grupo (feedback individual)| [ ]    |       |
| 20 | T1+R0+C0+S1: Aula gratuita                        | [ ]    |       |
| 21 | T1+R0+C1+S6: Confirmar aula individual             | [ ]    |       |
| 22 | T3+R0+C1+S7: Concluir aula em grupo                | [ ]    |       |
| 23 | T2+R0+C1+S7: Concluir aula com dependente          | [ ]    |       |
| 24 | T3+R0+C1+S3: Professor cancela grupo inteiro       | [ ]    |       |

### Prioridade Média

| #  | Cenário                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| 25 | T1+R0+C2+S1: Pré-paga individual                  | [ ]    |       |
| 26 | T1+R0+C2+S4: Aluno cancela pré-paga               | [ ]    |       |
| 27 | T4+R0+C1+S1: Grupo misto (alunos + dependentes)   | [ ]    |       |
| 28 | T4+R0+C1+S4: Cancel parcial grupo misto           | [ ]    |       |
| 29 | T1+R0+C1+S2: Aluno solicita aula                  | [ ]    |       |
| 30 | T2+R0+C1+S2: Aluno solicita p/ dependente         | [ ]    |       |
| 31 | T3+R1+C1+S1: Grupo com recorrência finita         | [ ]    |       |
| 32 | T1+R0+C1+S13: Fatura manual                       | [ ]    |       |
| 33 | T2+R0+C1+S13: Fatura manual p/ dependente         | [ ]    |       |
| 34 | T1+R0+C1+S9: Anistia já faturada (botão disabled) | [ ]    |       |
| 35 | T3+R0+C1+S9: Anistia grupo (só afeta 1 aluno)     | [ ]    |       |
| 36 | T2+R0+C1+S8: Relatório aula com dependente         | [ ]    |       |
| 37 | T1+R0+C0+S3: Cancelar aula gratuita (sem cobrança) | [ ]    |       |
| 38 | T1+R0+C0+S4: Aluno cancela gratuita (sem cobrança) | [ ]    |       |
| 39 | T3+R2+C1+S1: Grupo com recorrência infinita        | [ ]    |       |
| 40 | T2+R0+C1+S9: Anistia em aula com dependente        | [ ]    |       |

### Prioridade Baixa — Edge Cases

| #  | Cenário                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| 41 | Agendar no passado (warning exibido)               | [ ]    |       |
| 42 | Conflito de horário (mensagem de erro)             | [ ]    |       |
| 43 | Grupo sem plano premium (bloqueio FeatureGate)     | [ ]    |       |
| 44 | Pré-pago + recorrência (bloqueio)                  | [ ]    |       |
| 45 | T2+R2+C1+S1: Dependente com recorrência infinita   | [ ]    |       |
| 46 | Cancelar todos participantes de grupo              | [ ]    |       |
| 47 | Relatório com fotos (upload/delete)                | [ ]    |       |
| 48 | Limite de alunos do plano atingido                 | [ ]    |       |
| 49 | Duração customizada (15-480 min, validação)        | [ ]    |       |
| 50 | Notificações disparadas em cada cenário            | [ ]    |       |
| 51 | T1+R1+C1+S1: Recorrência quinzenal (frequência)    | [ ]    |       |
| 52 | T1+R1+C1+S1: Recorrência mensal (frequência)       | [ ]    |       |

---

## Como Testar Cada Cenário

1. **Agendar** a aula (ou solicitar, dependendo do caso)
2. **Verificar** no calendário que aparece corretamente
3. **Executar a ação** (cancelar, concluir, criar relatório, etc.)
4. **Verificar o resultado** (status atualizado, fatura criada, notificação enviada)
5. **Verificar integridade** (dados no banco, nenhum erro no console)

---

## Arquivos Principais Envolvidos

| Arquivo                                              | Responsabilidade            |
| ---------------------------------------------------- | --------------------------- |
| `src/components/ClassForm/ClassForm.tsx`             | Agendamento                 |
| `src/components/Calendar/CalendarView.tsx`           | Visualização                |
| `src/components/CancellationModal.tsx`               | Cancelamento                |
| `src/components/AmnestyButton.tsx`                   | Anistia                     |
| `src/components/ClassReportModal.tsx`                | Relatório                   |
| `src/components/StudentScheduleRequest.tsx`          | Solicitação pelo aluno      |
| `src/components/RecurringClassActionModal.tsx`        | Ações em aulas recorrentes  |
| `supabase/functions/process-cancellation/index.ts`   | Backend cancelamento        |
| `supabase/functions/automated-billing/index.ts`      | Faturamento automático      |

---

## Registro de Resultados

> Preencha a coluna **Notas** com observações, bugs encontrados ou confirmação de sucesso (✅ / ❌ + descrição).
