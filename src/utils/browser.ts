/**
 * Utilitários para navegação em ambiente nativo (Capacitor)
 * 
 * No app nativo:
 *   - Usa @capacitor/browser para abrir in-app browser
 *   - Mantém usuário dentro do app
 *   - Suporta callback quando browser fecha
 * 
 * Na web:
 *   - Usa window.open() padrão
 */

/**
 * Abre uma URL externa de forma segura
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
      console.log('[Browser] Opened URL in new tab:', url);
    }
  } catch (error) {
    console.warn('[Browser] Fallback to window.open:', error);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Fecha o browser in-app (apenas no app nativo)
 */
export async function closeExternalBrowser(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
      console.log('[Browser] Closed native browser');
    }
  } catch (error) {
    console.log('[Browser] Cannot close (not native or no browser open)');
  }
}

/**
 * Adiciona listener para quando o browser in-app é fechado
 */
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
