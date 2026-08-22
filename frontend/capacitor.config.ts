import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.tryunex.app',
  appName: 'TryUnex',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      /*
       * Do not resize anything when the keyboard opens.
       *
       * The default, "native", resizes the whole web view, which changes what
       * vh and height:100% resolve to and forces a full relayout. iOS does not
       * reliably restore the previous size when the keyboard goes away, so the
       * page ends up taller than the screen and the bottom bar drifts.
       *
       * With resizing off the viewport is constant, and the only element that
       * has to clear the keyboard — the chat input — is offset by the reported
       * keyboard height instead. See src/keyboard.ts.
       */
      resize: "none" as any,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
