# Checklist de Segurança - Consultas do Aluno

## 🔐 Checklist Obrigatório para Implementação

### Antes de Implementar
- [ ] **Contexto de Professor Definido**
  - [ ] `useTeacherContext()` importado
  - [ ] `selectedTeacherId` extraído
  - [ ] Loading state verificado
  - [ ] Validação de contexto válido

### Queries e Consultas
- [ ] **Filtros Obrigatórios**
  - [ ] `.eq('teacher_id', selectedTeacherId)` em TODAS as consultas
  - [ ] Query key inclui `selectedTeacherId`
  - [ ] `enabled: !!selectedTeacherId` configurado
  - [ ] Validação de resposta (se necessário)

- [ ] **Dados Financeiros (CRÍTICO)**
  - [ ] Validação extra antes da consulta
  - [ ] Verificação de teacher_id na resposta
  - [ ] Log de auditoria implementado
  - [ ] Error handling específico

### Row Level Security (RLS)
- [ ] **Políticas Verificadas**
  - [ ] RLS habilitado na tabela
  - [ ] Política de SELECT apropriada
  - [ ] Política de INSERT/UPDATE (se aplicável)
  - [ ] Testado com diferentes usuários

### Estados da UI
- [ ] **Loading States**
  - [ ] Loading do contexto
  - [ ] Loading dos dados
  - [ ] Loading de operações
  - [ ] Estados combinados tratados

- [ ] **Error States**
  - [ ] Contexto não disponível
  - [ ] Erro na consulta
  - [ ] Dados não encontrados
  - [ ] Permissão negada

### Testes Implementados
- [ ] **Testes de Isolamento**
  - [ ] Dados filtrados por professor
  - [ ] Sem vazamento entre contextos
  - [ ] Troca de contexto funcional

- [ ] **Testes de Segurança**
  - [ ] Acesso negado sem contexto
  - [ ] RLS funcionando
  - [ ] Auditoria registrada

## 🚨 Pontos Críticos de Segurança

### ❌ NUNCA FAZER
```tsx
// Consulta sem filtro de professor
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: () => supabase.from('invoices').select('*') // PERIGOSO
});

// Renderizar sem validar contexto
const Component = () => {
  const { selectedTeacherId } = useTeacherContext();
  return <div>{/* dados sensíveis */}</div>; // INSEGURO
};

// Query key sem contexto
queryKey: ['invoices'] // Pode causar cache contamination
```

### ✅ SEMPRE FAZER
```tsx
// Consulta com filtro obrigatório
const { data } = useQuery({
  queryKey: ['invoices', selectedTeacherId],
  queryFn: () => supabase
    .from('invoices')
    .select('*')
    .eq('teacher_id', selectedTeacherId), // SEGURO
  enabled: !!selectedTeacherId
});

// Validar contexto antes de renderizar
const Component = () => {
  const { selectedTeacherId, loading } = useTeacherContext();
  
  if (loading) return <LoadingSpinner />;
  if (!selectedTeacherId) return <SelectTeacher />;
  
  return <div>{/* conteúdo seguro */}</div>;
};
```

## 📊 Template de Validação

### Componente Base Seguro
```tsx
import React from 'react';
import { useTeacherContext } from '@/contexts/TeacherContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SecurePageProps {
  // props específicas
}

const SecurePage: React.FC<SecurePageProps> = () => {
  // ✅ 1. Contexto obrigatório
  const { selectedTeacherId, loading: contextLoading } = useTeacherContext();

  // ✅ 2. Validação de contexto
  if (contextLoading) {
    return <div className="loading">Carregando contexto...</div>;
  }

  if (!selectedTeacherId) {
    return <div className="warning">Selecione um professor</div>;
  }

  // ✅ 3. Query segura
  const { data, loading, error } = useQuery({
    queryKey: ['secure-data', selectedTeacherId], // Com contexto
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table_name')
        .select('*')
        .eq('teacher_id', selectedTeacherId); // Filtro obrigatório

      if (error) throw error;
      
      // ✅ 4. Validação adicional (dados críticos)
      if (data?.some(item => item.teacher_id !== selectedTeacherId)) {
        throw new Error('Data security violation');
      }

      return data;
    },
    enabled: !!selectedTeacherId, // Só executa com contexto
  });

  // ✅ 5. Estados de loading/error
  if (loading) return <div>Carregando dados...</div>;
  if (error) return <div>Erro: {error.message}</div>;

  // ✅ 6. Renderização segura
  return (
    <div>
      {/* Conteúdo da página */}
    </div>
  );
};

export default SecurePage;
```

## 🔍 Validação em Produção

### Comandos de Verificação
```sql
-- Verificar se RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;

-- Verificar políticas de segurança
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';

-- Testar isolamento de dados
SELECT teacher_id, COUNT(*) 
FROM invoices 
GROUP BY teacher_id;
```

### Monitoramento Contínuo
```tsx
// Hook para auditoria automática
const useSecurityAudit = (resourceType: string) => {
  const { selectedTeacherId } = useTeacherContext();
  
  useEffect(() => {
    if (selectedTeacherId) {
      supabase.functions.invoke('audit-logger', {
        body: {
          action: 'ACCESS',
          resource_type: resourceType,
          teacher_context: selectedTeacherId,
          timestamp: new Date().toISOString()
        }
      });
    }
  }, [selectedTeacherId, resourceType]);
};
```

## 📈 Métricas de Segurança

### KPIs para Monitorar
- **Taxa de Isolamento**: 100% dos dados devem ter teacher_id correto
- **Vazamentos de Contexto**: 0 ocorrências por dia
- **Falhas de RLS**: 0 consultas sem filtro apropriado
- **Tentativas de Acesso Cross-Teacher**: Monitorar e alertar

### Alertas Automáticos
```tsx
// Sistema de alerta para violações
const securityAlert = async (violation: SecurityViolation) => {
  await supabase.functions.invoke('security-alert', {
    body: {
      type: violation.type,
      severity: violation.severity,
      user_id: violation.userId,
      teacher_context: violation.teacherContext,
      details: violation.details,
      timestamp: new Date().toISOString()
    }
  });
};
```

## 🎯 Próximos Passos

### Para Novas Funcionalidades
1. **Copiar template base** deste documento
2. **Adaptar para caso específico** (tabelas, relacionamentos)
3. **Implementar testes** de isolamento
4. **Validar RLS policies** no Supabase
5. **Testar em diferentes contextos** de professor
6. **Documentar particularidades** específicas

### Para Revisão de Código
1. **Verificar todos os itens** deste checklist
2. **Executar testes** de segurança
3. **Revisar queries** em busca de filtros faltantes
4. **Validar estados** de loading/error
5. **Testar troca** de contexto de professor

---

**⚠️ LEMBRE-SE**: Este checklist é OBRIGATÓRIO para todas as páginas que acessam dados do aluno. A segurança dos dados é responsabilidade de todos os desenvolvedores.

**🔒 Em caso de dúvida**: Sempre priorize a segurança. É melhor ser mais restritivo que permitir vazamento de dados.