

# Roteiros de Teste Otimizados — Agrupamento por Fluxo

## Objetivo

Reescrever a secao "Como Testar Cada Cenario" do documento `docs/e2e-test-plan-classes.md`, substituindo os 5 passos genericos atuais por **16 Roteiros de Teste** detalhados com passo a passo. Cada roteiro agrupa cenarios relacionados em um unico fluxo continuo, reduzindo setup repetitivo e otimizando tempo.

Os 84 cenarios serao cobertos em apenas 16 sessoes de teste.

---

## Estrutura dos Roteiros

Cada roteiro tera:
- **Titulo e cenarios cobertos** (ex: "Cobre #01, #02, #03, #08")
- **Pre-condicoes** (estado necessario antes de comecar)
- **Passos numerados** com acoes claras e checkpoints de validacao
- **Marcador de cenario** inline (ex: `[#01 OK]`) para saber qual cenario foi validado em cada passo

---

## Mapeamento dos 16 Roteiros

### Roteiro 1 — Ciclo de Vida Individual Pos-paga (8 cenarios)
**Cobre:** #01, #02, #03, #08, #74, #75, #76, #77

Fluxo: Tentar conflito de horario → agendar no passado → agendar corretamente → aluno confirma → concluir → anexar PDF 4MB no relatorio → tentar anexar >10MB → enviar relatorio.

Um unico fluxo valida agendamento, confirmacao, conclusao, relatorio, upload e edge cases de UI.

### Roteiro 2 — Cancelamentos e Anistia Individual (7 cenarios)
**Cobre:** #04, #05, #06, #07, #12, #11, #80

Fluxo: Agendar 3 aulas individuais pos-pagas → professor cancela a 1a (sem cobranca) → aluno cancela a 2a dentro do prazo (sem taxa) → aluno cancela a 3a fora do prazo (taxa) → professor concede anistia → gerar fatura manual → verificar botao anistia disabled → checar notificacao no sininho e email.

### Roteiro 3 — Aula Gratuita (3 cenarios)
**Cobre:** #13, #14, #15

Fluxo: Agendar gratuita → concluir → relatorio → verificar zero faturas → agendar outra gratuita → professor cancela → agendar outra → aluno cancela fora do prazo → confirmar que anistia NAO aparece.

### Roteiro 4 — Grupo Simples Completo (7 cenarios)
**Cobre:** #16, #17, #18, #19, #20, #21, #22

Fluxo: Agendar grupo com 3 alunos → confirmar participacao → 1 aluno cancela parcialmente → concluir aula (2 restantes) → relatorio com feedback privado + geral → anistia para 1 aluno → agendar outro grupo → professor cancela inteiro → validar notificacoes.

### Roteiro 5 — Pre-pago e Stripe Checkout (5 cenarios)
**Cobre:** #23, #24, #25, #26, #27

Fluxo: Agendar pre-paga → redirect Stripe → pagar com cartao teste → verificar status pago → agendar outra pre-paga → aluno cancela dentro do prazo (refund) → agendar outra → aluno cancela fora do prazo → professor concede anistia (refund via Edge Function).

### Roteiro 6 — Solicitacao pelo Aluno e Fatura Manual (3 cenarios)
**Cobre:** #10, #09, #30

Fluxo: Logar como aluno → solicitar aula → logar como professor → aprovar → concluir aula → faturamento automatico (verificar) → gerar fatura manual/boleto avulsa → validar PDF/link.

### Roteiro 7 — Faturamento Automatizado e Inadimplencia (6 cenarios)
**Cobre:** #28, #29, #31, #32, #33, #38

Fluxo: Preparar aulas concluidas no mes (individual + grupo) → executar cron `automated-billing` → verificar fatura individual → verificar fatura proporcional do grupo → simular `payment_failed` → verificar modal de falha → tentar agendar com aluno inadimplente (bloqueio) → executar `process-orphan-cancellation-charges` → testar overage adicionando aluno alem do plano.

### Roteiro 8 — Stripe Connect e Assinaturas do Professor (6 cenarios)
**Cobre:** #34, #35, #36, #37, #84, #69

Fluxo: Iniciar onboarding KYC Stripe Connect → completar → verificar conta ativa → fazer upgrade Basic→Pro → confirmar features desbloqueadas → solicitar downgrade → verificar features travadas na virada → simular expiracao → confirmar `FinancialRouteGuard` ativo → verificar payout roteado → testar Feature Gate (Basic tenta criar grupo).

