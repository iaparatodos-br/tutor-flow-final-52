
# Plano de Implementação do Teacher Inbox - Dividido em Micro-Tarefas

## Visão Geral da Divisão

A implementação será dividida em **4 Fases principais** e **20 micro-tarefas** independentes, permitindo progresso incremental e testável.

---

## FASE 1: INFRAESTRUTURA (BACKEND)

### 🔧 Micro-Tarefa 1.1: Criar Tabela `teacher_notifications`
**Escopo:**
- Criar tabela com todas as colunas (id, teacher_id, source_type, source_id, category, status, is_read, etc.)
- Adicionar constraints (CHECK para source_type e category)
- Constraint UNIQUE para evitar duplicatas

**SQL a criar:**
```sql
CREATE TABLE teacher_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('class', 'invoice')),
  source_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('pending_past_classes', 'amnesty_eligible', 'overdue_invoices', 'pending_reports')),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'saved', 'done')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ,
  UNIQUE(teacher_id, source_type, source_id, category)
);
```

**Dependências:** Nenhuma
**Duração estimada:** 5 min

---

### 🔧 Micro-Tarefa 1.2: Criar Índices de Performance
**Escopo:**
- Índice principal para queries de listagem
- Índice para contagens por status
- Índice para source lookup
- Índice para cleanup de Done antigos
- Índice para category

**Índices a criar:**
```sql
CREATE INDEX idx_teacher_notifications_teacher_status ON teacher_notifications(teacher_id, status);
CREATE INDEX idx_teacher_notifications_teacher_read ON teacher_notifications(teacher_id, is_read);
CREATE INDEX idx_teacher_notifications_source ON teacher_notifications(source_type, source_id);
CREATE INDEX idx_teacher_notifications_created ON teacher_notifications(created_at DESC);
CREATE INDEX idx_teacher_notifications_main_query ON teacher_notifications(teacher_id, status, is_read, created_at DESC);
CREATE INDEX idx_teacher_notifications_category ON teacher_notifications(category);
CREATE INDEX idx_teacher_notifications_cleanup ON teacher_notifications(status, status_changed_at) WHERE status = 'done';
```

**Dependências:** Tarefa 1.1
**Duração estimada:** 3 min

---

### 🔧 Micro-Tarefa 1.3: Criar RLS Policies
**Escopo:**
- Policy SELECT para professores verem suas notificações
- Policy UPDATE para professores atualizarem (status, is_read)
- NÃO criar policy INSERT/DELETE (serão feitos via triggers/edge functions)

**Dependências:** Tarefa 1.1
**Duração estimada:** 3 min

---

### 🔧 Micro-Tarefa 1.4: Criar RPC `get_teacher_notification_counts`
**Escopo:**
- Função SECURITY DEFINER
- Retorna contagem por status (inbox, saved, done)
- Validação de auth.uid()

**Dependências:** Tarefa 1.1
**Duração estimada:** 5 min

---

### 🔧 Micro-Tarefa 1.5: Criar RPC `get_teacher_notifications`
**Escopo:**
- Função SECURITY DEFINER com paginação
- JOIN com classes, invoices, profiles para enriquecer dados
- Filtros: status, urgency, is_read
- Filtro `is_experimental = false` e `is_template = false`
- Fallback para student_name NULL ('Aluno não identificado')
- Exception handling

**Dependências:** Tarefa 1.1
**Duração estimada:** 15 min

---

### 🔧 Micro-Tarefa 1.6: Criar RPC `update_notification_status`
**Escopo:**
- Atualiza status (inbox → saved → done)
- Atualiza status_changed_at
- Valida ownership via auth.uid()

**Dependências:** Tarefa 1.1
**Duração estimada:** 3 min

---

### 🔧 Micro-Tarefa 1.7: Criar RPC `mark_notification_read`
**Escopo:**
- Marca is_read = true
- Atualiza read_at
- Valida ownership

**Dependências:** Tarefa 1.1
**Duração estimada:** 3 min

---

### 🔧 Micro-Tarefa 1.8: Criar Triggers de Auto-Remoção
**Escopo:**
- Trigger para remover notificação quando aula é confirmada/cancelada/concluída
- Trigger para remover quando anistia é concedida
- Trigger para remover quando fatura é paga (tratando status 'overdue', 'paga', 'paid', 'cancelada')
- Trigger para remover quando relatório é criado
- Triggers ON DELETE para classes e invoices (órfãos)

**CORREÇÕES CRÍTICAS:**
- Usar `'cancelada'` (não `'cancelado'`)
- Tratar transição de `'overdue'` para resolvido
- Tratar inconsistência `'paga'` vs `'paid'`

**Dependências:** Tarefa 1.1
**Duração estimada:** 10 min

---

### 🔧 Micro-Tarefa 1.9: Criar Edge Function `generate-teacher-notifications`
**Escopo:**
- Criar diretório `supabase/functions/generate-teacher-notifications/`
- Criar `index.ts` com lógica de varredura
- 4 varreduras: pending_past_classes, amnesty_eligible, overdue_invoices, pending_reports
- Filtros: últimos 30 dias, is_experimental = false, is_template = false
- Query dupla para overdue (status físico + fallback calculado)
- Validação de business_profile para faturas
- Proxy de nome do plano para class_reports (professional/premium)
- Filtrar subscription_status IN ('active', 'trialing')
- Cleanup de Done > 30 dias

