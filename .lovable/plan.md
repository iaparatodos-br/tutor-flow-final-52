

# Corrigir Drag and Drop no Upload de Fotos do Relatorio

## Problema
A area de upload de fotos (`ClassReportPhotoUpload.tsx`) possui visual de "dropzone" (borda tracejada, icone, texto sugestivo), mas nao implementa nenhum evento de drag and drop. Apenas o clique funciona.

## Solucao
Adicionar os handlers de drag and drop (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`) na div da dropzone, reutilizando a logica de validacao ja existente em `handleFileSelect`.

## Alteracoes

### `src/components/ClassReportPhotoUpload.tsx`

1. **Adicionar estado `isDragging`** para feedback visual quando o usuario arrasta arquivos sobre a area.

2. **Extrair logica de processamento de arquivos** do `handleFileSelect` para uma funcao reutilizavel `processFiles(fileList: FileList)`, que sera chamada tanto pelo input quanto pelo drop.

3. **Adicionar handlers de drag and drop na div da dropzone:**
   - `onDragOver` / `onDragEnter`: prevenir comportamento padrao e ativar `isDragging`
   - `onDragLeave`: desativar `isDragging`
   - `onDrop`: prevenir comportamento padrao, desativar `isDragging`, chamar `processFiles` com os arquivos

4. **Feedback visual**: quando `isDragging` for true, aplicar classes adicionais na borda (ex: `border-primary bg-primary/5`) para indicar que a area esta pronta para receber os arquivos.

### Detalhes Tecnicos

```text
// Novo estado
const [isDragging, setIsDragging] = useState(false);

// Funcao extraida (reutilizada por input e drop)
const processFiles = async (fileList: FileList) => { ... }

// Handlers na div
onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); processFiles(e.dataTransfer.files); }}

// Classes condicionais
className={cn(
  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
  isDragging
    ? "border-primary bg-primary/5"
    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
)}
```

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/ClassReportPhotoUpload.tsx` | Adicionar estado isDragging, extrair processFiles, adicionar handlers de drag/drop e feedback visual |
