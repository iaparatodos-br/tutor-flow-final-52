

# Plano: Corrigir Modal de Verificacao de Email que Nao Aparece

## Diagnostico do Problema

Apos testes extensivos, identifiquei que o modal de verificacao de email **nao esta aparecendo** apos o cadastro bem-sucedido. O cadastro funciona corretamente (retorna `success: true`), mas o modal nao e exibido.

### Causas Provaveis

1. **Problema com Dialog sem `onOpenChange`**: O Radix UI Dialog, quando usado em modo controlado (`open={...}`), requer um `onOpenChange` mesmo que seja apenas para evitar warnings. Sem ele, pode haver comportamentos inesperados.

2. **Race Condition com Loading**: O `AuthContext.signUp` chama `setLoading(true/false)` internamente, e o `Auth.tsx` tambem tem seu proprio `loading` state. Isso pode causar re-renderizacoes que interferem com o estado do modal.

3. **Stale Closure**: O `signupForm.email` pode estar capturando um valor antigo devido a closures do React.

## Solucao Proposta

### 1. Adicionar `onOpenChange` ao Dialog

Mesmo que nao queiramos que o Dialog feche, precisamos fornecer um handler vazio para garantir que o Radix UI funcione corretamente:

```tsx
<Dialog 
  open={showEmailVerificationModal} 
  onOpenChange={() => {/* Nao fazer nada - modal barrier dismissible */}}
>
```

### 2. Usar Callback para Garantir Estado Correto

Garantir que o email seja capturado corretamente antes de chamar `signUp`:

```tsx
const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // ... validacoes ...
  
  setLoading(true);
  
  // Capturar email ANTES da chamada async
  const emailToRegister = signupForm.email;
  
  const { error } = await signUp(...);
  
  if (error) {
    toast({ ... });
  } else {
    setRegisteredEmail(emailToRegister);
    setShowEmailVerificationModal(true);
  }
  
  setLoading(false);
};
```

### 3. Adicionar Console Logs para Debug

Adicionar logs temporarios para verificar se o fluxo esta correto:

```tsx
console.log('[Auth] Signup success, showing modal for:', emailToRegister);
setRegisteredEmail(emailToRegister);
setShowEmailVerificationModal(true);
console.log('[Auth] Modal state set to true');
```

## Alteracoes no Arquivo

### `src/pages/Auth.tsx`

1. Modificar o Dialog para incluir `onOpenChange`:

```tsx
<Dialog 
  open={showEmailVerificationModal} 
  onOpenChange={() => {/* Barrier dismissible - nao fechar */}}
>
```

2. Capturar email antes da chamada async no `handleSignup`:

```tsx
const emailToRegister = signupForm.email;
// ... await signUp ...
setRegisteredEmail(emailToRegister);
```

3. Adicionar logs de debug (remover depois de confirmar funcionamento)

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Auth.tsx` | Adicionar `onOpenChange` vazio ao Dialog, capturar email antes da chamada async |

## Validacao Apos Implementacao

1. Acessar `/auth` e ir para aba de cadastro
2. Preencher formulario com dados validos
3. Clicar em "Criar Conta"
4. **Modal DEVE aparecer** com icone de email e mensagem
5. Verificar que nao fecha ao clicar fora
6. Verificar que nao fecha ao pressionar ESC
7. Clicar em "Entendi" - modal fecha e volta para aba de login

