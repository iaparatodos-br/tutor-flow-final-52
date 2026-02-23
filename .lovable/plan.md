

## Remover Card "Responsavel" do Perfil do Aluno

### Contexto
Com a implementacao do sistema de dependentes, a logica de "responsavel pela cobranca" foi substituida pela hierarquia responsavel/dependente. O card "Responsavel" na pagina `PerfilAluno.tsx` exibe informacoes obsoletas (guardian_name, guardian_email, guardian_phone, billing_day) que nao fazem mais sentido no modelo atual.

### Alteracao

**`src/pages/PerfilAluno.tsx`** (linhas 645-702):
- Remover o bloco completo do card "Responsible Info", que inclui:
  - Exibicao de guardian_name/guardian_email/guardian_phone
  - Badge "O proprio aluno e responsavel"
  - Dia de cobranca
  - Estado vazio "Dados do responsavel nao configurados"

Nenhum outro arquivo e afetado, pois esse card e exclusivo desta pagina.

