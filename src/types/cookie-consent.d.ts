declare global {
  interface Window {
    CookieConsent?: {
      showSettings: () => void;
      acceptedCategory: (category: string) => boolean;
      acceptCategory: (category: string) => void;
      acceptedService: (service: string, category: string) => boolean;
      acceptService: (service: string, category: string) => void;
      validConsent: () => boolean;
      eraseCookies: (cookies: string | string[], path?: string, domain?: string) => void;
    };
  }
}

export {};
