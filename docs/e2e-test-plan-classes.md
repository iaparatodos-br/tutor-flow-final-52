# Plano de Testes E2E Definitivo — Tutor Flow (Go-Live MVP)

> **Objetivo:** Homologação E2E manual cobrindo **100 fluxos** de alto risco, integrações financeiras, segurança (RLS) e usabilidade antes do lançamento em produção.
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

## 💰 Categoria 7: Módulo Financeiro Detalhado

| #   | Código              | Descrição do Teste E2E                                                                          | Status | Notas |
| --- | ------------------- | ----------------------------------------------------------------------------------------------- | ------ | ----- |
| 85  | Fin+Dashboard       | Cards de resumo no painel Financeiro: Receitas Pendentes, Recebidas, Despesas e Lucro Líquido corretos. | [ ]    |       |
| 86  | Fin+TaxaStripe      | Alerta de transparência de taxa fixa R$ 3,49 por boleto. Cálculo de exemplo visível no painel.  | [ ]    |       |
| 87  | Fin+MarkPaid        | Marcar fatura pendente como paga manualmente (`cancel-payment-intent`). Status muda para "Paga", PI cancelado no Stripe. | [ ]    |       |
| 88  | Fin+MarkPaid+Sync   | Aula pré-paga marcada como paga manualmente sincroniza status da aula para "Confirmada" e participantes atualizados. | [ ]    |       |
| 89  | Fin+BoletoMin       | Criar fatura manual com valor < R$ 5,00. Sistema bloqueia com erro de validação (`MINIMUM_BOLETO_AMOUNT`). | [ ]    |       |
| 90  | Fin+BoletoMax       | Criar fatura manual com valor > R$ 49.999,99. Sistema bloqueia com erro de validação (`MAXIMUM_BOLETO_AMOUNT`). | [ ]    |       |
| 91  | Fin+AutoBoletoOff   | Desativar `auto_generate_boleto` nas configurações. Fatura criada normalmente mas sem boleto gerado no Stripe. Aluno vê "Aguardando boleto". | [ ]    |       |
| 92  | Fin+Despesa         | Adicionar despesa no mês atual via `ExpenseModal`. Card "Total Despesas" atualiza. Lucro Líquido recalcula corretamente. | [ ]    |       |
| 93  | Fin+Mensalidade     | Faturamento automático de mensalidade: valor integral do plano cobrado no `billing_day` do aluno, independente do nº de aulas. | [ ]    |       |
| 94  | Fin+MensalidadeDep  | Mensalidade com dependentes: fatura consolidada emitida no responsável com descrição "[Nome do Filho] - Aula". | [ ]    |       |
| 95  | Fin+AlunoFaturas    | Aluno visualiza faturas na tela `Faturas.tsx`. Fatura com boleto exibe botão "Pagar Agora" que abre `boleto_url`. | [ ]    |       |
| 96  | Fin+AlunoRecibo     | Aluno clica "Ver Recibo" em fatura paga. Página `/recibo` exibe dados corretos (valor, data, descrição, perfil de negócio). | [ ]    |       |
| 97  | Fin+AlunoDepFaturas | Responsável vê faturas dos dependentes na tela do aluno com badge "Dependente" diferenciando faturas próprias das dos filhos. | [ ]    |       |
| 98  | Fin+Vencida         | Fatura pendente passa da data de vencimento. Badge muda para "Vencida" (destructive) na UI do professor e do aluno. | [ ]    |       |
| 99  | Fin+DeepLink        | Notificação no Inbox com link para fatura. Clique navega para a tela de faturas e destaca a fatura correta. | [ ]    |       |
| 100 | Fin+ContaRestrita   | `StripeAccountGuard`: conta Stripe restrita (charges_enabled = false) bloqueia criação de faturas com alerta visível. | [ ]    |       |

---

## 🧪 Roteiros de Teste Otimizados (19 Sessões)

> **Estratégia:** Os 100 cenários foram agrupados em **19 roteiros sequenciais**. Cada roteiro reutiliza o estado criado nos passos anteriores, eliminando setup redundante. O marcador `[#XX ✅]` indica qual cenário foi validado em cada passo.

### Referência Cruzada: Roteiro → Cenários

