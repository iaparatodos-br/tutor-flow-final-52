

# Diagnostico: Senha do aluno nao salva e tela pisca

## Causa raiz

Quando o aluno clica "Salvar senha" no `ForcePasswordChange`, a seguinte sequencia ocorre:

1. `supabase.auth.updateUser({ password })` e chamado (linha 76)
2. Supabase processa e emite evento `USER_UPDATED` via `onAuthStateChange`
3. O handler no `AuthContext` faz `setProfileLoading(true)` (linha 237)
4. `loading` (= `loading || profileLoading`) fica `true`
5. `App.tsx` linha 55: renderiza spinner de loading → **ForcePasswordChange DESMONTA**
6. Todos os estados do formulario sao perdidos (reset para vazio)
7. `loadProfile` retorna perfil do **cache** (ainda com `password_changed: false`)
8. ForcePasswordChange remonta com formulario vazio → aluno fica preso
9. O codigo apos o `await updateUser` (update do `password_changed`) pode nao executar de forma confiavel porque o componente foi destruido durante a operacao

**Senha incorreta no login**: A funcao `updateUser` pode ter completado no backend, mas como o `password_changed` nunca foi atualizado (codigo interrompido), o aluno fica preso na tela. Ao tentar login novamente, a sessao anterior (magic link) pode estar conflitando, ou o `updateUser` falhou silenciosamente devido a timing da sessao.

## Correcao (2 arquivos)

### 1. `src/contexts/AuthContext.tsx` — onAuthStateChange handler

Nao setar `profileLoading(true)` para eventos `USER_UPDATED` e `TOKEN_REFRESHED`. Apenas para eventos que realmente mudam o usuario (login, logout, signup):

```typescript
// No handler de onAuthStateChange:
if (session?.user) {
  // Apenas mostrar loading para eventos de login/signup, nao para USER_UPDATED
  const showLoading = event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
  if (showLoading) {
    setupLoadingTimeout();
    setProfileLoading(true);
  }
  
  setTimeout(async () => {
    try {
      // Para USER_UPDATED, invalidar cache antes de recarregar
      if (event === 'USER_UPDATED') {
        profileCache.delete(session.user.id);
      }
      const userProfile = await loadProfile(session.user);
      setProfile(userProfile);
    } catch (error) { ... }
    finally {
      if (showLoading) {
        setProfileLoading(false);
        setLoading(false);
      }
    }
  }, 0);
}
```

Isso evita que o App mostre o spinner e desmonte o ForcePasswordChange durante a operacao.

### 2. `src/pages/ForcePasswordChange.tsx` — handlePasswordChange

Tornar a operacao mais robusta:
- Invalidar o cache do perfil manualmente (importar `profileCache` ou exportar funcao de invalidacao)
- Reduzir o delay de redirect de 2s para 500ms
- Usar `window.location.replace` em vez de `window.location.href` para evitar loop no historico
- Adicionar um estado `passwordSaved` para evitar que re-renders resetem o formulario durante o processo

```typescript
// Adicionar ref para proteger contra re-renders
const [passwordSaved, setPasswordSaved] = useState(false);

// No inicio do componente:
if (passwordSaved) {
  return (
    <div>Senha salva com sucesso! Redirecionando...</div>
  );
}

// No handlePasswordChange, ANTES de chamar updateUser:
setPasswordSaved(true); // Proteger contra unmount/remount

// Apos ambas operacoes:
setTimeout(() => {
  window.location.replace(redirectPath);
}, 500);
```

### 3. `src/contexts/AuthContext.tsx` — Exportar funcao para invalidar cache

Adicionar funcao `invalidateProfileCache` exportada para que ForcePasswordChange possa limpar o cache apos atualizar o perfil:

```typescript
export const invalidateProfileCache = (userId: string) => {
  profileCache.delete(userId);
};
```

## Arquivos impactados

| Arquivo | Alteracao |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Nao mostrar loading em USER_UPDATED + exportar invalidateProfileCache |
| `src/pages/ForcePasswordChange.tsx` | Estado de protecao contra re-render + invalidar cache + redirect rapido |

