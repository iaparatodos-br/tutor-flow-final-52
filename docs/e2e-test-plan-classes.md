# Plano de Testes E2E Definitivo — Tutor Flow (Go-Live MVP)

> **Objetivo:** Homologação E2E manual cobrindo 84 fluxos de alto risco, integrações financeiras, segurança (RLS) e usabilidade antes do lançamento em produção.
> **Estratégia:** Abordagem orientada a risco. Regras lógicas exaustivas estão cobertas por testes de unidade. Este plano foca em Caminhos Críticos (Golden Paths) e Edge Cases.
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

## 🟢 Categoria 1: Fluxos Core — Individuais e Grupos Simples

| #  | Código           | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | ---------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 01 | T1+R0+C1+S1      | **Golden Path:** Agendar aula individual avulsa pós-paga, professor agenda, aluno visualiza. | [ ]    |       |
| 02 | T1+R0+C1+S6      | Aluno confirma presença na aula individual agendada pelo professor.                    | [ ]    |       |
| 03 | T1+R0+C1+S7      | Concluir aula individual pós-paga. Status na UI muda para "Concluída".                 | [ ]    |       |
| 04 | T1+R0+C1+S3      | Professor cancela aula individual. NÃO gera cobrança pendente.                         | [ ]    |       |
| 05 | T1+R0+C1+S4a     | Aluno cancela aula **dentro** do prazo de carência (sem taxa).                         | [ ]    |       |
| 06 | T1+R0+C1+S4b     | Aluno cancela aula **fora** do prazo de carência (taxa registrada).                    | [ ]    |       |
| 07 | T1+R0+C1+S9a     | Professor concede anistia após cancelamento tardio do aluno (taxa perdoada).           | [ ]    |       |
| 08 | T1+R0+C1+S8      | Criar relatório de aula individual, anexar notas, verificar envio de e-mail ao aluno.  | [ ]    |       |
| 09 | T1+R0+C1+S12     | Faturamento automático pós-pago de aula individual.                                    | [ ]    |       |
| 10 | T1+R0+C1+S2      | Aluno solicita aula via `StudentScheduleRequest`.                                      | [ ]    |       |
| 11 | T1+R0+C1+S13     | Fatura manual para aula individual.                                                    | [ ]    |       |
| 12 | T1+R0+C1+S9b     | Anistia já faturada (botão disabled).                                                  | [ ]    |       |
| 13 | T1+R0+C0+S1      | Agendar, concluir e gerar relatório de aula **gratuita** (C0). Nenhuma fatura gerada.  | [ ]    |       |
| 14 | T1+R0+C0+S3      | Professor cancela aula gratuita (sem cobrança).                                        | [ ]    |       |
| 15 | T1+R0+C0+S4      | Aluno cancela aula gratuita fora do prazo. Botão de anistia NÃO aparece.               | [ ]    |       |
| 16 | T3+R0+C1+S1      | Agendar aula em grupo simples (3 alunos adultos). Validar UI do calendário.            | [ ]    |       |
| 17 | T3+R0+C1+S6      | Confirmar aula em grupo (confirmar participação de cada aluno).                        | [ ]    |       |
| 18 | T3+R0+C1+S7      | Concluir aula em grupo. Todos os alunos recebem status de conclusão.                   | [ ]    |       |
| 19 | T3+R0+C1+S4      | Cancelamento parcial: 1 aluno do grupo cancela. Aula ativa para os outros 2.           | [ ]    |       |
| 20 | T3+R0+C1+S3      | Professor cancela grupo inteiro. Notificação para todos.                               | [ ]    |       |
| 21 | T3+R0+C1+S8      | Relatório de grupo: feedback privado para Aluno A + feedback geral.                    | [ ]    |       |
| 22 | T3+R0+C1+S9      | Anistia em grupo (só afeta 1 aluno).                                                   | [ ]    |       |
| 23 | T1+R0+C2+S1      | Pré-paga individual: agendar.                                                          | [ ]    |       |
| 24 | T1+R0+C2+S4      | Aluno cancela pré-paga.                                                                | [ ]    |       |

