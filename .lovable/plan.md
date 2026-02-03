
# Plano: Corrigir Bug de Exclusão de Notificações na Inbox

## Problema Identificado

Após investigação completa com logs de console e network requests, descobri que:

1. **O botão funciona**: O clique dispara o `handleDelete` (log confirmado)
2. **A API responde com sucesso**: Request DELETE retorna Status 204 (sucesso)
3. **A notificação É removida do banco de dados**

O problema está na **atualização da UI após a exclusão**. O callback `onSuccess` da mutation deveria invalidar os caches do React Query e forçar um refetch, mas a lista não atualiza.

## Causa Raiz

A query usa uma chave composta: `['teacher-notifications-infinite', filters]`

A invalidação atual funciona assim:
```typescript
queryClient.invalidateQueries({ queryKey: ['teacher-notifications-infinite'] });
```

Isso **deveria** invalidar todas as queries que começam com essa chave (comportamento padrão). Entretanto, pode haver um timing issue ou a invalidação não está disparando o refetch corretamente.

## Solução Proposta

### 1. Adicionar Logs de Debug no `onSuccess`

Primeiro, vou adicionar logs para confirmar que o `onSuccess` está sendo executado:

```typescript
onSuccess: () => {
  console.log('[useDeleteNotification] Success - invalidating queries');
  queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] });
  queryClient.invalidateQueries({ queryKey: ['teacher-notifications-infinite'] });
  queryClient.invalidateQueries({ queryKey: ['teacher-notification-counts'] });
  console.log('[useDeleteNotification] Queries invalidated');
  
  toast({
    description: t('actions.dismissed'),
  });
},
```

### 2. Forçar Refetch Imediato

Se a invalidação não forçar refetch, usar `refetchQueries` ao invés de `invalidateQueries`:

```typescript
onSuccess: () => {
  // Refetch forçado ao invés de apenas invalidar
  queryClient.refetchQueries({ queryKey: ['teacher-notifications'] });
  queryClient.refetchQueries({ queryKey: ['teacher-notifications-infinite'] });
  queryClient.refetchQueries({ queryKey: ['teacher-notification-counts'] });
  
  toast({
    description: t('actions.dismissed'),
  });
},
```

### 3. Alternativa: Atualização Otimista

Se o refetch não resolver, implementar update otimista removendo o item do cache localmente:

```typescript
onMutate: async (notificationId: string) => {
  // Cancelar queries em andamento
  await queryClient.cancelQueries({ queryKey: ['teacher-notifications-infinite'] });
  
  // Snapshot do estado anterior
  const previousData = queryClient.getQueryData(['teacher-notifications-infinite']);
  
  // Remover otimistamente do cache
  queryClient.setQueryData(['teacher-notifications-infinite'], (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: TeacherNotification[]) => 
        page.filter(n => n.id !== notificationId)
      ),
    };
  });
  
  return { previousData };
},
onError: (err, notificationId, context) => {
  // Reverter em caso de erro
  if (context?.previousData) {
    queryClient.setQueryData(['teacher-notifications-infinite'], context.previousData);
  }
},
```

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useNotificationActions.ts` | Corrigir `useDeleteNotification` com logs, `refetchQueries`, e/ou atualização otimista |

## Sequência de Implementação

1. Adicionar logs de debug no `onSuccess`
2. Testar se o callback está sendo executado
3. Se sim, trocar `invalidateQueries` por `refetchQueries`
4. Se ainda não funcionar, implementar atualização otimista

## Resultado Esperado

Ao clicar no botão de dispensar (🔕):
1. A notificação é removida do banco de dados (já funciona)
2. Um toast "Notificação removida" aparece
3. A lista atualiza imediatamente, removendo o item da UI
