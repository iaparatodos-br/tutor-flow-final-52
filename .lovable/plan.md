

# Remover Card de Metodos de Pagamento das Configuracoes do Professor

## Resumo

Remover apenas a secao visual "Metodos de Pagamento" (card com checkboxes de Cartao, Boleto e PIX) do componente de configuracoes do professor. Todo o restante do sistema (edge functions, traducoes, banco de dados) permanece intacto, mantendo a estrutura pronta para expansao futura.

## O Que Muda

- Remover o card "Metodos de Pagamento" da tela de configuracoes do professor
- Remover os estados e funcoes que so serviam para essa UI: `savingMethods`, `businessProfileId`, `enabledMethods`, `togglePaymentMethod`, `savePaymentMethods`
- Remover imports nao utilizados apos a limpeza: `Checkbox`, `Alert`, `AlertDescription`, `AlertTriangle`, `CreditCard`, `Receipt`, `QrCode`
- Remover a constante `PAYMENT_METHODS` e o tipo `PaymentMethodId`
- Remover a leitura de `business_profiles` no `loadSettings` (ja que so era usada para popular o card removido)

## O Que NAO Muda

- Nenhuma edge function e alterada
- Nenhuma tabela ou coluna do banco e alterada
- As traducoes (`paymentMethods.*` em billing.json) permanecem para uso futuro
- O `PaymentOptionsCard` do aluno continua funcionando normalmente
- O campo `enabled_payment_methods` em `business_profiles` continua existindo e funcional

## Arquivo Modificado

| Arquivo | Acao |
|---------|------|
| `src/components/Settings/BillingSettings.tsx` | Remover card de Payment Methods, estados e logica associada |

## Resultado

O professor vera apenas o card de "Configuracoes de Cobranca" (prazo de vencimento e dia de cobranca padrao). A infraestrutura de metodos de pagamento continua 100% funcional no backend para reativacao futura.

