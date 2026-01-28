import { useEffect, useState } from 'react';

interface CapacitorState {
  isNativeApp: boolean;
  platform: 'web' | 'android' | 'ios';
  isReady: boolean;
}

/**
 * Hook para detectar se o app está rodando em ambiente nativo (Capacitor)
 * 
 * Uso:
 * const { isNativeApp, platform, isReady } = useCapacitor();
 * 
 * if (isNativeApp) {
 *   // Código específico para app nativo
 * }
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
        // Import dinâmico para não quebrar na web
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
        // Capacitor não disponível (ambiente web puro)
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
