declare global {
  interface Window {
    CookieConsent?: {
      run: (config: any) => void;
      showPreferences: () => void;
      hideSettings: () => void;
      hide: () => void;
      show: () => void;
      acceptedCategory: (category: string) => boolean;
      acceptCategory: (category: string) => void;
      acceptedService: (service: string, category: string) => boolean;
      acceptService: (service: string, category: string) => void;
      validConsent: () => boolean;
      eraseCookies: (cookies: string | string[], path?: string, domain?: string) => void;
      reset: (eraseCookies?: boolean) => void;
    };
  }
}

export {};