| Roteiro | Cenários Cobertos                              | Total |
| ------- | ---------------------------------------------- | ----- |
| 01      | #01, #02, #03, #08, #74, #75, #76, #77        | 8     |
| 02      | #04, #05, #06, #07, #11, #12, #80             | 7     |
| 03      | #13, #14, #15                                  | 3     |
| 04      | #16, #17, #18, #19, #20, #21, #22             | 7     |
| 05      | #23, #24, #25, #26, #27                        | 5     |
| 06      | #10, #09, #30                                  | 3     |
| 07      | #28, #29, #31, #32, #33, #38                   | 6     |
| 08      | #34, #35, #36, #37, #69, #84                   | 6     |
| 09      | #39, #40, #41, #42, #43, #44, #45, #46         | 8     |
| 10      | #47, #48, #49, #50, #51                        | 5     |
| 11      | #52, #53, #63, #64                             | 4     |
| 12      | #54, #55, #56, #57, #58, #59, #60, #61, #62   | 9     |
| 13      | #65, #66, #67, #68                             | 4     |
| 14      | #70, #71, #72                                  | 3     |
| 15      | #78, #79, #81, #82, #83                        | 5     |
| 16      | #73                                            | 1     |
| 17      | #85, #86, #87, #88, #89, #90, #91, #92         | 8     |
| 18      | #93, #94                                        | 2     |
| 19      | #95, #96, #97, #98, #99, #100                   | 6     |
| **Total** |                                              | **100**|

---

### Roteiro 01 — Ciclo de Vida Individual Pós-paga + Uploads

**Cobre:** #01, #02, #03, #08, #74, #75, #76, #77
**Pré-condições:** Professor logado com plano ativo, pelo menos 1 aluno cadastrado, política de cancelamento configurada.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Na Agenda, agendar aula individual no **mesmo horário** de uma aula já existente.                  | Toast de erro "Conflito de horário" exibido. Aula **não** é criada.    | `[#74 ✅]`  |
| 2     | Agendar aula individual com **data de ontem** (pós-paga, C1).                                      | Sistema exibe alerta mas permite salvar (registro retroativo).         | `[#75 ✅]`  |
| 3     | Agendar aula individual pós-paga para **amanhã** (data futura válida).                             | Aula aparece no calendário. Aluno visualiza na sua agenda.             | `[#01 ✅]`  |
| 4     | Logar como **aluno** → Confirmar presença na aula agendada.                                        | Status muda para "Confirmada". Professor vê a confirmação.             | `[#02 ✅]`  |
| 5     | Logar como **professor** → Concluir a aula.                                                        | Status muda para "Concluída" na UI.                                    | `[#03 ✅]`  |
| 6     | Criar relatório de aula → Anexar **arquivo PDF de ~4MB**.                                          | Upload concluído com sucesso. Arquivo aparece na galeria do relatório. | `[#76 ✅]`  |
| 7     | No mesmo relatório, tentar anexar **arquivo > 10MB**.                                              | Erro amigável exibido ("Arquivo muito grande"). Upload bloqueado.      | `[#77 ✅]`  |
| 8     | Preencher resumo da aula, adicionar notas, **enviar relatório**.                                   | Relatório salvo. E-mail enviado ao aluno (verificar inbox ou logs).    | `[#08 ✅]`  |

---

### Roteiro 02 — Cancelamentos e Anistia Individual

**Cobre:** #04, #05, #06, #07, #11, #12, #80
**Pré-condições:** Professor logado, 3 aulas individuais pós-pagas agendadas para datas futuras.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | **Professor** cancela a **Aula 1**.                                                                | Status "Cancelada". Nenhuma cobrança pendente gerada.                  | `[#04 ✅]`  |
| 2     | Logar como **aluno** → Cancelar **Aula 2** **dentro** do prazo de carência.                        | Status "Cancelada". Nenhuma taxa de cancelamento registrada.           | `[#05 ✅]`  |
| 3     | Aluno cancela **Aula 3** **fora** do prazo de carência.                                            | Status "Cancelada". Taxa de cancelamento registrada (charge_applied).  | `[#06 ✅]`  |
| 4     | Verificar se **notificação** de cancelamento apareceu no sininho do professor **e** e-mail.        | Sininho com badge. E-mail recebido (verificar logs SES).               | `[#80 ✅]`  |
| 5     | Logar como **professor** → Clicar botão **Anistia** na Aula 3.                                    | Taxa perdoada. `amnesty_granted = true`. Toast de sucesso.             | `[#07 ✅]`  |
| 6     | Gerar **fatura manual** (S13) para a Aula 3 (agora com anistia).                                  | Fatura criada com valor correto (sem taxa de cancelamento).            | `[#11 ✅]`  |
| 6.1   | 📊 **Checkpoint Financeiro:** Abrir painel Financeiro.                                             | Fatura aparece com tipo "Manual" e valor correto nos cards de resumo.  | —           |
| 7     | Voltar à Aula 3 → Verificar botão **Anistia**.                                                     | Botão **disabled** (anistia já concedida e faturada).                  | `[#12 ✅]`  |

