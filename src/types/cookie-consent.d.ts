declare module 'vanilla-cookieconsent' {
  export interface CookieConsentConfig {
    mode?: 'opt-in' | 'opt-out';
    autoDetectLanguage?: boolean;
    manageScriptTags?: boolean;
    delay?: number;
    categories?: Record<string, any>;
    language?: {
      default: string;
      translations: Record<string, any>;
    };
  }

  export function run(config: CookieConsentConfig): void;
  export function showPreferences(): void;
  export function acceptedCategory(category: string): boolean;
  export function acceptCategory(category: string): void;
  export function acceptedService(service: string, category: string): boolean;
  export function acceptService(service: string, category: string): void;
  export function validConsent(): boolean;
  export function eraseCookies(cookies: string | string[], path?: string, domain?: string): void;
  export function hideSettings(): void;
  export function hide(): void;
  export function show(): void;
  export function reset(eraseCookies?: boolean): void;
}

declare global {
  interface Window {
    CookieConsent?: {
      run: (config: any) => void;
      showPreferences: () => void;
      acceptedCategory: (category: string) => boolean;
      acceptCategory: (category: string) => void;
      acceptedService: (service: string, category: string) => boolean;
      acceptService: (service: string, category: string) => void;
      validConsent: () => boolean;
      eraseCookies: (cookies: string | string[], path?: string, domain?: string) => void;
      hideSettings: () => void;
      hide: () => void;
      show: () => void;
      reset: (eraseCookies?: boolean) => void;
    };
  }
}

export {};
