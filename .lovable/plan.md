

# Plano: Botão de Download de PDF no Recibo

## Contexto

A página de recibo (`/recibo/:invoiceId`) já possui um botão "Imprimir" que utiliza `window.print()`. O usuário precisa de uma forma de baixar o recibo como arquivo PDF.

## Solução Proposta

Adicionar um botão "Baixar PDF" que utiliza a funcionalidade nativa do browser para salvar como PDF, integrado com o utilitário `openExternalUrl` para compatibilidade com o app nativo (Capacitor).

## Abordagem Técnica

### Opção Escolhida: Print-to-PDF via Browser

A forma mais simples e eficiente é utilizar `window.print()` que permite ao usuário salvar como PDF através do diálogo de impressão do sistema/browser. Esta é a abordagem padrão usada em sistemas de faturamento.

**Vantagens:**
- Sem dependências adicionais de bibliotecas de PDF
- Layout já otimizado para impressão (CSS print já existe em `recibo.css`)
- Funciona em todos os browsers e no app nativo

## Alterações

### 1. Modificar `src/pages/Recibo.tsx`

**Adicionar ícone `Download`** aos imports do Lucide.

**Atualizar a seção de botões** para incluir o novo botão de download:

```tsx
<div className="flex gap-4 mb-8 print:hidden">
  <Button onClick={() => navigate(-1)} variant="ghost">
    <ArrowLeft className="mr-2 h-4 w-4" />
    {t('receipt.back', 'Voltar')}
  </Button>
  <Button onClick={handlePrint} variant="outline">
    <Printer className="mr-2 h-4 w-4" />
    {t('receipt.print', 'Imprimir')}
  </Button>
  <Button onClick={handleDownloadPdf} variant="default">
    <Download className="mr-2 h-4 w-4" />
    {t('receipt.downloadPdf', 'Baixar PDF')}
  </Button>
</div>
```

**Adicionar função `handleDownloadPdf`:**

```tsx
const handleDownloadPdf = () => {
  // Exibir instrução para o usuário antes de abrir o diálogo de impressão
  toast.info(t('receipt.pdfInstructions', 'No diálogo de impressão, selecione "Salvar como PDF" como destino.'));
  
  // Pequeno delay para o toast aparecer antes do diálogo de impressão
  setTimeout(() => {
    window.print();
  }, 500);
};
```

### 2. Adicionar Traduções

**`src/i18n/locales/pt/financial.json`:**
```json
{
  "receipt": {
    "back": "Voltar",
    "print": "Imprimir",
    "downloadPdf": "Baixar PDF",
    "pdfInstructions": "No diálogo de impressão, selecione \"Salvar como PDF\" como destino."
  }
}
```

**`src/i18n/locales/en/financial.json`:**
```json
{
  "receipt": {
    "back": "Back",
    "print": "Print",
    "downloadPdf": "Download PDF",
    "pdfInstructions": "In the print dialog, select \"Save as PDF\" as the destination."
  }
}
```

### 3. Melhorar navegação de volta

Atualmente o botão "Voltar" navega sempre para `/faturas`, mas pode ser melhor usar `navigate(-1)` para voltar para a página anterior (mais flexível para diferentes fluxos de acesso ao recibo).

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Recibo.tsx` | Adicionar botão "Baixar PDF", importar `Download` do Lucide, adicionar função `handleDownloadPdf` |
| `src/i18n/locales/pt/financial.json` | Adicionar traduções para `receipt.downloadPdf` e `receipt.pdfInstructions` |
| `src/i18n/locales/en/financial.json` | Adicionar traduções para `receipt.downloadPdf` e `receipt.pdfInstructions` |

## Resultado Visual

```text
┌─────────────────────────────────────────────────────────────────┐
│  [← Voltar]  [🖨️ Imprimir]  [📥 Baixar PDF]                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      📄 Recibo de Pagamento                     │
│                        #50CA9F3F                                │
│                                                                 │
│                    ┌──────────────┐                             │
│                    │    PAGO      │                             │
│                    └──────────────┘                             │
│                                                                 │
│  ... resto do recibo ...                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Observações

- O CSS de impressão já existe em `recibo.css` e oculta os botões durante a impressão/geração de PDF (`print:hidden`)
- Esta abordagem é a mais comum em sistemas web de faturamento e não requer bibliotecas pesadas de geração de PDF
- Funciona tanto na web quanto no app nativo via Capacitor