---

### Roteiro 03 — Aula Gratuita (C0)

**Cobre:** #13, #14, #15
**Pré-condições:** Professor logado, 1 aluno cadastrado.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar aula individual **gratuita** (C0) → Concluir → Criar relatório.                           | Aula concluída. Relatório salvo. **Nenhuma fatura** gerada.            | `[#13 ✅]`  |
| 2     | Agendar outra aula gratuita → **Professor** cancela.                                               | Status "Cancelada". Nenhuma cobrança. Nenhum registro financeiro.      | `[#14 ✅]`  |
| 3     | Agendar outra gratuita → **Aluno** cancela **fora** do prazo.                                      | Status "Cancelada". Botão de **Anistia NÃO aparece** (C0, sem taxa).  | `[#15 ✅]`  |

---

### Roteiro 04 — Grupo Simples Completo (T3)

**Cobre:** #16, #17, #18, #19, #20, #21, #22
**Pré-condições:** Professor logado com plano Pro, 3 alunos adultos cadastrados (Aluno A, B, C).

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar **aula em grupo** pós-paga com Aluno A, B e C.                                            | Aula aparece no calendário. 3 participantes listados.                  | `[#16 ✅]`  |
| 2     | Logar como cada aluno → **Confirmar participação**.                                                | Status individual muda para "Confirmado" para cada aluno.              | `[#17 ✅]`  |
| 3     | Logar como **Aluno C** → **Cancelar** participação (dentro ou fora do prazo).                      | Aluno C removido. Aula continua ativa para A e B.                      | `[#19 ✅]`  |
| 4     | Logar como professor → **Concluir** aula (Alunos A e B presentes).                                | Status "Concluída" para A e B. C permanece "Cancelado".                | `[#18 ✅]`  |
| 5     | Criar **relatório**: feedback **privado** para Aluno A + feedback **geral** para todos.            | Relatório salvo. Aluno A recebe feedback privado. Todos recebem geral. | `[#21 ✅]`  |
| 6     | Se Aluno C cancelou fora do prazo: professor concede **Anistia** apenas para Aluno C.              | Anistia afeta **somente** Aluno C. A e B inalterados.                  | `[#22 ✅]`  |
| 7     | Agendar **outro grupo** com A, B, C → Professor **cancela inteiro**.                               | Todos os 3 alunos recebem notificação de cancelamento.                 | `[#20 ✅]`  |

---

### Roteiro 05 — Pré-pago e Stripe Checkout (C2)

**Cobre:** #23, #24, #25, #26, #27
**Pré-condições:** Professor com Stripe Connect ativo, aluno com cartão de teste cadastrado.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar aula individual **pré-paga** (C2).                                                         | Aula criada com status "Aguardando Pagamento".                         | `[#23 ✅]`  |
| 2     | Aluno é redirecionado ao **Stripe Checkout** → Pagar com cartão teste `4242...`.                   | Pagamento confirmado. Status muda para "Paga/Agendada".                | `[#25 ✅]`  |
| 3     | Agendar outra pré-paga → Pagar → Aluno cancela **dentro** do prazo.                               | Refund processado no Stripe. Valor devolvido/creditado.                | `[#26 ✅]`  |
| 4     | Agendar outra pré-paga → Pagar → Aluno cancela **fora** do prazo.                                 | Taxa de cancelamento retida. Valor parcial como crédito.               | `[#24 ✅]`  |
| 5     | Professor concede **Anistia** na aula cancelada fora do prazo.                                     | Refund total via Edge Function. `amnesty_granted = true`.              | `[#27 ✅]`  |

---

### Roteiro 06 — Solicitação pelo Aluno + Faturamento

