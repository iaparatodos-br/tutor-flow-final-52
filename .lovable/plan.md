
# Plano de Implementação Final: TutorFlow Mobile para Alunos (Android/Capacitor)

## Visão Geral

Transformar a aplicação web TutorFlow em um aplicativo Android nativo **exclusivo para alunos**, usando Capacitor. Sem push notifications nesta fase.

---

## Arquivos a Criar/Modificar

| # | Arquivo | Ação | Descrição |
|---|---------|------|-----------|
| 1 | `package.json` | MODIFICAR | Adicionar 7 dependências + 4 scripts |
| 2 | `capacitor.config.ts` | CRIAR | Configuração do Capacitor |
| 3 | `src/hooks/useCapacitor.ts` | CRIAR | Hook de detecção de plataforma |
| 4 | `src/hooks/useStatusBar.ts` | CRIAR | Hook de sincronização da status bar |
| 5 | `src/utils/browser.ts` | CRIAR | Utilitário para links externos |
| 6 | `src/App.tsx` | MODIFICAR | Integrar useStatusBar |
| 7 | `src/pages/Faturas.tsx` | MODIFICAR | Usar openExternalUrl para pagamentos |
| 8 | `src/pages/MeusMateriais.tsx` | MODIFICAR | Download nativo de materiais |

---

## FASE 1: Configuração do Projeto

### Passo 1.1 - Atualizar package.json

**Adicionar dependências** (após linha 72, antes do fechamento de `dependencies`):
```json
"@capacitor/core": "^7.2.0",
"@capacitor/android": "^7.2.0",
"@capacitor/app": "^7.0.1",
"@capacitor/browser": "^7.0.1",
"@capacitor/splash-screen": "^7.0.1",
"@capacitor/status-bar": "^7.0.1"
```

**Adicionar devDependency** (após linha 75, após `@eslint/js`):
```json
"@capacitor/cli": "^7.2.0"
```

**Adicionar scripts** (após linha 11, após `preview`):
```json
"cap:sync": "cap sync",
"cap:open:android": "cap open android",
"cap:run:android": "cap run android",
"build:android": "npm run build && cap sync android"
```

---

### Passo 1.2 - Criar capacitor.config.ts (NOVO)

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.53db526ffe7b4e76978370ca70e54e3a',
  appName: 'TutorFlow Aluno',
  webDir: 'dist',
  
  // Hot-reload durante desenvolvimento
  // IMPORTANTE: Remover/comentar este bloco para build de produção!
  server: {
    url: 'https://53db526f-fe7b-4e76-9783-70ca70e54e3a.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: true,
      spinnerColor: '#4F46E5'
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#4F46E5'
    }
  },
  
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
```

---

## FASE 2: Criar Hooks de Plataforma

### Passo 2.1 - Criar src/hooks/useCapacitor.ts (NOVO)

```typescript
import { useEffect, useState } from 'react';

interface CapacitorState {
  isNativeApp: boolean;
  platform: 'web' | 'android' | 'ios';
  isReady: boolean;
}

/**
 * Hook para detectar se o app está rodando em ambiente nativo (Capacitor)
 */
export function useCapacitor(): CapacitorState {
  const [state, setState] = useState<CapacitorState>({
    isNativeApp: false,
    platform: 'web',
    isReady: false
  });

  useEffect(() => {
    const checkCapacitor = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        const isNative = Capacitor.isNativePlatform();
        const platform = Capacitor.getPlatform() as 'web' | 'android' | 'ios';
        
        setState({
          isNativeApp: isNative,
          platform,
          isReady: true
        });

        console.log('[Capacitor] Platform detected:', platform, 'Native:', isNative);
      } catch (error) {
        console.log('[Capacitor] Not available, running in web mode');
        setState({
          isNativeApp: false,
          platform: 'web',
          isReady: true
        });
      }
    };

    checkCapacitor();
  }, []);

  return state;
}
```

---

### Passo 2.2 - Criar src/hooks/useStatusBar.ts (NOVO)

```typescript
import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useCapacitor } from './useCapacitor';

