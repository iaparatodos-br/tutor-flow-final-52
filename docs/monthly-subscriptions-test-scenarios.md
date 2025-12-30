# Cenários de Teste E2E - Sistema de Mensalidades

## Visão Geral

Este documento contém cenários de teste passo-a-passo para validação manual do sistema de mensalidades do Tutor Flow. Cada cenário deve ser executado em ambiente de desenvolvimento ou staging antes de releases em produção.

---

## Pré-requisitos

- [ ] Conta de professor ativa com plano que inclui módulo financeiro
- [ ] Pelo menos 3 alunos cadastrados e vinculados ao professor
- [ ] Pelo menos 1 serviço configurado com preço definido
- [ ] Stripe Connect configurado (para testes de faturamento)

---

## Cenário E01: Criar Primeira Mensalidade

**Objetivo:** Validar fluxo completo de criação de um plano mensal.

### Passos

1. Acessar `/servicos` como professor
2. Clicar na aba "Mensalidades"
3. Verificar que a lista está vazia (se for primeiro teste)
4. Clicar botão "Nova Mensalidade"
5. Preencher formulário:
   - Nome: "Plano Básico Teste"
   - Descrição: "Plano de teste para validação"
   - Preço: R$ 200,00
   - Marcar "Limitar quantidade de aulas"
   - Máximo de aulas: 4
   - Preço por excedente: R$ 50,00
6. Clicar "Criar Mensalidade"

### Resultados Esperados

- [ ] Toast de sucesso aparece
- [ ] Modal fecha automaticamente
- [ ] Card da mensalidade aparece na lista
- [ ] Badge "Ativo" visível
- [ ] Informações corretas no card (preço, limite, excedente)
- [ ] Contador "0 aluno(s) vinculado(s)"

---

## Cenário E02: Atribuir Aluno a Mensalidade

**Objetivo:** Validar atribuição de aluno a um plano existente.

### Pré-requisito
- Cenário E01 concluído

### Passos

1. Na lista de mensalidades, localizar "Plano Básico Teste"
2. Clicar em "Ver Alunos"
3. Verificar que lista de alunos vinculados está vazia
4. Clicar em "Vincular Aluno"
5. No seletor, escolher um aluno disponível
6. Definir data de início (hoje ou data futura)
7. Clicar "Vincular"

### Resultados Esperados

- [ ] Toast de sucesso "Aluno vinculado com sucesso!"
- [ ] Aluno aparece na tabela de alunos vinculados
- [ ] Data de início correta exibida
- [ ] Status "Ativo" no badge
- [ ] Coluna "Aulas Usadas" mostra 0 ou contagem real
- [ ] Contador no card atualiza para "1 aluno(s) vinculado(s)"

---

## Cenário E03: Vincular Múltiplos Alunos na Criação

**Objetivo:** Validar atribuição em lote durante criação da mensalidade.

### Passos

1. Clicar "Nova Mensalidade"
2. Preencher:
   - Nome: "Plano Premium Teste"
   - Preço: R$ 500,00
   - Sem limite de aulas
3. No seletor de alunos, selecionar 2-3 alunos
4. Clicar "Criar Mensalidade"

### Resultados Esperados

- [ ] Mensalidade criada com sucesso
- [ ] Contador mostra quantidade correta de alunos
- [ ] Ao clicar "Ver Alunos", todos os selecionados aparecem
- [ ] Todos com data de início = hoje

---

## Cenário E04: Desativar Mensalidade (Cascade)

**Objetivo:** Validar soft delete e remoção automática de alunos.

### Pré-requisito
- Cenário E02 ou E03 concluído (mensalidade com alunos)

### Passos

1. Localizar mensalidade com alunos vinculados
2. Clicar em "Desativar"
3. Ler mensagem de confirmação
4. Confirmar desativação

### Resultados Esperados

- [ ] Toast de sucesso
- [ ] Badge muda para "Inativo"
- [ ] Card fica visualmente diferenciado (opaco)
- [ ] Contador de alunos reseta para 0
- [ ] Ao "Ver Alunos", todos aparecem como inativos
- [ ] Toggle "Mostrar inativos" funciona corretamente

---

## Cenário E05: Visualização do Aluno (StudentDashboard)

**Objetivo:** Validar que aluno vê suas mensalidades corretamente.

### Pré-requisito
- Aluno vinculado a uma mensalidade ativa

### Passos

1. Fazer login como aluno com mensalidade ativa
2. Acessar Portal do Aluno (`/portal-do-aluno`)
3. Localizar seção "Meus Planos"

### Resultados Esperados

- [ ] Card do plano visível
- [ ] Nome do plano correto
- [ ] Nome do professor correto
- [ ] Barra de progresso de aulas (se plano tem limite)
- [ ] Texto "{X} aulas restantes" ou "Ilimitado"
- [ ] Preço exibido corretamente

---

## Cenário E06: Perfil do Aluno (PerfilAluno)

**Objetivo:** Validar badges e informações de mensalidade no perfil.

### Pré-requisito
- Aluno vinculado a mensalidade

### Passos

1. Como professor, acessar `/alunos/{id}` de aluno com mensalidade
2. Verificar seção de mensalidade ativa

### Resultados Esperados