---

## 💳 Categoria 2: Integração Stripe & Risco Financeiro

| #  | Código               | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | -------------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 25 | C2+S1 (Stripe)       | **Checkout Pré-pago:** Concluir pagamento via redirect do Stripe Checkout (cartão teste). | [ ]    |       |
| 26 | C2+S4 (Stripe)       | Cancelamento dentro do prazo de aula pré-paga. Valor como crédito ou refund no Stripe. | [ ]    |       |
| 27 | C2+S9 (Stripe)       | Anistia de pré-paga: perdoar taxa de cancelamento tardio. Refund via Edge Function.    | [ ]    |       |
| 28 | S12 (Cron)           | **Fechamento Automático (Pós-pago):** Virada de mês agrupa aulas e gera fatura.       | [ ]    |       |
| 29 | S12 (Cron T3)        | Fechamento automático grupo: fatura proporcional por participante.                     | [ ]    |       |
| 30 | S13 (Manual)         | **Fatura Manual / Boleto:** Gerar fatura avulsa. Validar geração de PDF/Link do boleto.| [ ]    |       |
| 31 | Falha Pagto          | **Cartão Recusado:** Webhook `invoice.payment_failed` exibe `PaymentFailureModal`.     | [ ]    |       |
| 32 | Bloqueio             | Aluno inadimplente tenta agendar. Sistema bloqueia via `StudentSelectionBlocker`.      | [ ]    |       |
| 33 | Orphan Charges       | Processar taxas de cancelamento órfãs (`process-orphan-cancellation-charges`).         | [ ]    |       |
| 34 | Stripe Connect       | Onboarding do Tutor: fluxo KYC no Stripe Express via `StripeConnectOnboarding`.        | [ ]    |       |
| 35 | Assinatura           | Professor faz upgrade Basic → Pro usando cartão real (Test Mode).                      | [ ]    |       |
| 36 | Downgrade            | Professor solicita downgrade para Basic. Features travadas na virada do ciclo.         | [ ]    |       |
| 37 | Assinatura           | Expiração de assinatura do professor. App restringe acesso via `FinancialRouteGuard`.  | [ ]    |       |
| 38 | Overage              | Limite de alunos (`handle-student-overage`). Adicionar aluno além do plano → cobrança. | [ ]    |       |

---

## 👨‍👩‍👧 Categoria 3: Dependentes e Grupos Mistos

| #  | Código           | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | ---------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 39 | T2+R0+C1+S1      | Agendar aula individual para dependente (criança).                                     | [ ]    |       |
| 40 | T2+R0+C1+S2      | Solicitação de aula feita pelo responsável em nome do dependente.                      | [ ]    |       |
| 41 | T2+R0+C1+S5      | Responsável cancela aula do filho fora do prazo.                                       | [ ]    |       |
| 42 | T2+R0+C1+S7      | Concluir aula com dependente.                                                          | [ ]    |       |
| 43 | T2+R0+C1+S8      | Relatório de aula T2: feedback vinculado ao dependente, enviado ao responsável.         | [ ]    |       |
| 44 | T2+R0+C1+S9      | Anistia em aula com dependente.                                                        | [ ]    |       |
| 45 | T2+R0+C1+S12     | **Faturamento T2:** Fatura do dependente emitida no nome/CPF do responsável.           | [ ]    |       |
| 46 | T2+R0+C1+S13     | Fatura manual consolidando múltiplos dependentes (2 filhos na mesma fatura).           | [ ]    |       |
| 47 | T4+R0+C1+S1      | **Grupo Misto (T4):** Turma com 1 adulto + 1 dependente (pai paga).                   | [ ]    |       |
| 48 | T4+R0+C1+S4      | Cancelamento parcial T4: responsável tira filho. Adulto continua.                      | [ ]    |       |
| 49 | T4+R0+C1+S3      | Professor cancela grupo misto inteiro. Todos pagantes corretos notificados.            | [ ]    |       |
| 50 | T4+R0+C1+S12     | **Faturamento T4:** Adulto recebe sua fatura, responsável recebe a do filho.           | [ ]    |       |
| 51 | T4+R0+C1+S8      | Feedback em grupo misto: adulto recebe o dele, responsável recebe o do filho.          | [ ]    |       |