**Dependências:** Tarefa 1.1
**Duração estimada:** 25 min

---

### 🔧 Micro-Tarefa 1.10: Configurar Edge Function no config.toml
**Escopo:**
- Adicionar seção `[functions.generate-teacher-notifications]`
- Configurar `verify_jwt = false`

**Dependências:** Tarefa 1.9
**Duração estimada:** 2 min

---

### 🔧 Micro-Tarefa 1.11: Documentar Configuração do Cron Job
**Escopo:**
- Criar/atualizar doc com SQL para pg_cron
- Cron expression: `0 * * * *` (a cada hora)
- Instruções para execução manual no SQL Editor

**NOTA:** Execução do SQL é manual após deploy

**Dependências:** Tarefa 1.9
**Duração estimada:** 5 min

---

## FASE 2: UI BASE (FRONTEND)

### 🎨 Micro-Tarefa 2.1: Criar Types em `src/types/inbox.ts`
**Escopo:**
- NotificationStatus, NotificationCategory, UrgencyLevel
- NotificationSourceType ('class' | 'invoice')
- NotificationCounts, NotificationFilters
- TeacherNotification (interface completa)
- Metadata types por categoria
- CATEGORY_CONFIG, URGENCY_STYLES, READ_STYLES

**Dependências:** Nenhuma
**Duração estimada:** 10 min

---

### 🎨 Micro-Tarefa 2.2: Criar Hooks
**Escopo:**
- `src/hooks/useTeacherNotifications.ts`
  - Hook com react-query para listar notificações
  - Suporte a paginação (offset + loadMore)
  - Hook `useNotificationCounts` para contagens
- `src/hooks/useNotificationActions.ts`
  - Mutations para updateStatus, markAsRead
  - Invalidação de queries
  - Toast feedback

**Dependências:** Tarefa 2.1
**Duração estimada:** 15 min

---

### 🎨 Micro-Tarefa 2.3: Criar Componente `NotificationBell`
**Escopo:**
- `src/components/NotificationBell.tsx`
- Ícone de sino com badge de contagem
- Clique navega para /inbox
- Usa `useNotificationCounts`

**Dependências:** Tarefa 2.2
**Duração estimada:** 5 min

---

### 🎨 Micro-Tarefa 2.4: Criar Componentes Inbox (Pasta)
**Escopo:**
- `src/components/Inbox/InboxTabs.tsx` - Abas Inbox/Salvas/Done
- `src/components/Inbox/InboxFilters.tsx` - Filtros urgência/lidas
- `src/components/Inbox/NotificationItem.tsx` - Card de notificação com ações
- `src/components/Inbox/InboxEmptyState.tsx` - Estado vazio por aba
- `src/components/Inbox/InboxSkeleton.tsx` - Loading skeleton

**Dependências:** Tarefa 2.1, 2.2
**Duração estimada:** 25 min

---

### 🎨 Micro-Tarefa 2.5: Criar Página `/inbox`
**Escopo:**
- `src/pages/Inbox.tsx`
- Composição dos componentes
- Estado local para activeTab e filters
- Paginação com "Carregar Mais"

**Dependências:** Tarefa 2.4
**Duração estimada:** 15 min

---

### 🎨 Micro-Tarefa 2.6: Criar Arquivos i18n
**Escopo:**
- `src/i18n/locales/pt/inbox.json` - Todas as traduções PT
- `src/i18n/locales/en/inbox.json` - Todas as traduções EN
- Chaves: title, subtitle, tabs, filters, categories, actions, empty, errors, pagination

**Dependências:** Nenhuma
**Duração estimada:** 10 min

---

## FASE 3: INTEGRAÇÃO

### 🔗 Micro-Tarefa 3.1: Adicionar Rota `/inbox` no App.tsx
**Escopo:**
- Import do componente Inbox
- Adicionar Route path="/inbox"
- Posicionar ANTES do catch-all "*"

**Dependências:** Tarefa 2.5
**Duração estimada:** 2 min

---

### 🔗 Micro-Tarefa 3.2: Integrar NotificationBell no Layout
**Escopo:**
- Import NotificationBell em Layout.tsx
- Renderizar no header apenas para `isProfessor`
- Posicionar ao lado do ThemeToggle ou user avatar

**Dependências:** Tarefa 2.3
**Duração estimada:** 3 min

---

### 🔗 Micro-Tarefa 3.3: Adicionar Item no AppSidebar
**Escopo:**
- Import ícone Bell
- Adicionar item "Notificações" no menu
- Restringir visibilidade para professores
- Atualizar navigation.json (PT e EN) com chave `sidebar.inbox`

**Dependências:** Tarefa 2.6
**Duração estimada:** 5 min

---