**Cobre:** #10, #09, #30
**Pré-condições:** Aluno logado com acesso à solicitação de aula, professor com perfil de cobrança ativo.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Logar como **aluno** → Solicitar aula via `StudentScheduleRequest`.                                | Solicitação criada. Professor recebe notificação.                      | `[#10 ✅]`  |
| 2     | Logar como **professor** → Aprovar solicitação → Concluir a aula.                                  | Aula agendada e concluída. Pronta para faturamento.                    | —           |
| 3     | Executar **faturamento automático** (cron `automated-billing` ou aguardar ciclo).                   | Fatura gerada automaticamente para a aula concluída.                   | `[#09 ✅]`  |
| 4     | Gerar **fatura manual / boleto** avulsa para outra aula.                                           | Fatura criada. Link do boleto/PDF gerado e acessível.                  | `[#30 ✅]`  |
| 4.1   | 📊 **Checkpoint Financeiro:** Logar como **aluno** → Abrir tela Faturas.                           | Fatura visível com botão "Pagar Agora" funcional.                      | —           |

---

### Roteiro 07 — Faturamento Automatizado e Inadimplência

**Cobre:** #28, #29, #31, #32, #33, #38
**Pré-condições:** Várias aulas concluídas no mês (individuais + grupo). Acesso ao painel de Edge Functions.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Executar cron `automated-billing` (ou invocar Edge Function manualmente).                          | Fatura individual gerada agrupando aulas do mês.                       | `[#28 ✅]`  |
| 1.1   | 📊 **Checkpoint Financeiro:** Abrir painel Financeiro do professor.                                | Fatura aparece com tipo "Automática". Card "Receitas Pendentes" atualizado. | —           |
| 2     | Verificar fatura do **grupo**: valor **proporcional** por participante.                            | Cada participante com valor correto (total ÷ nº de alunos).            | `[#29 ✅]`  |
| 3     | Simular webhook `invoice.payment_failed` (cartão recusado no Stripe Test Mode).                    | `PaymentFailureModal` exibido na UI do professor/aluno.                | `[#31 ✅]`  |
| 4     | Com aluno marcado como **inadimplente** → Tentar agendar nova aula para ele.                       | `StudentSelectionBlocker` impede seleção. Toast de bloqueio.           | `[#32 ✅]`  |
| 5     | Executar `process-orphan-cancellation-charges`.                                                    | Taxas de cancelamento órfãs processadas e faturadas.                   | `[#33 ✅]`  |
| 6     | Adicionar aluno **além do limite** do plano (ex: 11º aluno no plano de 10).                        | `handle-student-overage` dispara cobrança extra.                       | `[#38 ✅]`  |

---

### Roteiro 08 — Stripe Connect, Assinaturas e Feature Gates

**Cobre:** #34, #35, #36, #37, #69, #84
**Pré-condições:** Conta de professor **sem** Stripe Connect configurado inicialmente.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Iniciar **onboarding KYC** Stripe Connect via `StripeConnectOnboarding`.                           | Redirect para Stripe Express. Formulário KYC exibido.                  | `[#34 ✅]`  |
| 2     | Completar onboarding → Retornar ao app.                                                           | Conta Connect ativa. Status "charges_enabled: true".                   | —           |
| 3     | Fazer **upgrade** Basic → Pro (cartão teste no Stripe Test Mode).                                  | Plano atualizado. Features Premium desbloqueadas na UI.                | `[#35 ✅]`  |
| 4     | Com plano Basic: tentar criar **Turma T3/T4** (feature Premium).                                   | `FeatureGate` exibe modal de Upgrade. Ação bloqueada.                  | `[#69 ✅]`  |
| 5     | Solicitar **downgrade** Pro → Basic.                                                               | Downgrade agendado. Features Premium travadas na virada do ciclo.      | `[#36 ✅]`  |
| 6     | Simular **expiração** de assinatura (via Stripe ou alteração manual de data).                       | `FinancialRouteGuard` ativo. Acesso ao módulo financeiro bloqueado.    | `[#37 ✅]`  |
| 7     | Verificar **payout** roteado para conta Connect (via `refresh-stripe-connect-account`).            | Saldo do payout aparece na conta conectada do tutor.                   | `[#84 ✅]`  |

---

### Roteiro 09 — Dependentes: Ciclo Completo (T2)