---

## 🔀 Categoria 4: Recorrência e Exceções (R1, R2)

| #  | Código           | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | ---------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 52 | T1+R1+C1+S1      | Agendar recorrência finita (ex: pacote de 10 aulas).                                   | [ ]    |       |
| 53 | T3+R1+C1+S1      | Grupo recorrência finita. 10 ocorrências aparecem no calendário de todos.              | [ ]    |       |
| 54 | T1+R2+C1+S1      | Agendar **recorrência infinita** (mensalidade).                                        | [ ]    |       |
| 55 | T3+R2+C1+S1      | Grupo com recorrência infinita.                                                        | [ ]    |       |
| 56 | T2+R2+C1+S1      | Recorrência infinita para dependente.                                                  | [ ]    |       |
| 57 | Edge Function    | `materialize-virtual-class`: avançar data, verificar materialização da próxima aula.   | [ ]    |       |
| 58 | T1+R2+C1+S10a    | **Cancelar 1 ocorrência:** feriado. Próxima semana intacta.                            | [ ]    |       |
| 59 | T1+R2+C1+S10b    | **Cancelar esta e futuras:** interromper série. Passadas ficam, futuras somem.          | [ ]    |       |
| 60 | Exceção Horário  | Alterar horário de UMA ocorrência na recorrência (remarcar de 14h pra 15h).            | [ ]    |       |
| 61 | T1+R2+C1+S11     | **Encerrar recorrência:** cancelar "assinatura" do aluno no meio do mês.               | [ ]    |       |
| 62 | Conflito R2      | Tentar agendar recorrência que sobrepõe outra existente. Deve bloquear.                | [ ]    |       |
| 63 | T1+R1+C1 (Quinz)| Recorrência quinzenal (frequência).                                                    | [ ]    |       |
| 64 | T1+R1+C1 (Mensal)| Recorrência mensal (frequência).                                                      | [ ]    |       |

---

## 🔐 Categoria 5: Segurança (RLS), Isolamento e Feature Gates

| #  | Regra            | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | ---------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 65 | RLS Isolamento   | Professor A tenta acessar via URL direta a página de faturas do Professor B.           | [ ]    |       |
| 66 | RLS Faturas      | Aluno A pega ID da fatura do Aluno B e tenta abrir no navegador.                       | [ ]    |       |
| 67 | RLS Dependente   | Responsável tenta ver relatório de aluno não vinculado a ele.                          | [ ]    |       |
| 68 | RLS Edição       | Aluno tenta `PATCH` na tabela de aulas para mudar preço (console). RLS bloqueia.       | [ ]    |       |
| 69 | Feature Gate     | Prof no plano Basic tenta criar Turma T3/T4 (Premium). Modal de Upgrade aparece.       | [ ]    |       |
| 70 | Validação API    | Enviar duração de aula negativa ou texto via API. Zod/Backend deve barrar (400).       | [ ]    |       |
| 71 | Bloqueio C2/R2   | Sistema não permite combinação Pré-Pago (C2) + Recorrência Infinita (R2).             | [ ]    |       |
| 72 | Perfil Fantasma  | Deletar aluno (`smart-delete-student`) com faturas pagas. Dados fiscais persistem.     | [ ]    |       |

---

## 🧭 Categoria 6: UX, Uploads, Notificações e Outros Fluxos