### Roteiro 9 — Dependentes: Ciclo Completo (8 cenarios)
**Cobre:** #39, #40, #41, #42, #43, #44, #45, #46

Fluxo: Cadastrar responsavel com 2 dependentes → agendar aula para dependente 1 → responsavel solicita aula para dependente 2 → concluir aula dep.1 → relatorio enviado ao responsavel → responsavel cancela aula dep.2 fora do prazo → professor concede anistia → executar faturamento automatico (fatura no nome do responsavel) → gerar fatura manual consolidando os 2 dependentes.

### Roteiro 10 — Grupo Misto T4 (5 cenarios)
**Cobre:** #47, #48, #49, #50, #51

Fluxo: Agendar turma com 1 adulto + 1 dependente → responsavel retira filho (cancelamento parcial) → adulto continua → agendar outra turma mista → professor cancela inteira (notificacao para pagantes corretos) → agendar outra → concluir → faturamento automatico (adulto recebe sua fatura, responsavel recebe a do filho) → relatorio com feedback roteado corretamente.

### Roteiro 11 — Recorrencia Finita e Frequencias (4 cenarios)
**Cobre:** #52, #53, #63, #64

Fluxo: Agendar recorrencia finita semanal (10 aulas) → verificar calendario → agendar grupo recorrente finito → verificar calendario de todos os alunos → agendar recorrencia quinzenal → verificar datas alternadas → agendar recorrencia mensal → verificar 1 ocorrencia por mes.

### Roteiro 12 — Recorrencia Infinita e Excecoes (8 cenarios)
**Cobre:** #54, #55, #56, #57, #58, #59, #60, #61, #62

Fluxo: Agendar recorrencia infinita individual → verificar materializacao (`materialize-virtual-class`) → cancelar 1 ocorrencia (feriado) → verificar proxima intacta → alterar horario de 1 ocorrencia → cancelar "esta e futuras" → verificar passadas intactas → agendar recorrencia infinita de grupo → agendar para dependente → tentar agendar recorrencia conflitante (bloqueio) → encerrar recorrencia no meio do mes.

### Roteiro 13 — Seguranca RLS: Isolamento entre Usuarios (4 cenarios)
**Cobre:** #65, #66, #67, #68

Fluxo: Logar como Professor A → copiar URL de faturas → logar como Professor B → colar URL → confirmar 404/acesso negado → logar como Aluno A → copiar ID de fatura → logar como Aluno B → tentar abrir → confirmar vazio/erro → logar como responsavel → tentar ver relatorio de aluno nao vinculado → abrir console → tentar PATCH no preco da aula → confirmar RLS bloqueia.

### Roteiro 14 — Seguranca: Validacao e Feature Gates (4 cenarios)
**Cobre:** #69, #70, #71, #72

Fluxo: (Feature Gate ja coberto no Roteiro 8) → enviar duracao negativa via API → confirmar 400 → tentar combinar C2+R2 → confirmar UI desabilita → deletar aluno com faturas pagas → confirmar dados fiscais persistem mas cadastro some da UI ativa.

### Roteiro 15 — UX: Materiais, Convites e Recuperacao (5 cenarios)
**Cobre:** #78, #79, #81, #82, #83

Fluxo: Professor compartilha material PDF → logar como aluno → baixar material → reenviar convite a outro aluno → verificar email recebido → testar "Esqueci minha senha" → receber token → alterar senha → logar com nova senha → editar perfil de negocio (nome/logo) → abrir recibo → verificar alteracao refletida → Ctrl+P → confirmar layout limpo sem menus.

### Roteiro 16 — UX: Timezone e Validacoes Visuais (2 cenarios)
**Cobre:** #73, #82 (complemento)

Fluxo: Configurar timezone GMT-3 no professor → agendar aula 10h → logar como aluno em GMT+0 → verificar horario exibido como 13h.

---

## Alteracao no Arquivo

O arquivo `docs/e2e-test-plan-classes.md` sera atualizado:

1. **Substituir** a secao "Como Testar Cada Cenario" (linhas 182-188) pelos 16 roteiros detalhados com passo a passo numerado
2. **Manter intactas** todas as tabelas de cenarios (categorias 1-6), matriz de eixos, arquivos envolvidos e registro de resultados
3. **Adicionar** uma tabela de referencia cruzada no inicio da nova secao mostrando qual roteiro cobre quais cenarios