/**
 * Hook para sincronizar a StatusBar do Android com o tema do app
 */
export function useStatusBar() {
  const { theme, resolvedTheme } = useTheme();
  const { isNativeApp, isReady } = useCapacitor();

  useEffect(() => {
    if (!isReady || !isNativeApp) return;

    const updateStatusBar = async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        
        const currentTheme = resolvedTheme || theme;
        
        if (currentTheme === 'dark') {
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#1F2937' });
        } else {
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: '#4F46E5' });
        }

        console.log('[StatusBar] Updated for theme:', currentTheme);
      } catch (error) {
        console.error('[StatusBar] Error updating:', error);
      }
    };

    updateStatusBar();
  }, [theme, resolvedTheme, isReady, isNativeApp]);
}
```

---

## FASE 3: Criar Utilitários

### Passo 3.1 - Criar src/utils/browser.ts (NOVO)

```typescript
/**
 * Utilitários para navegação em ambiente nativo (Capacitor)
 */

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) {
    console.warn('[Browser] Attempted to open empty URL');
    return;
  }

  try {
    const { Capacitor } = await import('@capacitor/core');
    
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      
      await Browser.open({ 
        url,
        presentationStyle: 'popover',
        toolbarColor: '#4F46E5'
      });

      console.log('[Browser] Opened URL in native browser:', url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    console.warn('[Browser] Fallback to window.open:', error);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function closeExternalBrowser(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    }
  } catch (error) {
    // Noop
  }
}

export async function onBrowserClosed(callback: () => void): Promise<(() => void) | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      
      const listener = await Browser.addListener('browserFinished', () => {
        console.log('[Browser] Browser closed by user');
        callback();
      });

      return () => {
        listener.remove();
      };
    }
  } catch (error) {
    console.warn('[Browser] Could not add close listener:', error);
  }

  return null;
}
```

---

## FASE 4: Integrar no App Principal

### Passo 4.1 - Modificar src/App.tsx

**Alteração 1 - Adicionar import (linha 16, após PendingBoletoGuard):**
```typescript
import { useStatusBar } from '@/hooks/useStatusBar';
```

**Alteração 2 - Adicionar hook (linha 49, logo após a desestruturação do useAuth):**
```typescript
const AppWithProviders = () => {
  const { loading, profile, isProfessor, isAluno, isAuthenticated, needsPasswordChange, needsAddressInfo } = useAuth();
  
  // Sincronizar status bar com tema (apenas no app nativo)
  useStatusBar();
  
  // Aguardar o carregamento completo...
```

---

## FASE 5: Modificar Páginas do Aluno

### Passo 5.1 - Modificar src/pages/Faturas.tsx

**Alteração 1 - Adicionar import (linha 22, após useAuth):**
```typescript
import { openExternalUrl, onBrowserClosed } from '@/utils/browser';
```

**Alteração 2 - Substituir handlePayNow (linhas 113-120):**
```typescript
  const handlePayNow = async (invoice: Invoice) => {
    // Configurar callback para quando browser fechar (atualizar dados)
    await onBrowserClosed(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
    });

    // Se tem método de pagamento definido, abrir URL correspondente
    if (invoice.payment_method === 'boleto' && invoice.boleto_url) {
      await openExternalUrl(invoice.boleto_url);
    } else if (invoice.stripe_hosted_invoice_url) {
      await openExternalUrl(invoice.stripe_hosted_invoice_url);
    }
  };
```

**Alteração 3 - Substituir handleChoosePaymentMethod (linhas 122-127):**
```typescript
  const handleChoosePaymentMethod = async (invoice: Invoice) => {
    // Configurar callback para quando browser fechar
    await onBrowserClosed(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['studentInvoices'] });
    });

    // Abrir modal ou página de escolha de método
    if (invoice.stripe_hosted_invoice_url) {
      await openExternalUrl(invoice.stripe_hosted_invoice_url);
    }
  };
