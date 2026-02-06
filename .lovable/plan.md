

# Plano: Feedback Visual de Requisitos de Senha no Cadastro

## Problema Identificado

Atualmente no formulário de cadastro (`/auth`), quando o usuário digita uma senha que não atende aos requisitos (como "12345678"), o campo fica com borda vermelha mas **não há nenhuma indicação** do que a senha precisa ter para ser válida.

### Requisitos Atuais da Senha (já implementados na validação)
- Mínimo de 8 caracteres
- Pelo menos uma letra minúscula (a-z)
- Pelo menos uma letra maiúscula (A-Z)
- Pelo menos um número (0-9)

## Solução Proposta

Implementar um **checklist visual interativo** abaixo do campo de senha que mostra em tempo real se cada requisito está sendo atendido, similar ao padrão usado por grandes plataformas (Google, Microsoft, etc.).

### Comportamento

1. O checklist aparece quando o usuário começa a digitar a senha
2. Cada requisito mostra um ícone indicando status:
   - Icone cinza/neutro: ainda não atendido
   - Icone verde com check: requisito atendido
3. Quando todos os requisitos são atendidos, todos ficam verdes
4. Se o usuário tentar submeter com erro, o campo fica vermelho E os requisitos não atendidos ficam destacados em vermelho

### Exemplo Visual

```text
Senha: [••••••••    ]

Sua senha deve conter:
  ✓ Mínimo de 8 caracteres
  ✗ Uma letra minúscula
  ✓ Uma letra maiúscula  
  ✓ Um número
```

## Alteracoes Necessarias

### 1. Traducoes (`src/i18n/locales/pt/auth.json` e `en/auth.json`)

Adicionar nova seção `passwordRequirements`:

**Portugues:**
```json
{
  "validation": {
    "invalidEmail": "Digite um email válido",
    "passwordRequirements": {
      "title": "Sua senha deve conter:",
      "minLength": "Mínimo de 8 caracteres",
      "lowercase": "Uma letra minúscula (a-z)",
      "uppercase": "Uma letra maiúscula (A-Z)",
      "number": "Um número (0-9)"
    }
  }
}
```

**Ingles:**
```json
{
  "validation": {
    "invalidEmail": "Enter a valid email",
    "passwordRequirements": {
      "title": "Your password must contain:",
      "minLength": "At least 8 characters",
      "lowercase": "A lowercase letter (a-z)",
      "uppercase": "An uppercase letter (A-Z)",
      "number": "A number (0-9)"
    }
  }
}
```

### 2. Componente de Checklist (`src/pages/Auth.tsx`)

Adicionar lógica de validação em tempo real e UI de checklist:

```tsx
// Novo estado para tracking de requisitos
const [passwordFocused, setPasswordFocused] = useState(false);

// Função para verificar cada requisito individualmente
const getPasswordRequirements = (password: string) => ({
  minLength: password.length >= 8,
  lowercase: /[a-z]/.test(password),
  uppercase: /[A-Z]/.test(password),
  number: /\d/.test(password),
});

// No JSX, abaixo do campo de senha:
{(passwordFocused || signupForm.password.length > 0) && (
  <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm space-y-1">
    <p className="text-muted-foreground font-medium text-xs">
      {t('validation.passwordRequirements.title')}
    </p>
    {Object.entries(getPasswordRequirements(signupForm.password)).map(([key, met]) => (
      <div key={key} className="flex items-center gap-2">
        {met ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className={met ? "text-green-600" : "text-muted-foreground"}>
          {t(`validation.passwordRequirements.${key}`)}
        </span>
      </div>
    ))}
  </div>
)}
```

### 3. Importar Icones Necessarios

Adicionar `Check` e `X` do lucide-react aos imports existentes.

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Auth.tsx` | Adicionar checklist visual de requisitos de senha |
| `src/i18n/locales/pt/auth.json` | Adicionar traducoes dos requisitos |
| `src/i18n/locales/en/auth.json` | Adicionar traducoes dos requisitos |

## Beneficios

1. **UX Clara**: Usuario sabe exatamente o que precisa fazer
2. **Feedback em Tempo Real**: Ve o progresso enquanto digita
3. **Consistencia**: Usa o mesmo padrao de validacao ja existente no codigo
4. **Internacionalizacao**: Totalmente traduzido PT/EN
5. **Acessibilidade**: Cores + icones para indicar status