**Cobre:** #39, #40, #41, #42, #43, #44, #45, #46
**Pré-condições:** Professor logado, 1 responsável cadastrado com 2 dependentes (Filho A e Filho B).

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar aula individual para **Filho A** (dependente).                                             | Aula criada vinculada ao dependente. Responsável vê na agenda.         | `[#39 ✅]`  |
| 2     | Logar como **responsável** → Solicitar aula para **Filho B**.                                      | Solicitação criada em nome do dependente. Professor notificado.        | `[#40 ✅]`  |
| 3     | Professor aprova e agenda aula do Filho B → **Concluir** aula do Filho A.                          | Aula do Filho A concluída com sucesso.                                 | `[#42 ✅]`  |
| 4     | Criar **relatório** da aula do Filho A.                                                            | Feedback vinculado ao dependente. E-mail enviado ao **responsável**.   | `[#43 ✅]`  |
| 5     | Responsável **cancela** aula do Filho B **fora do prazo**.                                          | Taxa de cancelamento registrada no responsável (não no dependente).    | `[#41 ✅]`  |
| 6     | Professor concede **Anistia** na aula do Filho B.                                                  | Taxa perdoada. `amnesty_granted = true`.                               | `[#44 ✅]`  |
| 7     | Executar **faturamento automático** (aula do Filho A concluída).                                   | Fatura emitida no **nome/CPF do responsável** (não do dependente).     | `[#45 ✅]`  |
| 7.1   | 📊 **Checkpoint Financeiro:** Logar como **responsável** → Abrir tela Faturas.                     | Fatura visível com badge "Dependente" diferenciando do responsável.    | —           |
| 8     | Gerar **fatura manual** consolidando aulas dos **2 filhos** na mesma fatura.                       | Fatura única com itens de Filho A e Filho B. Emitida ao responsável.   | `[#46 ✅]`  |

---

### Roteiro 10 — Grupo Misto T4 (Adultos + Dependentes)

**Cobre:** #47, #48, #49, #50, #51
**Pré-condições:** 1 aluno adulto + 1 responsável com 1 dependente cadastrados.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar **turma mista** (T4): 1 adulto + 1 dependente (pai paga pelo filho).                      | Aula criada com 2 participantes. Calendário exibe corretamente.        | `[#47 ✅]`  |
| 2     | Responsável **retira o filho** (cancelamento parcial).                                             | Dependente removido. Adulto continua na aula.                          | `[#48 ✅]`  |
| 3     | Agendar **outra turma mista** → Professor **cancela inteira**.                                     | Adulto e responsável (pagante do filho) recebem notificação.           | `[#49 ✅]`  |
| 4     | Agendar **outra turma mista** → Concluir → Executar **faturamento automático**.                    | Adulto recebe sua fatura. Responsável recebe fatura do filho.          | `[#50 ✅]`  |
| 5     | Criar **relatório** da turma mista.                                                                | Adulto recebe seu feedback. Responsável recebe feedback do filho.      | `[#51 ✅]`  |

---

### Roteiro 11 — Recorrência Finita e Frequências (R1)

**Cobre:** #52, #53, #63, #64
**Pré-condições:** Professor logado, alunos disponíveis, calendário limpo para as datas.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar recorrência **finita semanal** (10 aulas) para aluno individual.                           | 10 ocorrências aparecem no calendário nas datas corretas.              | `[#52 ✅]`  |
| 2     | Agendar recorrência finita semanal para **grupo** (3 alunos, 10 aulas).                            | 10 ocorrências no calendário de todos os participantes.                | `[#53 ✅]`  |
| 3     | Agendar recorrência **quinzenal** (frequência a cada 2 semanas).                                   | Ocorrências em semanas alternadas. Datas corretas no calendário.       | `[#63 ✅]`  |
| 4     | Agendar recorrência **mensal** (1 aula por mês).                                                   | 1 ocorrência por mês. Dia da semana ou dia do mês correto.            | `[#64 ✅]`  |

---

### Roteiro 12 — Recorrência Infinita e Exceções (R2)

