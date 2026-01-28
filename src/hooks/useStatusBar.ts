import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useCapacitor } from './useCapacitor';

/**
 * Hook para sincronizar a StatusBar do Android com o tema do app
 * 
 * Automaticamente atualiza:
 * - Cor de fundo da status bar
 * - Estilo dos ícones (claro/escuro)
 * 
 * Só executa em ambiente nativo (Capacitor)
 */
export function useStatusBar() {
  const { theme, resolvedTheme } = useTheme();
  const { isNativeApp, isReady } = useCapacitor();

  useEffect(() => {
    // Só executa no app nativo
    if (!isReady || !isNativeApp) return;

    const updateStatusBar = async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        
        // Usar resolvedTheme para lidar com 'system'
        const currentTheme = resolvedTheme || theme;
        
        if (currentTheme === 'dark') {
          // Tema escuro: fundo escuro, ícones claros
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#1F2937' });
        } else {
          // Tema claro: fundo primário, ícones claros
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
