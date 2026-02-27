

# Fix: Aluno fica preso na tela de senha apos salvar

## Causa raiz confirmada

Os logs de autenticacao mostram a sequencia exata:
1. `00:39:22` - Aluno clica no magic link → login implicito
2. `00:39:38` - `user_modified` (PUT /user 200) → **senha salva com sucesso no Supabase Auth**
3. `00:39:39` - Logout (1 segundo depois)
4. `00:39:56` - Login com senha nova → **funciona!**
5. `00:44:57-00:46:02` - Multiplos erros `same_password` (422) → aluno ve ForcePasswordChange de novo e tenta a mesma senha
6. DB confirma: `password_changed = false`, `updated_at = 2026-02-26` (nunca foi atualizado)

**A senha e salva corretamente no Supabase Auth, mas o update `password_changed = true` na tabela `profiles` falha silenciosamente.** Isso acontece porque `supabase.auth.updateUser()` pode invalidar/renovar o JWT atual, e a chamada subsequente `supabase.from("profiles").update(...)` usa um token potencialmente invalido, falhando pela RLS sem retornar erro explicito.

Alem disso, o erro `same_password` (422) nao e tratado - quando o aluno tenta novamente com a mesma senha, recebe um erro generico em vez de o sistema reconhecer que a senha ja foi definida.

## Correcao (1 arquivo)

### `src/pages/ForcePasswordChange.tsx`

Tres mudancas:

1. **Inverter a ordem**: Atualizar `password_changed = true` no banco ANTES de chamar `updateUser`. Se o `updateUser` falhar, reverter o flag.

2. **Tratar erro `same_password`**: Se Supabase retornar erro 422 "same_password", significa que a senha ja foi salva anteriormente. Nesse caso, apenas garantir que `password_changed = true` e redirecionar.

3. **Apos sucesso, fazer signOut e redirecionar para /auth** (conforme preferencia do usuario).

```typescript
const handlePasswordChange = async (e: React.FormEvent) => {
  e.preventDefault();
  // ... validacoes existentes ...

  setIsLoading(true);
  setPasswordSaved(true);

  try {
    // 1. PRIMEIRO: Atualizar flag no banco (enquanto JWT ainda e valido)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ password_changed: true })
      .eq("id", profile?.id);

    if (profileError) {
      setPasswordSaved(false);
      throw profileError;
    }

    // 2. DEPOIS: Atualizar senha no Auth (pode invalidar JWT)
    const { error: authError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (authError) {
      // Se erro "same_password", a senha ja foi salva - apenas redirecionar
      if (authError.message?.includes('same_password') || 
          authError.message?.includes('should be different')) {
        // Senha ja existe, flag ja atualizado - sucesso
      } else {
        // Reverter flag do perfil
        await supabase.from("profiles")
          .update({ password_changed: false })
          .eq("id", profile?.id);
        setPasswordSaved(false);
        throw authError;
      }
    }

    // 3. Invalidar cache
    if (profile?.id) invalidateProfileCache(profile.id);

    // 4. Registrar termos (se aplicavel) ...

    // 5. SignOut + redirecionar para login
    toast({ title: t('messages.success'), description: t('messages.successDescription') });
    
    await supabase.auth.signOut();
    setTimeout(() => {
      window.location.replace('/auth');
    }, 500);

  } catch (error) { ... }
};
```

### Dados a corrigir

Alem da correcao no codigo, o aluno `690866dd-6960-4c3a-a02c-9c333db9f744` (cdevarzea@gmail.com) precisa ter seu flag corrigido manualmente no banco:

```sql
UPDATE profiles SET password_changed = true WHERE id = '690866dd-6960-4c3a-a02c-9c333db9f744';
```

## Arquivos impactados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/ForcePasswordChange.tsx` | Inverter ordem (profile antes de auth), tratar same_password, signOut + redirect para /auth |
| Banco de dados | UPDATE manual para corrigir aluno preso |

