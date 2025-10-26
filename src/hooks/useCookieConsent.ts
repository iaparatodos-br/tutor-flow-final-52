import { useState, useEffect } from 'react';

interface CookieConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsentState>({
    necessary: true, // Sempre true
    analytics: false,
    marketing: false
  });

  useEffect(() => {
    const CookieConsent = (window as any).CookieConsent;
    
    if (!CookieConsent) {
      console.warn('[useCookieConsent] CookieConsent not loaded');
      return;
    }

    // Função para atualizar o estado
    const updateConsentState = () => {
      setConsent({
        necessary: true,
        analytics: CookieConsent.acceptedCategory('analytics'),
        marketing: CookieConsent.acceptedCategory('marketing')
      });
    };

    // Atualizar estado inicial
    updateConsentState();

    // Escutar mudanças de consentimento
    const handleConsentChange = () => {
      console.info('[useCookieConsent] Consent changed');
      updateConsentState();
    };

    // Event listener para mudanças
    window.addEventListener('cc:onChange', handleConsentChange);

    return () => {
      window.removeEventListener('cc:onChange', handleConsentChange);
    };
  }, []);

  return {
    ...consent,
    hasAnalyticsConsent: consent.analytics,
    hasMarketingConsent: consent.marketing,
    isLoaded: !!(window as any).CookieConsent
  };
}
