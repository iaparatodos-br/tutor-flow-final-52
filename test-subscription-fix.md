# Teste da Correção do Modal de Seleção de Alunos

## Problema Identificado
- Usuário com 5 alunos teve a assinatura expirada
- Deveria aparecer modal para selecionar 2 alunos para remoção (plano gratuito permite 3)
- Modal nunca apareceu

## Correções Implementadas

### 1. Corrigida query SQL ambígua
**Arquivo:** `supabase/functions/check-subscription-status/index.ts`
**Linha:** 30-39
**Problema:** Query com relação ambígua entre `teacher_student_relationships` e `profiles`
**Solução:** Especificada a foreign key correta:
```sql
profiles!teacher_student_relationships_student_id_fkey(name, email)
```

### 2. Adicionada verificação para subscriptions expiradas
**Arquivo:** `supabase/functions/check-subscription-status/index.ts`
**Problemas:** 
- Função só buscava subscriptions com status 'active'
- Não verificava subscriptions já expiradas que precisam seleção de alunos

**Soluções:**
- Alterada busca para incluir status 'expired': `.in('status', ['active', 'expired'])`
- Adicionada condição para processar também subscriptions expiradas: `|| subscription.status === 'expired'`
- Proteção para não atualizar status se já estiver expirado

## Resultado Esperado
Agora quando a função `check-subscription-status` for chamada:
1. Detectará que há 5 alunos e plano gratuito permite 3
2. Retornará `needs_student_selection: true` com dados dos alunos
3. `SubscriptionContext` ativará o modal `StudentSelectionBlocker`
4. Usuário poderá selecionar 2 alunos para remoção

## Teste
Para testar, o usuário deve:
1. Fazer logout e login novamente
2. Ou aguardar verificação automática à meia-noite
3. Ou navegar para uma página que force refresh da subscription

A próxima chamada para `check-subscription-status` deve detectar a situação e mostrar o modal.