**Cobre:** #54, #55, #56, #57, #58, #59, #60, #61, #62
**Pré-condições:** Professor logado, alunos e dependentes cadastrados, calendário limpo.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Agendar **recorrência infinita** individual (mensalidade).                                         | Aulas futuras virtuais geradas. Próximas semanas visíveis.             | `[#54 ✅]`  |
| 2     | Avançar data (ou invocar `materialize-virtual-class`) para materializar próxima aula.              | Aula materializada como registro real no banco. Status "Agendada".     | `[#57 ✅]`  |
| 3     | **Cancelar 1 ocorrência** (ex: feriado) via `RecurringClassActionModal` → "Somente esta".          | Ocorrência cancelada. Próxima semana **intacta**.                      | `[#58 ✅]`  |
| 4     | **Alterar horário** de UMA ocorrência (remarcar de 14h para 15h).                                  | Exceção de horário salva. Demais ocorrências inalteradas.              | `[#60 ✅]`  |
| 5     | **Cancelar "esta e futuras"** em uma ocorrência intermediária.                                     | Passadas permanecem. Futuras removidas/canceladas.                     | `[#59 ✅]`  |
| 6     | Agendar recorrência infinita para **grupo** (T3+R2).                                               | Grupo recorrente criado. Todos os alunos veem no calendário.           | `[#55 ✅]`  |
| 7     | Agendar recorrência infinita para **dependente** (T2+R2).                                          | Recorrência vinculada ao dependente. Responsável visualiza.            | `[#56 ✅]`  |
| 8     | Tentar agendar **recorrência conflitante** (mesmo horário de outra R2 existente).                  | Sistema **bloqueia** com mensagem de conflito.                         | `[#62 ✅]`  |
| 9     | **Encerrar recorrência** (`end-recurrence`) no meio do mês.                                        | Aulas passadas intactas. Futuras canceladas. Recorrência encerrada.    | `[#61 ✅]`  |

---

### Roteiro 13 — Segurança RLS: Isolamento entre Usuários

**Cobre:** #65, #66, #67, #68
**Pré-condições:** 2 professores (A e B), 2 alunos (A e B), 1 responsável com dependente. Todos com dados existentes.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Logar como **Professor A** → Copiar URL da página de faturas → Logar como **Professor B** → Colar URL. | Página vazia ou 404. Professor B **não** vê dados do Professor A.      | `[#65 ✅]`  |
| 2     | Logar como **Aluno A** → Copiar ID de uma fatura → Logar como **Aluno B** → Tentar abrir `/recibo/:id`. | Página vazia ou erro. Aluno B **não** acessa fatura do Aluno A.        | `[#66 ✅]`  |
| 3     | Logar como **responsável** → Tentar acessar relatório de aluno **não vinculado** a ele.            | Acesso negado. Relatório não carregado.                                | `[#67 ✅]`  |
| 4     | Abrir **console do navegador** → Executar `PATCH` na tabela `classes` para alterar `price`.        | RLS **bloqueia** a operação. Erro 403 ou resultado vazio.              | `[#68 ✅]`  |

---

### Roteiro 14 — Validação de API e Regras de Negócio

**Cobre:** #70, #71, #72
**Pré-condições:** Professor logado, aluno com faturas pagas existentes.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Via API/console, enviar **duração de aula negativa** (-30 min) ou texto ("abc").                    | Backend retorna **400**. Zod/validação rejeita o input.                | `[#70 ✅]`  |
| 2     | Tentar criar aula com combinação **Pré-Pago (C2) + Recorrência Infinita (R2)**.                    | UI **desabilita** a combinação ou exibe erro. Não permite salvar.      | `[#71 ✅]`  |
| 3     | Executar `smart-delete-student` para aluno com **faturas pagas**.                                  | Aluno removido da UI ativa. **Dados fiscais persistem** no banco.      | `[#72 ✅]`  |

---

### Roteiro 15 — UX: Materiais, Convites, Senha e Recibo

**Cobre:** #78, #79, #81, #82, #83
**Pré-condições:** Professor com materiais enviados, aluno cadastrado, perfil de negócio configurado.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Professor **compartilha material PDF** com aluno via `ShareMaterialModal`.                         | Acesso concedido. Material aparece na lista do aluno.                  | —           |
| 2     | Logar como **aluno** → **Baixar** o material PDF compartilhado.                                    | Download concluído sem erros. Arquivo íntegro.                         | `[#78 ✅]`  |
| 3     | Logar como professor → **Reenviar convite** a outro aluno (`resend-student-invitation`).           | E-mail enviado. Aluno recebe link mágico de acesso.                    | `[#79 ✅]`  |
| 4     | Na tela de login, clicar **"Esqueci minha senha"** → Inserir e-mail → Receber token.               | E-mail de reset recebido. Link de redefinição funcional.               | —           |
| 5     | Clicar no link → **Alterar senha** → Logar com a nova senha.                                       | Senha alterada com sucesso. Login funciona com nova credencial.        | `[#81 ✅]`  |
| 6     | Editar **perfil de negócio** (nome e/ou logo) via `BusinessProfilesManager`.                       | Alteração salva. Novo nome/logo refletido na UI.                       | `[#83 ✅]`  |
| 7     | Abrir página `/recibo` → Verificar que alteração do perfil está refletida → Teclar **Ctrl+P**.     | Menus laterais ocultos. Layout limpo para impressão. Dados corretos.   | `[#82 ✅]`  |

