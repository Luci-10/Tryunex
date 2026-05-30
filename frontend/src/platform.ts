import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

/**
 * Executes a function only on the native app (Android/iOS)
 */
export function runInApp(fn: () => void) {
  if (isNative) {
    fn();
  }
}

/**
 * Executes a function only on the web
 */
export function runOnWeb(fn: () => void) {
  if (!isNative) {
    fn();
  }
}
