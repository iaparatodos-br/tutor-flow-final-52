

# Diagnóstico: Email de convite não enviado para aluno existente

## Causa raiz

O fluxo `create-student` tem dois caminhos:
1. **Aluno novo** (linhas 157-236): cria conta + gera magic link + envia email via `send-student-invitation`
2. **Aluno existente** (linhas 135-156): apenas cria o relacionamento professor-aluno. **Nenhum email de convite é enviado.**

Os logs confirmam: `"is_new_student": false` e `"bd77bb76-c12a-48ea-ae89-3842a2472b77": false` (email não confirmado). O aluno já existia no sistema (cadastrado por outro professor ou tentativa anterior), então o código pulou toda a lógica de envio de email.

O professor recebeu o email porque a notificação ao professor (linha 478) é enviada em **ambos** os caminhos.

## Correção

### `supabase/functions/create-student/index.ts`

Após a verificação de relacionamento existente (linha 156), adicionar lógica para enviar email de convite quando o aluno existente ainda não confirmou seu email:

```text
if (existingUser) {
  studentId = existingUser.id;
  
  // ... verificação de relacionamento existente (já existe) ...

  // NEW: Se o email do aluno não foi confirmado, enviar convite
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(studentId);
  if (!authUser?.user?.email_confirmed_at) {
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: body.email,
      options: { redirectTo }
    });
    
    if (linkData?.properties?.action_link) {
      await supabaseAdmin.functions.invoke('send-student-invitation', {
        body: {
          email: body.email,
          name: body.name,
          teacher_name: body.professor_name || 'seu professor',
          invitation_link: linkData.properties.action_link,
        }
      });
    }
  }
}
```

## Arquivo impactado

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/create-student/index.ts` | Enviar email de convite para alunos existentes com email não confirmado |