### 🔗 Micro-Tarefa 3.4: Implementar Deep-Linking em Agenda.tsx
**Escopo:**
- Adicionar `useSearchParams`
- Processar params: date, classId, action
- Navegar para data especificada
- Destacar/selecionar aula
- Toast guia para action=amnesty (Dialog interno do AmnestyButton)
- Limpar params após processar

**Dependências:** Nenhuma (pode ser feito em paralelo)
**Duração estimada:** 15 min

---

### 🔗 Micro-Tarefa 3.5: Implementar Deep-Linking em Faturas.tsx
**Escopo:**
- Adicionar `useSearchParams`
- Processar param: highlight
- Scroll para fatura destacada
- Animação de highlight (ring-2, animate-pulse)
- Limpar params após processar

**Dependências:** Nenhuma (pode ser feito em paralelo)
**Duração estimada:** 10 min

---

## FASE 4: TESTES E REFINAMENTOS

### ✅ Micro-Tarefa 4.1: Testar Fluxos Completos
**Escopo:**
- Testar criação de notificações via Edge Function
- Testar triagem (Done, Save, Undo)
- Testar navegação e deep-linking
- Testar auto-remoção via triggers
- Testar filtros e paginação

**Dependências:** Todas as anteriores
**Duração estimada:** 30 min

---

## RESUMO DA DIVISÃO

| Fase | Quantidade | Escopo |
|------|------------|--------|
| Fase 1: Backend | 11 tarefas | Tabela, índices, RLS, RPCs, triggers, edge function |
| Fase 2: Frontend | 6 tarefas | Types, hooks, componentes, página, i18n |
| Fase 3: Integração | 5 tarefas | Rotas, header, sidebar, deep-linking |
| Fase 4: Testes | 1 tarefa | Validação completa |
| **TOTAL** | **23 tarefas** | **Implementação completa** |

---

## ORDEM RECOMENDADA DE EXECUÇÃO

```
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 1: Fundação Backend (Tarefas 1.1 → 1.8)                   │
│ - Pode ser feito em uma única migration                         │
│ - Resultado: Banco pronto para receber notificações             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 2: Edge Function (Tarefas 1.9 → 1.11)                     │
│ - Criar função + configuração                                   │
│ - Resultado: Sistema pode gerar notificações automaticamente    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 3: Types e Hooks (Tarefas 2.1 → 2.2)                      │
│ - Fundação do frontend                                          │
│ - Resultado: Lógica de dados pronta                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 4: Componentes UI (Tarefas 2.3 → 2.6)                     │
│ - Todos os componentes visuais                                  │
│ - Resultado: Interface do inbox completa                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 5: Integração (Tarefas 3.1 → 3.5)                         │
│ - Conectar tudo                                                 │
│ - Resultado: Inbox acessível e funcional                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BLOCO 6: Testes (Tarefa 4.1)                                    │
│ - Validação end-to-end                                          │
│ - Resultado: Sistema pronto para produção                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## CHECKLIST PARA ACOMPANHAMENTO

### Fase 1: Infraestrutura Backend
- [x] 1.1 - Criar tabela `teacher_notifications`
- [x] 1.2 - Criar índices de performance (7 índices)
- [x] 1.3 - Criar RLS policies (SELECT + UPDATE)
- [x] 1.4 - Criar RPC `get_teacher_notification_counts`
- [x] 1.5 - Criar RPC `get_teacher_notifications` (com paginação e enriquecimento)
- [x] 1.6 - Criar RPC `update_notification_status`
- [x] 1.7 - Criar RPC `mark_notification_read`
- [x] 1.8 - Criar triggers de auto-remoção (5 triggers)
- [ ] 1.9 - Criar Edge Function `generate-teacher-notifications`
- [ ] 1.10 - Configurar em `config.toml`
- [ ] 1.11 - Documentar SQL do cron job (pg_cron)

### Fase 2: UI Base Frontend
- [ ] 2.1 - Criar `src/types/inbox.ts`
- [ ] 2.2 - Criar hooks (`useTeacherNotifications`, `useNotificationActions`)
- [ ] 2.3 - Criar `NotificationBell.tsx`
- [ ] 2.4 - Criar componentes Inbox (5 arquivos)
- [ ] 2.5 - Criar página `Inbox.tsx`
- [ ] 2.6 - Criar arquivos i18n (pt/inbox.json, en/inbox.json)

### Fase 3: Integração
- [ ] 3.1 - Adicionar rota `/inbox` em App.tsx
- [ ] 3.2 - Integrar NotificationBell no Layout.tsx
- [ ] 3.3 - Adicionar item "Notificações" no AppSidebar + navigation.json
- [ ] 3.4 - Implementar deep-linking em Agenda.tsx
- [ ] 3.5 - Implementar deep-linking em Faturas.tsx

### Fase 4: Testes
- [ ] 4.1 - Testar fluxos completos

---

## PRÓXIMO PASSO

✅ **BLOCO 1 CONCLUÍDO** - Banco de dados pronto com tabela, índices, RLS, RPCs e triggers.

Próximo: **Bloco 2: Edge Function** (Tarefas 1.9-1.11)
