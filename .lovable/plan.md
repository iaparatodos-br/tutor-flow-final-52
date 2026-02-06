
# Plano: Modal Fixo de Verificacao de Email Apos Cadastro

## Problema Atual

Apos o cadastro bem-sucedido de um professor:
1. A edge function `create-teacher` cria o usuario e envia email via AWS SES
2. O frontend exibe apenas um **toast** temporario com a mensagem "Verifique seu e-mail"
3. O toast desaparece automaticamente apos alguns segundos
4. **Nao ha garantia de que o professor viu e leu a mensagem**

Codigo atual (Auth.tsx, linha 185-188):
```tsx
toast({
  title: t('messages.emailVerificationRequired'),
  description: t('messages.emailVerificationDescription'),
});
```

## Solucao Proposta

Criar um modal fixo (barrier dismissible) que aparece apos o cadastro bem-sucedido, obrigando o professor a confirmar manualmente que leu a mensagem.

### Comportamento do Modal

- **Nao fecha ao clicar fora** - `onInteractOutside={(e) => e.preventDefault()}`
- **Nao fecha com tecla ESC** - `onEscapeKeyDown={(e) => e.preventDefault()}`
- **Sem botao X automatico** - Esconder via CSS `[&>button]:hidden`
- **Fechamento apenas por acao manual** - Botao "Entendi" que fecha o modal

### Fluxo de Usuario

```text
Professor preenche formulario de cadastro
              |
              v
Clica em "Criar Conta"
              |
              v
Edge function cria usuario + envia email
              |
              v
  +---------------------------+
  |   Modal Fixo Aparece      |
  |                           |
  |  [Icone Email]            |
  |                           |
  |  Verifique seu e-mail     |
  |                           |
  |  Enviamos um link de      |
  |  confirmacao para:        |
  |  exemplo@email.com        |
  |                           |
  |  Verifique sua caixa de   |
  |  entrada e spam.          |
  |                           |
  |  [   Entendi   ]          |
  +---------------------------+
              |
              v
Professor clica "Entendi"
              |
              v
Modal fecha, form limpa, aba login ativa
```

## Alteracoes Necessarias

### 1. Arquivo: `src/pages/Auth.tsx`

**Adicionar estado para controlar o modal:**
```tsx
const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
const [registeredEmail, setRegisteredEmail] = useState('');
```

**Modificar handleSignup para mostrar modal em vez de toast:**
```tsx
// Ao inves de toast, mostrar modal
setRegisteredEmail(signupForm.email);
setShowEmailVerificationModal(true);
```

**Adicionar handler de fechamento do modal:**
```tsx
const handleEmailVerificationAcknowledged = () => {
  setShowEmailVerificationModal(false);
  setRegisteredEmail('');
  // Limpar formulario e voltar para aba de login
  setSignupForm({ name: '', email: '', password: '', termsAccepted: false });
  setCurrentTab('login');
};
```

**Adicionar componente do modal no JSX:**
```tsx
<Dialog open={showEmailVerificationModal} modal>
  <DialogContent 
    className="sm:max-w-md [&>button]:hidden"
    onInteractOutside={(e) => e.preventDefault()}
    onEscapeKeyDown={(e) => e.preventDefault()}
  >
    <DialogHeader className="text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Mail className="w-8 h-8 text-primary" />
      </div>
      <DialogTitle className="text-center">
        {t('messages.emailVerificationRequired')}
      </DialogTitle>
      <DialogDescription className="text-center">
        {t('emailVerificationModal.description', { email: registeredEmail })}
      </DialogDescription>
    </DialogHeader>
    
    <div className="text-center text-sm text-muted-foreground">
      {t('emailVerificationModal.checkSpam')}
    </div>
    
    <DialogFooter className="sm:justify-center">
      <Button onClick={handleEmailVerificationAcknowledged}>
        {t('emailVerificationModal.acknowledge')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2. Arquivo: `src/i18n/locales/pt/auth.json`

Adicionar novas chaves de traducao:
```json
{
  "emailVerificationModal": {
    "description": "Enviamos um link de confirmação para {{email}}. Por favor, verifique sua caixa de entrada para ativar sua conta.",
    "checkSpam": "Não encontrou? Verifique também a pasta de spam.",
    "acknowledge": "Entendi"
  }
}
```

### 3. Arquivo: `src/i18n/locales/en/auth.json`

Adicionar novas chaves de traducao:
```json
{
  "emailVerificationModal": {
    "description": "We've sent a confirmation link to {{email}}. Please check your inbox to activate your account.",
    "checkSpam": "Can't find it? Check your spam folder too.",
    "acknowledge": "Got it"
  }
}
```

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Auth.tsx` | Adicionar estados, handler, e modal barrier-dismissible |
| `src/i18n/locales/pt/auth.json` | Adicionar traducoes para `emailVerificationModal` |
| `src/i18n/locales/en/auth.json` | Adicionar traducoes para `emailVerificationModal` |

## Detalhes Tecnicos

### Props do DialogContent para Barrier Dismissible

O componente `DialogContent` do Radix UI (via shadcn/ui) aceita os seguintes handlers para impedir fechamento involuntario:

- `onInteractOutside`: Evento disparado ao clicar fora do dialog
- `onEscapeKeyDown`: Evento disparado ao pressionar ESC
- `[&>button]:hidden`: Classe CSS para esconder o botao X padrao

### Importacoes Necessarias

O componente `Dialog` e seus subcomponentes ja estao sendo importados no Auth.tsx (sera necessario adicionar se nao estiverem):
```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

## Validacao

Apos implementacao:
1. Acessar `/auth` e ir para aba de cadastro
2. Preencher formulario com dados validos
3. Clicar em "Criar Conta"
4. Modal deve aparecer com email do usuario
5. Tentar clicar fora do modal - nao deve fechar
6. Pressionar ESC - nao deve fechar
7. Clicar em "Entendi" - modal fecha, formulario limpa, volta para aba login
