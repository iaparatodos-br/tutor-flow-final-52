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