---

### Roteiro 16 — Timezone

**Cobre:** #73
**Pré-condições:** Professor com timezone GMT-3 (Brasil), aluno com timezone GMT+0 (Portugal).

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Professor (GMT-3) agenda aula às **10h**.                                                          | Aula salva com horário 10h no timezone do professor.                   | —           |
| 2     | Logar como **aluno** (GMT+0) → Verificar horário exibido na agenda.                                | Horário exibido como **13h** (10h + 3h de diferença).                  | `[#73 ✅]`  |

---

### Roteiro 17 — Painel Financeiro do Professor

**Cobre:** #85, #86, #87, #88, #89, #90, #91, #92
**Pré-condições:** Professor logado com plano Pro, Stripe Connect ativo, pelo menos 1 fatura pendente existente, 1 aula pré-paga em status "Aguardando Pagamento".

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Abrir **Financeiro** → Verificar cards de resumo.                                                  | Cards "Receitas Pendentes", "Receitas Recebidas", "Despesas" e "Lucro Líquido" exibem valores corretos e consistentes. | `[#85 ✅]`  |
| 2     | Verificar alerta/info de **taxa Stripe** (R$ 3,49 por boleto).                                    | Informação de taxa visível. Cálculo de exemplo (ex: R$ 100 → líquido R$ 96,51) correto. | `[#86 ✅]`  |
| 3     | Tentar criar **fatura manual** com valor **R$ 4,00** (abaixo de R$ 5,00).                         | Sistema **bloqueia** com erro: "Valor mínimo para boleto é R$ 5,00".   | `[#89 ✅]`  |
| 4     | Tentar criar fatura manual com valor **R$ 50.000,00** (acima de R$ 49.999,99).                    | Sistema **bloqueia** com erro: "Valor máximo para boleto".             | `[#90 ✅]`  |
| 5     | Criar fatura manual com valor válido (ex: R$ 150,00).                                              | Fatura criada com boleto. Aparece na lista com status "Pendente".      | —           |
| 6     | Clicar **"Marcar como Paga"** na fatura pendente.                                                  | Status muda para "Paga". `payment_origin = 'manual'`. Toast de sucesso. | `[#87 ✅]`  |
| 7     | Verificar no Stripe Dashboard que o **PaymentIntent** foi cancelado (se existia).                  | PI status = `canceled` ou ausente. Sem cobrança duplicada.             | —           |
| 8     | Localizar fatura de **aula pré-paga** (status "Aguardando Pagamento") → **Marcar como Paga**.     | Fatura marcada como "Paga". Aula vinculada muda de "aguardando_pagamento" para **"confirmada"**. Participantes atualizados. | `[#88 ✅]`  |
| 9     | Ir em **Configurações de Cobrança** → **Desativar** `auto_generate_boleto`.                       | Toggle salvo. Confirmação visual.                                      | —           |
| 10    | Criar nova **fatura manual** (ex: R$ 200,00) com auto-boleto **desativado**.                      | Fatura criada no banco com status "Pendente". **Sem boleto** gerado no Stripe. Aluno vê "Aguardando boleto". | `[#91 ✅]`  |
| 11    | Reativar `auto_generate_boleto` → Ir em **Despesas** → Adicionar despesa (ex: R$ 50,00 "Material didático"). | Despesa salva. Card "Total Despesas" atualiza. "Lucro Líquido" recalcula (receitas - despesas - taxas). | `[#92 ✅]`  |

---

### Roteiro 18 — Mensalidades e Faturamento Cíclico

