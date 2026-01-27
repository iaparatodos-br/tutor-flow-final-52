
# Plano: Aplicar 5 Correções Finais no Documento Teacher Inbox

## Objetivo
Corrigir os 5 gaps técnicos identificados na revisão final do documento `docs/teacher-inbox-implementation.md`.

---

## Correções a Aplicar

### 1. Corrigir FK da Edge Function (Query de Features)

**Problema Identificado:**
A query atual na Edge Function tenta fazer um JOIN direto entre `profiles` e `subscription_plans` via `current_plan_id`, mas isso não reflete corretamente o status de assinatura ativa.

**Correção:**
Usar a tabela `user_subscriptions` como intermediária, que possui:
- `user_id` (FK para profiles)
- `plan_id` (FK para subscription_plans)
- `status` (para verificar se está 'active')

**Código Corrigido:**
```typescript
// ANTES (incorreto):
const { data: teachersWithReports } = await supabase
  .from("profiles")
  .select(`id, current_plan_id, subscription_status,
    subscription_plans!profiles_current_plan_id_fkey(features)`)
  .eq("role", "professor")
  .not("current_plan_id", "is", null)
  .eq("subscription_status", "active");

// DEPOIS (correto - usando user_subscriptions):
const { data: teachersWithReports } = await supabase
  .from("user_subscriptions")
  .select(`user_id, subscription_plans!inner(features)`)
  .eq("status", "active");
```

---

### 2. Tratativa para `student_name` NULL

**Problema Identificado:**
A RPC `get_teacher_notifications` pode retornar `student_name = NULL` para:
- Registros legados sem nome preenchido
- Aulas em grupo (já tratado, retorna 'Aula em Grupo')
- Participantes sem dados de profile

**Correção:**
Adicionar COALESCE adicional no final e documentar tratativa explícita:
```sql
'student_name', 
  CASE 
    WHEN c.is_group_class THEN 'Aula em Grupo'
    ELSE COALESCE(tsr.student_name, p.name, 'Aluno não identificado')
  END,
```

E no TypeScript, garantir fallback na renderização:
```tsx
<span>{notification.student_name || 'Aluno'}</span>
```

---

### 3. Documentar Opção de Trigger para Criação em Tempo Real

**Problema Identificado:**
O documento só descreve triggers de REMOÇÃO de notificações. Não há triggers para CRIAÇÃO em tempo real quando:
- Uma aula passa da data sem ser confirmada
- Uma fatura vence sem ser paga

**Correção:**
Adicionar seção documentando que isso é uma **melhoria opcional para Fase 4** (não obrigatória para MVP), com SQL de exemplo:

```sql
-- OPCIONAL: Trigger para criar notificação quando aula passa da data
CREATE OR REPLACE FUNCTION create_notification_on_class_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status ainda é 'pendente' e class_date passou
  IF NEW.status = 'pendente' 
     AND NEW.class_date < NOW() 
     AND NEW.is_experimental = false 
     AND NEW.is_template = false THEN
    
    INSERT INTO teacher_notifications (teacher_id, source_type, source_id, category)
    VALUES (NEW.teacher_id, 'class', NEW.id, 'pending_past_classes')
    ON CONFLICT (teacher_id, source_type, source_id, category) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTA: Este trigger rodaria em EVERY update, pode ter impacto de performance
-- Alternativa: usar apenas o cron job diário (abordagem atual)
```

---

### 4. Adicionar Seção de Paginação na UI

**Problema Identificado:**
O documento menciona `p_limit` e `p_offset` na RPC, mas não documenta como implementar paginação/infinite scroll na UI.

**Correção:**
Adicionar seção "Paginação e Performance" com:

```typescript
// Hook com paginação
export function useTeacherNotifications(options: UseTeacherNotificationsOptions) {
  const { status, filters, limit = 50 } = options;
  const [offset, setOffset] = useState(0);
  
  const query = useQuery({
    queryKey: ['teacher-notifications', teacherId, status, filters, offset],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_teacher_notifications', {
        p_teacher_id: teacherId,
        p_status: status,
        p_urgency: filters?.urgency ?? null,
        p_is_read: filters?.isRead ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return data as TeacherNotification[];
    },
    enabled: !!teacherId,
  });

  const loadMore = () => setOffset(prev => prev + limit);
  const hasMore = (query.data?.length ?? 0) === limit;

  return { ...query, loadMore, hasMore };
}

// UI com "Carregar Mais"
{hasMore && (
  <Button variant="outline" onClick={loadMore} disabled={isLoading}>
    {t('loadMore')}
  </Button>
)}
```

---

### 5. Incluir Validação de `business_profile_id` na Query de Faturas

**Problema Identificado:**
A Edge Function busca faturas atrasadas sem verificar se o professor tem um `business_profile` ativo. Professores sem business profile não deveriam receber alertas de faturas.

**Correção:**
Adicionar validação na query de faturas:

```typescript
// Query de faturas atrasadas COM validação de business_profile
const { data: overdueInvoices, error: overdueError } = await supabase
  .from("invoices")
  .select("id, teacher_id, business_profile_id")
  .eq("status", "pendente")
  .lt("due_date", now)
  .gte("due_date", thirtyDaysAgo)
  .not("business_profile_id", "is", null); // Apenas faturas com business_profile

// OU: Buscar professores com business_profile ativo primeiro
const { data: teachersWithBP } = await supabase
  .from("business_profiles")
  .select("user_id")
  .not("stripe_connect_id", "is", null);

const teacherIdsWithBP = new Set(teachersWithBP?.map(bp => bp.user_id) || []);

// Depois, filtrar faturas apenas de professores com BP
for (const inv of overdueInvoices || []) {
  if (!teacherIdsWithBP.has(inv.teacher_id)) continue;
  // ... criar notificação
}
```

---

## Arquivos a Modificar

| Arquivo | Seção | Correção |
|---------|-------|----------|
| `docs/teacher-inbox-implementation.md` | Edge Function | Corrigir query de features para usar `user_subscriptions` |
| `docs/teacher-inbox-implementation.md` | RPC get_teacher_notifications | Adicionar fallback 'Aluno não identificado' |
| `docs/teacher-inbox-implementation.md` | Nova seção após Triggers | Documentar trigger opcional de criação em tempo real |
| `docs/teacher-inbox-implementation.md` | Nova seção após InboxPage | Adicionar "Paginação e Performance" |
| `docs/teacher-inbox-implementation.md` | Edge Function - Faturas | Adicionar validação de business_profile_id |
| `docs/teacher-inbox-implementation.md` | Checklist | Atualizar para incluir novos itens validados |

---

## Resultado Esperado

Após aplicar as 5 correções:

1. **Edge Function** usará a estrutura correta de FK (`user_subscriptions` → `subscription_plans`)
2. **RPC** terá fallback seguro para student_name NULL
3. **Triggers em tempo real** estarão documentados como melhoria opcional
4. **Paginação** estará documentada com implementação de "Carregar Mais"
5. **Validação de business_profile** garantirá que apenas professores com conta configurada recebam alertas de faturas

O documento passará de **17 correções validadas** para **22 correções validadas** (5 novas).
