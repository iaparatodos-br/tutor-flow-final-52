

## Remover opcoes de PIX e Cartao de Credito da interface do aluno

### Problema

O sistema foi simplificado para oferecer apenas boleto como metodo de pagamento, mas a interface do aluno ainda mostra opcoes de PIX e Cartao de Credito, alem de ter um botao de "Trocar Metodo de Pagamento" que nao faz mais sentido.

### Alteracoes

**1. `src/components/PaymentOptionsCard.tsx`**

- Remover toda a secao de PIX (linhas 313-352) com botao "Gerar PIX" e exibicao de QR code
- Remover toda a secao de Cartao de Credito (linhas 354-377) com botao "Pagar"
- Remover o titulo "Opcoes de Pagamento" com icone de CreditCard, ja que so tera boleto
- Remover os branches de `card` e `pix` dentro da funcao `createPaymentIntent` (linhas 131-145)
- Remover imports nao utilizados: `QrCode`, `CreditCard`, `Input`
- Remover estados desnecessarios: `payerTaxId`, `payerAddress`, `activePaymentMethod`
- Manter apenas a secao de Boleto Bancario (exibicao do boleto existente ou mensagem de indisponivel)
- Manter o botao "Verificar Status do Pagamento"

**2. `src/pages/Faturas.tsx`**

- Remover o botao de "Trocar Metodo de Pagamento" (icone RefreshCw, linhas 371-379)
- Remover o Dialog de "Change Payment Method" (linhas 420-456)
- Remover a funcao `handleChangePaymentMethod` (linhas 157-192)
- Remover a funcao `openChangeMethodDialog` (linhas 152-155)
- Remover a funcao `canChangePaymentMethod` (linhas 201-204)
- Remover a funcao `handleChoosePaymentMethod` (linhas 135-146)
- Remover estados: `changeMethodDialogOpen`, `selectedInvoice`, `changingMethod`
- Remover imports nao utilizados: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `RefreshCw`, `Loader2`
- Simplificar a coluna de acoes: faturas pendentes com boleto mostram apenas "Pagar" (abre boleto_url), sem boleto mostram "Aguardando boleto" ou similar

### Resultado esperado

- Aluno ve apenas a opcao de boleto na interface
- Se o boleto esta disponivel, ve o botao para abrir/baixar
- Se o boleto nao esta disponivel (professor desativou geracao automatica), ve uma mensagem orientando a entrar em contato com o professor
- Sem botoes de PIX, Cartao ou troca de metodo de pagamento