**Cobre:** #93, #94
**Pré-condições:** Professor com mensalidade configurada (`monthly_subscription`), 1 aluno adulto e 1 responsável com dependente vinculados à mensalidade, `billing_day` configurado no perfil do aluno.

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Aguardar/executar ciclo de faturamento automático (invocar `automated-billing` ou simular `billing_day`). | Fatura gerada para o aluno adulto com **valor integral** da mensalidade (independente do nº de aulas realizadas). | `[#93 ✅]`  |
| 2     | Verificar fatura do **dependente** gerada no mesmo ciclo.                                          | Fatura consolidada no **responsável**. Descrição inclui "[Nome do Filho] - Aula" nos itens. `monthly_subscription_id` preenchido. | `[#94 ✅]`  |

---

### Roteiro 19 — Experiência Financeira do Aluno / Responsável

**Cobre:** #95, #96, #97, #98, #99, #100
**Pré-condições:** Aluno logado com faturas existentes (pendente com boleto, paga, vencida). Responsável com faturas de dependentes. Professor com conta Stripe restrita (para teste #100).

| Passo | Ação                                                                                               | Validação                                                              | Cenário     |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| 1     | Logar como **aluno** → Abrir tela **Faturas** (`Faturas.tsx`).                                     | Lista de faturas exibida. Faturas próprias visíveis com status correto. | `[#95 ✅]`  |
| 2     | Localizar fatura **pendente** com boleto → Clicar **"Pagar Agora"**.                               | `boleto_url` aberta em nova aba. Boleto PDF acessível.                 | —           |
| 3     | Localizar fatura **paga** → Clicar **"Ver Recibo"**.                                               | Página `/recibo` exibe valor, data, descrição e dados do perfil de negócio do professor. | `[#96 ✅]`  |
| 4     | Logar como **responsável** → Abrir tela Faturas.                                                   | Faturas dos **dependentes** visíveis com badge "Dependente" diferenciando das faturas próprias. | `[#97 ✅]`  |
| 5     | Verificar fatura com data de vencimento **passada** (status deveria ser "Vencida").                 | Badge exibe **"Vencida"** (variant destructive/vermelho) na UI do aluno e do professor. | `[#98 ✅]`  |
| 6     | Logar como **professor** → Abrir **Inbox** → Localizar notificação de fatura → Clicar no link.    | Navegação para tela de faturas. Fatura correta destacada/focada.       | `[#99 ✅]`  |
| 7     | Logar como professor com conta Stripe **restrita** (`charges_enabled = false`) → Tentar criar fatura. | `StripeAccountGuard` exibe **alerta de conta restrita**. Ação de criação bloqueada. | `[#100 ✅]` |

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
| `src/components/PaymentOptionsCard.tsx`                       | Opções de pagamento (aluno) |
| `src/components/InvoiceStatusBadge.tsx`                       | Badge de status da fatura   |
| `src/components/InvoiceTypeBadge.tsx`                         | Badge de tipo da fatura     |
| `src/components/ExpenseList.tsx`                              | Listagem de despesas        |
| `src/components/ExpenseModal.tsx`                             | CRUD de despesas            |
| `src/components/StripeAccountGuard.tsx`                       | Guard de conta restrita     |
| `src/contexts/SubscriptionContext.tsx`                        | Detecção de payment failure |
| `src/pages/Financeiro.tsx`                                    | Painel financeiro professor |
| `src/pages/Faturas.tsx`                                       | Tela de faturas do aluno    |
| `src/pages/Recibo.tsx` / `src/pages/recibo.css`              | Impressão de recibo         |
| `src/pages/ResetPassword.tsx`                                | Recuperação de senha        |
| `src/utils/stripe-fees.ts`                                   | Validação boleto e taxas    |
| `src/components/BusinessProfilesManager.tsx`                 | Perfil de negócio           |
| `supabase/functions/process-cancellation/index.ts`            | Backend cancelamento        |
| `supabase/functions/automated-billing/index.ts`               | Faturamento automático      |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Taxas órfãs             |
| `supabase/functions/handle-student-overage/index.ts`          | Overage de alunos           |
| `supabase/functions/smart-delete-student/index.ts`            | Exclusão segura             |
| `supabase/functions/materialize-virtual-class/index.ts`       | Materialização recorrente   |
| `supabase/functions/cancel-payment-intent/index.ts`           | Marcação manual como paga   |
| `supabase/functions/validate-monthly-subscriptions/index.ts`  | Validação de mensalidades   |
| `supabase/functions/refresh-stripe-connect-account/index.ts` | Refresh payout Connect      |

---

## Registro de Resultados

> Preencha a coluna **Notas** com observações, bugs encontrados ou confirmação de sucesso (✅ / ❌ + descrição).