```

---

### Passo 5.2 - Modificar src/pages/MeusMateriais.tsx

**Alteração 1 - Adicionar import (linha 13, após Baby):**
```typescript
import { useCapacitor } from '@/hooks/useCapacitor';
```

**Alteração 2 - Adicionar hook (linha 56, após activeTab):**
```typescript
  const [activeTab, setActiveTab] = useState<string>("self");
  const { isNativeApp } = useCapacitor();
```

**Alteração 3 - Substituir handleDownload (linhas 159-178):**
```typescript
  const handleDownload = async (material: Material) => {
    try {
      // No app nativo, usar URL assinada para download
      if (isNativeApp) {
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from('teaching-materials')
          .createSignedUrl(material.file_path, 300);

        if (signedError) throw signedError;
        
        if (signedUrlData?.signedUrl) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ 
            url: signedUrlData.signedUrl,
            presentationStyle: 'popover'
          });
          toast.success("Abrindo download...");
          return;
        }
      }

      // Fallback: download tradicional (web)
      const { data, error } = await supabase.storage
        .from('teaching-materials')
        .download(material.file_path);
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = material.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Download concluído");
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error("Erro ao fazer download");
    }
  };
```

---

## Resumo de Alterações

### Arquivos NOVOS (4):
| Arquivo | Função |
|---------|--------|
| `capacitor.config.ts` | Configuração do app Android |
| `src/hooks/useCapacitor.ts` | Detecção de plataforma nativa |
| `src/hooks/useStatusBar.ts` | Sincronização visual da status bar |
| `src/utils/browser.ts` | Navegação externa segura |

### Arquivos MODIFICADOS (4):
| Arquivo | Alterações |
|---------|------------|
| `package.json` | +7 deps, +4 scripts |
| `src/App.tsx` | +1 import, +1 hook call |
| `src/pages/Faturas.tsx` | +1 import, 2 funções async |
| `src/pages/MeusMateriais.tsx` | +1 import, +1 hook, download nativo |

---

## O Que VOCÊS Precisam Fazer (Após Implementação)

### 1. Ambiente de Desenvolvimento
- Instalar **Android Studio** (developer.android.com/studio)
- Configurar **JDK 17+** e **Android SDK API 33+**

### 2. Inicialização do Capacitor
```bash
# Clonar repositório
git clone [seu-repo] tutorflow-mobile
cd tutorflow-mobile

# Instalar dependências
npm install

# Inicializar Capacitor
npx cap init "TutorFlow Aluno" app.lovable.53db526ffe7b4e76978370ca70e54e3a

# Adicionar Android
npx cap add android

# Sincronizar
npx cap sync

# Abrir no Android Studio
npx cap open android
```

### 3. Assets Nativos (Criar manualmente)
```text
android/app/src/main/res/
├── mipmap-hdpi/ic_launcher.png      (72x72)
├── mipmap-mdpi/ic_launcher.png      (48x48)
├── mipmap-xhdpi/ic_launcher.png     (96x96)
├── mipmap-xxhdpi/ic_launcher.png    (144x144)
└── mipmap-xxxhdpi/ic_launcher.png   (192x192)
```

### 4. Testar
```bash
# Com hot-reload do Lovable
npx cap run android
```

### 5. Build de Produção
```bash
# 1. Comentar bloco "server" em capacitor.config.ts
# 2. Build
npm run build
npx cap sync android
# 3. Gerar AAB no Android Studio
```

---

## Ordem de Execução

```text
1. package.json         → Dependências e scripts
2. capacitor.config.ts  → Configuração Capacitor
3. useCapacitor.ts      → Hook de detecção
4. useStatusBar.ts      → Hook de status bar
5. browser.ts           → Utilitário de navegação
6. App.tsx              → Integração
7. Faturas.tsx          → Links de pagamento
8. MeusMateriais.tsx    → Download nativo
```
