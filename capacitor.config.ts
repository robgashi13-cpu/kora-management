import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.korauto.app',
  appName: 'KORAUTO',
  webDir: 'out',
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false
  },
  server: {
    cleartext: true
  }
};

export default config;

