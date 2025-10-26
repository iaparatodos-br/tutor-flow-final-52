import { useState, useEffect } from 'react';

interface CookieConsentState {
  hasAnalyticsConsent: boolean;
  hasMarketingConsent: boolean;
  isLoaded: boolean;
}

export const useCookieConsent = (): CookieConsentState => {
  const [state, setState] = useState<CookieConsentState>({
    hasAnalyticsConsent: false,
    hasMarketingConsent: false,
    isLoaded: false
  });

  useEffect(() => {
    const checkConsent = () => {
      if (window.CookieConsent && typeof window.CookieConsent.acceptedCategory === 'function') {
        setState({
          hasAnalyticsConsent: window.CookieConsent.acceptedCategory('analytics'),
          hasMarketingConsent: window.CookieConsent.acceptedCategory('marketing'),
          isLoaded: true
        });
      }
    };

    // Verificar na montagem
    checkConsent();

    // Ouvir eventos de mudança
    const events = ['cc:onFirstConsent', 'cc:onConsent', 'cc:onChange'];
    events.forEach(event => {
      window.addEventListener(event, checkConsent);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, checkConsent);
      });
    };
  }, []);

  return state;
};
