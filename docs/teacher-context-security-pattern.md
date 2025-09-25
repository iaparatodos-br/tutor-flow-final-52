# Padrão de Segurança: Contexto de Professores

## Visão Geral

Este documento define o padrão obrigatório para implementação de páginas do aluno que garantem isolamento completo de dados entre diferentes professores.

## Princípios Fundamentais

### 1. **Isolamento Absoluto de Dados**
- Cada consulta DEVE ser filtrada pelo `selectedTeacherId`
- Nunca permitir acesso cross-teacher sem autorização explícita
- Dados financeiros JAMAIS devem vazar entre contextos

### 2. **Contexto Obrigatório**
- Todas as páginas do aluno DEVEM usar `useTeacherContext()`
- Loading states são obrigatórios enquanto contexto não estiver disponível
- Páginas não devem renderizar sem contexto válido

### 3. **Validação de Segurança**
- RLS policies como camada secundária de proteção
- Validação client-side E server-side
- Logs de auditoria para operações sensíveis

## Padrão de Implementação

### Template Base para Páginas do Aluno

```tsx
import React from 'react';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const StudentPage: React.FC = () => {
  const { selectedTeacherId, teachers, loading: contextLoading } = useTeacherContext();

  // 1. SEMPRE verificar contexto primeiro
  if (contextLoading) {
    return <div>Carregando contexto...</div>;
  }

  if (!selectedTeacherId) {
    return <div>Selecione um professor</div>;
  }

  // 2. OBRIGATÓRIO: Filtrar por selectedTeacherId
  const { data, loading, error } = useQuery({
    queryKey: ['student-data', selectedTeacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table_name')
        .select('*')
        .eq('teacher_id', selectedTeacherId); // OBRIGATÓRIO

      if (error) throw error;
      return data;
    },
    enabled: !!selectedTeacherId, // OBRIGATÓRIO
  });

  // 3. Estados de loading específicos
  if (loading) return <div>Carregando dados...</div>;
  if (error) return <div>Erro: {error.message}</div>;

  return (
    <div>
      {/* Conteúdo da página */}
    </div>
  );
};

export default StudentPage;
```

### Padrões de Query Obrigatórios

#### ✅ CORRETO - Com Filtro de Contexto
```tsx
const { data: classes } = useQuery({
  queryKey: ['classes', selectedTeacherId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', selectedTeacherId) // OBRIGATÓRIO
      .order('class_date', { ascending: false });
    
    if (error) throw error;
    return data;
  },
  enabled: !!selectedTeacherId,
});
```

#### ❌ ERRADO - Sem Filtro de Contexto
```tsx
// NUNCA FAZER ISSO
const { data: classes } = useQuery({
  queryKey: ['classes'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*'); // PERIGOSO: Pode retornar dados de outros professores
    
    return data;
  },
});
```

### Checklist de Segurança para Consultas

- [ ] **Contexto Validado**: `useTeacherContext()` implementado
- [ ] **Loading State**: Página não renderiza sem contexto
- [ ] **Filtro Obrigatório**: `.eq('teacher_id', selectedTeacherId)`
- [ ] **Query Key**: Inclui `selectedTeacherId`
- [ ] **Enabled Condition**: `enabled: !!selectedTeacherId`
- [ ] **Error Handling**: Tratamento adequado de erros
- [ ] **Dados Financeiros**: Validação extra para invoices/expenses
- [ ] **RLS Policies**: Verificar se existem e estão corretas

## Padrões Específicos por Tipo de Dado

### 1. Dados Financeiros (CRÍTICO)
```tsx
// Invoices, Expenses - Segurança Máxima
const { data: invoices } = useQuery({
  queryKey: ['invoices', selectedTeacherId],
  queryFn: async () => {
    if (!selectedTeacherId) {
      throw new Error('Teacher context required for financial data');
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('teacher_id', selectedTeacherId); // CRÍTICO

    if (error) throw error;
    
    // Validação adicional
    const invalidData = data?.filter(item => item.teacher_id !== selectedTeacherId);
    if (invalidData?.length > 0) {
      console.error('Security violation: Cross-teacher data detected');
      throw new Error('Data security violation');
    }

    return data;
  },
  enabled: !!selectedTeacherId,
});
```

### 2. Dados de Aulas
```tsx
const { data: classes } = useQuery({
  queryKey: ['classes', selectedTeacherId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('classes')
      .select(`
        *,
        class_services(*),
        class_reports(*)
      `)
      .eq('teacher_id', selectedTeacherId)
      .order('class_date', { ascending: false });

    if (error) throw error;
    return data;
  },
  enabled: !!selectedTeacherId,
});
```

### 3. Materiais Compartilhados
```tsx
const { data: materials } = useQuery({
  queryKey: ['shared-materials', selectedTeacherId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('material_access')
      .select(`
        *,
        materials!inner(
          *,
          material_categories(*)
        )
      `)
      .eq('materials.teacher_id', selectedTeacherId) // Filtro na junção
      .eq('student_id', user?.id);

    if (error) throw error;
    return data;
  },
  enabled: !!selectedTeacherId && !!user?.id,
});
```

## Validações de RLS (Row Level Security)

### Templates de Políticas Recomendadas

