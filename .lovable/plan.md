

## Limpar resquicios de guardian no PerfilAluno.tsx

### Contexto
O card "Responsavel" foi removido da pagina, mas o codigo ainda busca e armazena dados de guardian que nao sao mais exibidos. E codigo morto que pode ser limpo.

### Alteracao

**`src/pages/PerfilAluno.tsx`**:

1. **Interface `StudentProfile`** (linhas 52-55): Remover os campos `guardian_name`, `guardian_email`, `guardian_phone` e `billing_day` da interface, pois nao sao mais utilizados na pagina.

2. **Query de relacionamento** (linha 193): Simplificar o select para buscar apenas `student_id` (necessario para validar acesso), removendo `student_guardian_name`, `student_guardian_email`, `student_guardian_phone` e `billing_day`.

3. **Objeto combinado** (linhas 211-218): Remover o mapeamento de `guardian_name`, `guardian_email`, `guardian_phone` e `billing_day` do `combinedStudent`.

### O que NAO sera removido

Os campos `guardian_*` e `billing_day` em outros arquivos (BillingSettings, StudentFormModal, edge functions de boleto/notificacoes) continuam necessarios para:
- Gerar boletos com dados do responsavel pela cobranca
- Enviar notificacoes de aula e fatura por email
- Editar dados do aluno no formulario

Esses campos sao funcionais e nao sao resquicios do card removido.