| #  | Componente       | Descrição do Teste E2E                                                                 | Status | Notas |
| -- | ---------------- | -------------------------------------------------------------------------------------- | ------ | ----- |
| 73 | Timezone         | Professor BR (GMT-3) agenda 10h. Aluno em Portugal (GMT+0) deve ver 13h na UI.         | [ ]    |       |
| 74 | Conflito UI      | Professor tenta colocar duas aulas no mesmo dia e horário. Toast de erro.              | [ ]    |       |
| 75 | UI Passado       | Agendar aula com data de ontem. Sistema alerta mas permite para registro retroativo.   | [ ]    |       |
| 76 | Storage PDF      | Anexar arquivo PDF de 4MB ao relatório de aula. Valida upload.                         | [ ]    |       |
| 77 | Storage Limite   | Tentar anexar arquivo > 10MB. Deve gerar erro amigável.                                | [ ]    |       |
| 78 | Storage Baixar   | Aluno baixa material PDF compartilhado pelo professor sem erros.                       | [ ]    |       |
| 79 | Emails           | Reenvio de convite ao aluno (`resend-student-invitation`). Aluno recebe link mágico.   | [ ]    |       |
| 80 | Notificações     | Cancelamento dispara notificação no sininho e e-mail.                                  | [ ]    |       |
| 81 | Reset Senha      | Fluxo "Esqueci minha senha" (`ResetPassword.tsx`). Token enviado e senha alterada.      | [ ]    |       |
| 82 | Impressão Recibo | Teclar Ctrl+P em `/recibo`. Menus laterais ocultos, layout limpo (`recibo.css`).       | [ ]    |       |
| 83 | Perfil Negócio   | Editar nome/logo do negócio (`BusinessProfilesManager`). Alteração reflete no recibo.  | [ ]    |       |
| 84 | Stripe Payout    | Verificar payout roteado para conta conectada (`refresh-stripe-connect-account`).      | [ ]    |       |

---

## Como Testar Cada Cenário

1. **Agendar** a aula (ou solicitar, dependendo do caso)
2. **Verificar** no calendário que aparece corretamente
3. **Executar a ação** (cancelar, concluir, criar relatório, etc.)
4. **Verificar o resultado** (status atualizado, fatura criada, notificação enviada)
5. **Verificar integridade** (dados no banco, nenhum erro no console)

---

## Arquivos Principais Envolvidos

| Arquivo                                                       | Responsabilidade            |
| ------------------------------------------------------------- | --------------------------- |
| `src/components/ClassForm/ClassForm.tsx`                      | Agendamento                 |
| `src/components/Calendar/CalendarView.tsx`                    | Visualização                |
| `src/components/CancellationModal.tsx`                        | Cancelamento                |
| `src/components/AmnestyButton.tsx`                            | Anistia                     |
| `src/components/ClassReportModal.tsx`                         | Relatório                   |
| `src/components/StudentScheduleRequest.tsx`                   | Solicitação pelo aluno      |
| `src/components/RecurringClassActionModal.tsx`                | Ações em aulas recorrentes  |
| `src/components/CreateInvoiceModal.tsx`                       | Fatura manual com boleto    |
| `src/components/StudentSelectionBlocker.tsx`                  | Bloqueio de inadimplente    |
| `src/components/StripeConnectOnboarding.tsx`                  | Onboarding KYC              |
| `src/components/FinancialRouteGuard.tsx`                      | Restrição por assinatura    |
| `src/components/FeatureGate.tsx`                              | Feature gates por plano     |
| `src/components/SystemHealthAlert.tsx`                        | Alertas de saúde            |
| `src/contexts/SubscriptionContext.tsx`                        | Detecção de payment failure |
| `supabase/functions/process-cancellation/index.ts`            | Backend cancelamento        |
| `supabase/functions/automated-billing/index.ts`               | Faturamento automático      |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Taxas órfãs             |
| `supabase/functions/handle-student-overage/index.ts`          | Overage de alunos           |
| `supabase/functions/smart-delete-student/index.ts`            | Exclusão segura             |
| `supabase/functions/materialize-virtual-class/index.ts`       | Materialização recorrente   |
| `src/pages/ResetPassword.tsx`                                | Recuperação de senha        |
| `src/pages/Recibo.tsx` / `src/pages/recibo.css`              | Impressão de recibo         |
| `src/components/BusinessProfilesManager.tsx`                 | Perfil de negócio           |
| `supabase/functions/refresh-stripe-connect-account/index.ts` | Refresh payout Connect      |

---

## Registro de Resultados

> Preencha a coluna **Notas** com observações, bugs encontrados ou confirmação de sucesso (✅ / ❌ + descrição).
