
## Corrigir preview de imagens no relatorio de aula

### Problema
Ao selecionar uma imagem para upload no relatorio de aula, aparece um quadrado cinza com o nome do arquivo em vez do preview da imagem. Isso ocorre porque `URL.createObjectURL()` gera URLs do tipo `blob:` que podem falhar em ambientes com iframe sandboxado ou em certas configuracoes de seguranca do navegador.

### Solucao
Substituir `URL.createObjectURL()` por `FileReader.readAsDataURL()`, que converte o arquivo para uma string base64 embutida diretamente no `src` da tag `img`. Data URLs sao universalmente suportadas e nao dependem do contexto de origem.

### Detalhes tecnicos

**Arquivo**: `src/components/ClassReportPhotoUpload.tsx`

1. **Alterar `handleFileSelect`** (linhas 61-90): Substituir a logica sincrona de `URL.createObjectURL` por uma leitura assincrona com `FileReader`:

```typescript
// Antes (linha 81):
const preview = URL.createObjectURL(file);

// Depois:
// Usar FileReader para gerar data URL base64
const reader = new FileReader();
reader.onload = (e) => {
  const preview = e.target?.result as string;
  const photoFile: PhotoFile = {
    id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    preview,
    isExisting: false,
    fileName: file.name
  };
  onPhotosChange(prev => [...prev, photoFile]);
};
reader.readAsDataURL(file);
```

2. **Ajustar a interface de `onPhotosChange`**: Como a leitura agora e assincrona e cada arquivo resolve independentemente, a funcao `onPhotosChange` precisara suportar atualizacao funcional. Alternativa mais simples: acumular todos os resultados com `Promise.all` e chamar `onPhotosChange` uma unica vez:

```typescript
const handleFileSelect = async (event) => {
  const files = event.target.files;
  if (!files) return;

  // ... validacoes existentes ...

  const readFile = (file: File): Promise<PhotoFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview: e.target?.result as string,
          isExisting: false,
          fileName: file.name
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const validFiles = []; // arquivos que passaram validacao
  // ... loop de validacao existente, mas push em validFiles ...

  const newPhotos = await Promise.all(validFiles.map(readFile));
  if (newPhotos.length > 0) {
    onPhotosChange([...photos, ...newPhotos]);
  }
};
```

3. **Remover `URL.revokeObjectURL`** da funcao `removePhoto` (linha 105): Data URLs nao precisam ser revogadas manualmente, pois sao strings em memoria gerenciadas pelo garbage collector.

4. **Adicionar `onError` no `img`** (linha 137): Como fallback visual caso alguma imagem falhe:

```tsx
<img
  src={photo.preview}
  alt={photo.fileName || 'Foto'}
  className="w-full h-full object-cover"
  onError={(e) => {
    e.currentTarget.style.display = 'none';
  }}
/>
```

### Impacto
- Apenas o arquivo `ClassReportPhotoUpload.tsx` sera alterado
- Nenhuma mudanca na interface ou no fluxo de upload para o Supabase Storage
- Fotos existentes (carregadas do banco) continuam usando URLs publicas normalmente
