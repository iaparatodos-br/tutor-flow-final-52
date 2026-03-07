

# Plano: Cadastrar 15 alunos fictícios para testar cobrança de overage

## Contexto

- Professor: `tonifec836@medevsa.com` (ID: `17fe9974-df69-4d1f-9abc-93c588600deb`)
- Plano: **basic** (limite de 15 alunos)
- Alunos atuais: **0**
- Objetivo: preencher o limite com 15 alunos fictícios para que o 16º dispare a cobrança de R$5,00

## Abordagem

Adicionar uma nova action `seed_bulk_students` na edge function `dev-seed-test-data` que já existe para testes. A action vai:

1. Criar 15 usuários fictícios via `supabaseAdmin.auth.admin.createUser()` com `email_confirm: true`
2. Criar os profiles (via trigger existente) e os `teacher_student_relationships`
3. Pular toda a lógica de billing/overage (pois é seed de teste)

### Nomes e emails dos 15 alunos fictícios

```text
01. Ana Silva       - ana.silva.test01@ficticio.com
02. Bruno Costa     - bruno.costa.test02@ficticio.com
03. Carla Oliveira  - carla.oliveira.test03@ficticio.com
04. Diego Santos    - diego.santos.test04@ficticio.com
05. Elena Ferreira  - elena.ferreira.test05@ficticio.com
06. Felipe Almeida  - felipe.almeida.test06@ficticio.com
07. Gabriela Lima   - gabriela.lima.test07@ficticio.com
08. Hugo Pereira    - hugo.pereira.test08@ficticio.com
09. Isabela Rocha   - isabela.rocha.test09@ficticio.com
10. João Martins    - joao.martins.test10@ficticio.com
11. Karen Souza     - karen.souza.test11@ficticio.com
12. Lucas Ribeiro   - lucas.ribeiro.test12@ficticio.com
13. Marina Gomes    - marina.gomes.test13@ficticio.com
14. Nicolas Araújo  - nicolas.araujo.test14@ficticio.com
15. Olivia Barbosa  - olivia.barbosa.test15@ficticio.com
```

## Alteração

### 1. Edge Function: `dev-seed-test-data/index.ts`

Adicionar novo case `seed_bulk_students` no switch:

```typescript
case 'seed_bulk_students': {
  const students = [
    { name: 'Ana Silva', email: 'ana.silva.test01@ficticio.com' },
    // ... 14 mais
  ];
  
  let created = 0;
  for (const s of students) {
    // Criar auth user (skip se já existe)
    const { data: userData } = await supabase.auth.admin.createUser({
      email: s.email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { name: s.name, role: 'aluno' }
    });
    if (!userData?.user) continue;
    
    // Aguardar profile trigger
    await new Promise(r => setTimeout(r, 200));
    
    // Criar relationship
    await supabase.from('teacher_student_relationships').insert({
      teacher_id: user.id,
      student_id: userData.user.id,
      student_name: s.name,
      billing_day: 15
    });
    created++;
  }
  
  result = { success: true, message: `${created} alunos criados` };
  break;
}
```

### 2. Execução

Após deploy, você chama a function logado no app (ou eu chamo via curl com sua sessão ativa) com:
```json
{ "action": "seed_bulk_students" }
```

## Impacto

- **1 edge function editada**: `dev-seed-test-data`
- **0 arquivos frontend**
- **0 migrações SQL**
- Função protegida por auth + check de `role === 'professor'` + check `ENVIRONMENT !== 'production'`

