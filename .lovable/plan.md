
# Plano: Remover Seção "Responsável pela Cobrança" do Formulário de Alunos

## Contexto

Após a implementação completa do sistema de dependentes, a seção "Responsável pela Cobrança" (checkbox `isOwnResponsible` + campos de guardian) se tornou **obsoleta e confusa**.

### Fluxo Atual (Problemático)
```text
┌────────────────────────────────────────────────────┐
│ Tipo de Cadastro                                   │
├────────────────────────────────────────────────────┤
│  [Aluno com Email]     [Família/Menores]           │
└────────────────────────────────────────────────────┘
         │                       │
         ▼                       ▼
┌────────────────┐      ┌────────────────────────────┐
│ Dados Aluno    │      │ Dependentes inline         │
│ + SEÇÃO        │      │ + Dados Responsável        │
│ REDUNDANTE:    │      │ (responsável = conta)      │
│ "É o próprio   │      └────────────────────────────┘
│  responsável?" │
│ [x] Sim [ ] Não│
└────────────────┘
```

### Problema
1. Para "Aluno com Email" (adultos), não faz sentido perguntar quem é o responsável - **é sempre o próprio aluno**
2. Para menores, o fluxo correto é usar "Família", não "Aluno individual com responsável diferente"
3. A seção confunde professores e adiciona complexidade desnecessária

### Fluxo Proposto (Simplificado)
```text
┌────────────────────────────────────────────────────┐
│ Tipo de Cadastro                                   │
├────────────────────────────────────────────────────┤
│  [Aluno com Email]     [Família/Menores]           │
└────────────────────────────────────────────────────┘
         │                       │
         ▼                       ▼
┌────────────────┐      ┌────────────────────────────┐
│ Dados Aluno    │      │ Dependentes inline         │
│ (adulto)       │      │ + Dados Responsável        │
│                │      └────────────────────────────┘
│ [Nome]         │
│ [Email]        │               │
│ [Telefone]     │               │
│                │               │
│ [Dia Cobrança] │               ▼
│ [Negócio]      │      Responsável = titular da conta
└────────────────┘      Faturas vão para email do responsável
         │              Dependentes compartilham dados
         ▼
 Faturas enviadas para
 email do próprio aluno
```

## Alterações Necessárias

### 1. Frontend - StudentFormModal.tsx

**Remover:**
- Estado e lógica de `isOwnResponsible`
- Função `handleIsOwnResponsibleChange`
- Toda a seção UI "Responsável pela Cobrança" (linhas 528-693)
- Campos: checkbox, guardian_name, guardian_email, guardian_phone, guardian_cpf, endereço

**Simplificar:**
- Manter apenas campos do aluno + dia de cobrança + negócio
- Para tipo "individual", `guardian_*` = dados do próprio aluno (setado automaticamente no submit)

### 2. Frontend - Interface StudentFormData

**Remover do tipo:**
- `isOwnResponsible: boolean`
- `guardian_name: string`
- `guardian_email: string` 
- `guardian_phone: string`
- `guardian_cpf: string`
- `guardian_address_*: string`

### 3. Frontend - Validação

**Remover validações:**
- Validação condicional de campos guardian
- Estados de erro para campos guardian

### 4. Backend - Alunos.tsx (handleSubmitStudent)

**Simplificar lógica de submit:**
- Para tipo "individual": `guardian_*` = dados do aluno automaticamente
- Para tipo "family": `guardian_*` = dados do responsável (já funciona assim)

### 5. Backend - Edição de Alunos

**Simplificar:**
- Ao editar aluno individual, manter sincronização automática
- Não mostrar campos de guardian na edição

### 6. Traduções

**Remover chaves não utilizadas:**
- `form.sections.billingResponsible`
- `form.ownResponsible`
- `form.invoicesSentTo`
- `form.sections.guardianAddress`
- Campos e placeholders de guardian

### 7. Outros Arquivos Impactados

| Arquivo | Ação |
|---------|------|
| `StudentImportDialog.tsx` | Manter lógica de guardian para compatibilidade com imports existentes |
| `PerfilAluno.tsx` | Simplificar exibição - mostrar apenas se dados forem diferentes |
| `BillingSettings.tsx` | Avaliar se ainda é necessário (aluno pode editar suas configurações) |
| Edge functions | Sem alterações - continuam buscando `student_guardian_*` do relationship |

## Comportamento Final

### Novo Aluno Individual
1. Professor seleciona "Aluno com Email"
2. Preenche: Nome, Email, Telefone, Dia Cobrança, Negócio
3. Sistema salva com `guardian_* = dados do aluno`
4. Faturas/notificações vão para email do aluno

### Nova Família
1. Professor seleciona "Família/Menores"
2. Adiciona dependentes inline
3. Preenche dados do responsável
4. Sistema salva responsável como `student` com `guardian_* = dados do responsável`
5. Dependentes vinculados ao responsável
6. Faturas/notificações vão para email do responsável

### Edição de Aluno Existente
1. Para individuais: campos de guardian ficam ocultos (sempre sincronizados)
2. Para responsáveis: mostrar apenas dados principais + lista de dependentes

## Arquivos a Modificar

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `src/components/StudentFormModal.tsx` | **Grande** - Remover seção inteira de "Responsável" |
| `src/pages/Alunos.tsx` | Simplificar lógica de submit para auto-preencher guardian |
| `src/i18n/locales/pt/students.json` | Remover chaves não utilizadas |
| `src/i18n/locales/en/students.json` | Remover chaves não utilizadas |
| `src/pages/PerfilAluno.tsx` | Opcional - Simplificar exibição de responsável |

## Notas de Migração

- Dados existentes de alunos com `isOwnResponsible = false` continuam funcionando
- Backend continua usando `student_guardian_*` normalmente
- Nenhuma migração de banco necessária
- Apenas simplificação de UX no frontend

## Benefícios

1. **UX mais simples** - Menos campos para preencher
2. **Menos confusão** - Fluxo claro: adulto = individual, menor = família
3. **Código mais limpo** - Remoção de lógica condicional complexa
4. **Manutenção facilitada** - Menos estados para gerenciar
