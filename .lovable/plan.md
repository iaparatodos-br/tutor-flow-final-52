

## Bloquear edicao de email do aluno no formulario de edicao

### Contexto

O email do aluno e usado como credencial de login no `auth.users` do Supabase. Ao editar um aluno existente, o formulario atualmente permite alterar o email, mas isso so atualizaria dados superficiais sem alterar o `auth.users`, causando:
- Divergencia entre o email de login e o email no `profiles`
- Quebra no fluxo de convite e verificacao
- Problemas em notificacoes e relacionamentos que dependem do email

### Alteracao

**`src/components/StudentFormModal.tsx`** (linha ~412-421):

1. No campo de email, adicionar `disabled={isEditing}` e a classe `bg-muted` quando em modo de edicao, seguindo o mesmo padrao ja usado no `ProfileSettings.tsx`.

2. Adicionar uma mensagem explicativa abaixo do campo quando em edicao, informando que o email nao pode ser alterado pois e a credencial de acesso do aluno.

### Detalhes tecnicos

- `isEditing` ja existe no componente (linha ~82: `const isEditing = !!student`)
- O padrao visual de campo desabilitado (`disabled` + `bg-muted`) ja e usado no `ProfileSettings.tsx` para o email do professor
- Nenhuma outra alteracao e necessaria, pois a validacao do formulario ja ignora o email quando desabilitado