```sql
-- Para tabelas do aluno (acesso próprio + professores)
CREATE POLICY "Students can access their own data and teachers data"
ON table_name FOR ALL
USING (
  auth.uid() = student_id OR 
  auth.uid() IN (
    SELECT teacher_id FROM teacher_student_relationships 
    WHERE student_id = auth.uid()
  )
);

-- Para dados financeiros (extra segurança)
CREATE POLICY "Financial data requires teacher context"
ON invoices FOR ALL
USING (
  CASE
    WHEN auth.uid() = teacher_id AND is_professor(auth.uid()) 
    THEN teacher_has_financial_module(auth.uid())
    WHEN auth.uid() = student_id 
    THEN true
    ELSE false
  END
);
```

## Testes de Segurança Obrigatórios

### 1. Teste de Isolamento
```tsx
// Verificar que dados de teacher A não aparecem no contexto de teacher B
describe('Data Isolation', () => {
  it('should isolate data by teacher context', async () => {
    // Simular contexto teacher-1
    const data1 = await fetchDataForTeacher('teacher-1-uuid');
    
    // Simular contexto teacher-2  
    const data2 = await fetchDataForTeacher('teacher-2-uuid');
    
    // Verificar isolamento
    expect(data1.every(item => item.teacher_id === 'teacher-1-uuid')).toBe(true);
    expect(data2.every(item => item.teacher_id === 'teacher-2-uuid')).toBe(true);
    
    // Verificar não-sobreposição
    const data1Ids = data1.map(item => item.id);
    const data2Ids = data2.map(item => item.id);
    expect(data1Ids.filter(id => data2Ids.includes(id))).toHaveLength(0);
  });
});
```

### 2. Teste de Vazamento Financeiro
```tsx
describe('Financial Data Security', () => {
  it('should prevent cross-teacher financial access', async () => {
    // Tentar acessar dados financeiros de outro professor
    const result = await supabase
      .from('invoices')
      .select('*')
      .eq('teacher_id', 'other-teacher-uuid');
    
    // Deve retornar vazio devido ao RLS
    expect(result.data).toHaveLength(0);
  });
});
```

## Monitoramento e Auditoria

### Logs de Segurança
```tsx
// Implementar logging para operações sensíveis
const auditLog = async (action: string, resourceType: string, resourceId: string) => {
  await supabase.functions.invoke('audit-logger', {
    body: {
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      teacher_context: selectedTeacherId,
      timestamp: new Date().toISOString()
    }
  });
};

// Usar nos pontos críticos
const accessFinancialData = async () => {
  await auditLog('ACCESS_FINANCIAL_DATA', 'invoices', selectedTeacherId);
  // ... resto da lógica
};
```

## Erros Comuns e Como Evitar

### ❌ Contexto Não Validado
```tsx
// ERRADO
const MyComponent = () => {
  const { selectedTeacherId } = useTeacherContext();
  
  // Renderiza imediatamente sem validar contexto
  return <div>{/* conteúdo */}</div>;
};
```

### ✅ Contexto Validado
```tsx
// CORRETO
const MyComponent = () => {
  const { selectedTeacherId, loading } = useTeacherContext();
  
  if (loading) return <LoadingSpinner />;
  if (!selectedTeacherId) return <SelectTeacherMessage />;
  
  return <div>{/* conteúdo seguro */}</div>;
};
```

### ❌ Query Sem Filtro
```tsx
// ERRADO - Perigoso
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: () => supabase.from('table').select('*') // SEM FILTRO
});
```

### ✅ Query Com Filtro
```tsx
// CORRETO - Seguro
const { data } = useQuery({
  queryKey: ['data', selectedTeacherId],
  queryFn: () => supabase
    .from('table')
    .select('*')
    .eq('teacher_id', selectedTeacherId), // COM FILTRO
  enabled: !!selectedTeacherId
});
```

## Checklist Final para Novas Páginas

### Implementação
- [ ] `useTeacherContext()` importado e usado
- [ ] Loading state implementado  
- [ ] Validação de `selectedTeacherId` antes de renderizar
- [ ] Todas as queries filtradas por `teacher_id`
- [ ] Query keys incluem `selectedTeacherId`
- [ ] Condição `enabled` com `!!selectedTeacherId`

### Segurança
- [ ] RLS policies verificadas e testadas
- [ ] Dados financeiros com validação extra
- [ ] Logs de auditoria em operações críticas
- [ ] Testes de isolamento implementados
- [ ] Verificação de vazamento de dados

### Performance
- [ ] Queries otimizadas com índices apropriados
- [ ] Cache invalidation correta ao trocar contexto
- [ ] Loading states específicos para diferentes tipos de dados

### UX
- [ ] Mensagens claras para estados sem contexto
- [ ] Transições suaves entre contextos de professores
- [ ] Feedback visual durante carregamento
- [ ] Tratamento adequado de erros

## Conclusão

Este padrão é **OBRIGATÓRIO** para todas as páginas do aluno. A segurança dos dados e o isolamento entre contextos de professores é crítico para a integridade da aplicação.

**Lembre-se**: Em caso de dúvida, sempre priorize a segurança. É melhor ser mais restritivo do que permitir vazamento de dados.