- [ ] Badge "Mensalidade Ativa" visível
- [ ] Nome do plano correto
- [ ] Barra de progresso se aplicável
- [ ] Preço mensal exibido

---

## Cenário E07: Faturamento Automático

**Objetivo:** Validar que `automated-billing` gera faturas corretamente.

### Pré-requisito
- Aluno com `billing_day` = dia atual
- Aluno vinculado a mensalidade ativa

### Passos

1. Configurar billing_day do aluno para hoje
2. Executar job `automated-billing` (via cron ou manualmente)
3. Verificar página `/financeiro`

### Resultados Esperados

- [ ] Fatura criada para o aluno
- [ ] Tipo da fatura: "Mensalidade"
- [ ] Valor = preço da mensalidade
- [ ] Descrição menciona nome do plano
- [ ] Se houver excedentes, item adicional presente
- [ ] Status inicial: "Pendente"

---

## Cenário EC01: Plano Gratuito com Limite

**Objetivo:** Validar cobrança apenas de excedentes em plano gratuito.

### Passos

1. Criar mensalidade:
   - Nome: "Plano Gratuito"
   - Preço: R$ 0,00
   - Limite: 2 aulas
   - Excedente: R$ 50,00
2. Vincular aluno
3. Registrar 3 aulas concluídas no mês
4. Executar faturamento

### Resultados Esperados

- [ ] Fatura gerada
- [ ] Valor = R$ 50,00 (1 excedente)
- [ ] Item de base não presente (ou R$ 0,00)
- [ ] 1 item de excedente

---

## Cenário EC02: Aulas Antes de starts_at

**Objetivo:** Validar separação de cobrança por data.

### Passos

1. Vincular aluno com `starts_at` = hoje
2. Registrar aula ONTEM (retroativa)
3. Registrar aula HOJE
4. Executar faturamento

### Resultados Esperados

- [ ] Aula de ontem cobrada AVULSA (não na mensalidade)
- [ ] Aula de hoje incluída na franquia
- [ ] Duas faturas ou uma fatura com items distintos

---

## Cenário EC03: Aluno com Múltiplos Professores

**Objetivo:** Validar que aluno pode ter mensalidade com cada professor.

### Passos

1. Professor A: vincular aluno ao plano A
2. Professor B: vincular mesmo aluno ao plano B

### Resultados Esperados

- [ ] Aluno aparece vinculado para ambos
- [ ] Cada professor vê apenas seu plano
- [ ] Sem erros de duplicata

---

## Cenário EC04: Responsável com Dependentes

**Objetivo:** Validar cobertura familiar.

### Passos

1. Vincular responsável (guardian) a uma mensalidade
2. Registrar aulas para dependente do responsável

### Resultados Esperados

- [ ] Aulas do dependente contam na franquia do responsável
- [ ] Fatura vai para o responsável
- [ ] Descrição menciona dependente se aplicável

---

## Cenário EC05: Valor Mínimo para Boleto

**Objetivo:** Validar regra de R$ 5,00 mínimo.

### Passos

1. Criar mensalidade: Preço = R$ 4,99
2. Vincular aluno
3. Executar faturamento

### Resultados Esperados

- [ ] Fatura criada
- [ ] Logs indicam "below minimum for boleto"
- [ ] Boleto NÃO gerado
- [ ] Fatura disponível para outros métodos de pagamento

---

## Cenário EC06: Plano Ilimitado

**Objetivo:** Validar plano sem limite de aulas.

### Passos

1. Criar mensalidade sem marcar "Limitar aulas"
2. Vincular aluno
3. Registrar 10+ aulas
4. Executar faturamento

### Resultados Esperados

- [ ] Fatura = apenas valor base
- [ ] Sem items de excedente
- [ ] UI mostra "Ilimitado"

---

## Cenário EC07: Reativação de Mensalidade

**Objetivo:** Validar reativação após desativação.

### Passos

1. Desativar mensalidade com alunos
2. Clicar "Reativar"
3. Verificar estado

### Resultados Esperados

- [ ] Badge volta para "Ativo"
- [ ] Alunos NÃO são automaticamente revinculados
- [ ] Professor precisa vincular manualmente

---

## Checklist Final de Validação

### Banco de Dados
- [ ] Tabela `monthly_subscriptions` sem registros órfãos
- [ ] Tabela `student_monthly_subscriptions` sem duplicatas
- [ ] Trigger de cascade funcionando
- [ ] Função `count_completed_classes_in_month` retornando correto

### Frontend
- [ ] Página Serviços com aba Mensalidades
- [ ] Cards responsivos
- [ ] Modais funcionando
- [ ] Traduções PT/EN corretas

### Backend
- [ ] `automated-billing` processando mensalidades
- [ ] `send-invoice-notification` com template personalizado
- [ ] `process-cancellation` criando faturas

### Segurança
- [ ] RLS policies corretas
- [ ] Professor só vê suas mensalidades
- [ ] Aluno só vê seus planos

---

## Notas de Execução

- Data de execução: _______________
- Executor: _______________
- Ambiente: [ ] Dev [ ] Staging [ ] Produção
- Versão: _______________

### Problemas Encontrados

| Cenário | Descrição | Severidade | Status |
|---------|-----------|------------|--------|
|         |           |            |        |

### Aprovações

- [ ] QA Aprovado
- [ ] Dev Aprovado
- [ ] PM Aprovado
