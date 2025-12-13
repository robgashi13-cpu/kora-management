import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.korauto.app',
  appName: 'KORAUTO',
  webDir: 'out',
  backgroundColor: '#000000',
  ios: {
    limitsNavigationsToAppBoundDomains: false
  },
  server: {
    cleartext: true
  }
};

export default config;

