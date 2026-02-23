

## Adicionar flag de geracao automatica de boleto

### O que sera feito

Adicionar uma opcao nas configuracoes de cobranca que permite o professor desativar a geracao automatica de boletos pelo Stripe. As faturas continuarao sendo criadas normalmente, mas o sistema nao gerara boleto no Stripe quando a flag estiver desativada.

### Alteracoes

**1. Banco de dados (migracao)**

Adicionar coluna `auto_generate_boleto` na tabela `business_profiles`:
- Tipo: `boolean`
- Default: `true` (comportamento atual mantido)
- Not null

**2. Frontend - `src/components/Settings/BillingSettings.tsx`**

- Adicionar estado local `autoGenerateBoleto` (booleano)
- Carregar o valor da coluna `auto_generate_boleto` junto com `charge_timing` na query existente do `business_profiles`
- Renderizar um novo card (ou secao dentro do card existente de cobranca) com um `Switch` do shadcn/ui
- Titulo: "Geracao automatica de boletos"
- Descricao: "Quando desativado, as faturas serao criadas normalmente mas sem gerar boleto no Stripe. Util para professores que geram boletos diretamente no banco."
- Salvar o valor junto com os demais campos no `onSubmit`
- Exibir apenas quando `businessProfileId` existir (mesmo padrao do card de charge timing)

**3. Backend - `supabase/functions/automated-billing/index.ts`**

Nos 3 pontos onde o boleto e gerado (aulas avulsas ~linha 543, mensalidades ~linha 854, e faturamento misto ~linha 970):
- Antes de invocar `create-payment-intent-connect`, consultar `business_profiles.auto_generate_boleto` para o professor
- Se `auto_generate_boleto === false`, pular a geracao do boleto com um log descritivo, da mesma forma que ja e feito para o `skipBoletoGeneration` por valor minimo
- A query do business_profile ja existe na funcao (~linha 147); basta incluir `auto_generate_boleto` no select e propagar o valor

**4. Internacionalizacao**

Adicionar chaves nos arquivos de traducao `src/i18n/locales/pt/billing.json` e `src/i18n/locales/en/billing.json`:
- `autoGenerateBoleto.title`
- `autoGenerateBoleto.description`
- `autoGenerateBoleto.enabled` / `autoGenerateBoleto.disabled`

### Fluxo

```text
Professor desativa "Geracao automatica de boletos"
           |
           v
  business_profiles.auto_generate_boleto = false
           |
           v
  automated-billing roda no cron
           |
           v
  Fatura criada normalmente (status 'pendente')
           |
           v
  Verifica auto_generate_boleto => false
           |
           v
  Pula chamada a create-payment-intent-connect
  (log: "Boleto generation disabled by teacher")
           |
           v
  Professor gera boleto no banco e marca fatura como paga manualmente
```

### Detalhes tecnicos

- A coluna tera default `true` para nao alterar o comportamento de professores existentes
- O componente `Switch` segue o padrao ja usado em `CancellationPolicySettings` para o toggle de anistia
- A verificacao no backend sera feita apos o `skipBoletoGeneration` por valor minimo, adicionando uma condicao `OR` ou verificacao sequencial
