"use client";
import { api } from "./frontend-client";
// Minimal SDK surface used here. Supply the SDK object from OneSignalDeferred.
export interface OneSignalWeb {
  init(options: {
    appId: string;
    allowLocalhostAsSecureOrigin: boolean;
    serviceWorkerPath: string;
    welcomeNotification: { disable: boolean };
  }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: {
    requestPermission(): Promise<void>;
    isPushSupported(): boolean;
    permission: boolean;
  };
  User: {
    PushSubscription: {
      optIn(): Promise<void>;
      optOut(): Promise<void>;
      id?: string | null;
    };
  };
}
type PushConfig =
  { enabled: false } | { enabled: true; appId: string; externalId: string };
let initialized: Promise<void> | undefined;

// Call after app login/session restore and on account change, never before auth.
export async function initializePush(sdk: OneSignalWeb) {
  const { data } = await api<PushConfig>("/notifications/push-config");
  if (!data.enabled) return { enabled: false };
  if (!sdk.Notifications.isPushSupported()) return { enabled: false };
  initialized ??= sdk
    .init({
      appId: data.appId,
      allowLocalhostAsSecureOrigin: window.location.hostname === "localhost",
      serviceWorkerPath: "OneSignalSDKWorker.js",
      welcomeNotification: { disable: true },
    })
    .catch((error) => {
      initialized = undefined;
      throw error;
    });
  await initialized;
  await sdk.login(data.externalId);
  return { enabled: true };
}
// Wire to an explicit 'Enable notifications' button AFTER initializePush completed.
export async function enablePushFromClick(sdk: OneSignalWeb) {
  await sdk.Notifications.requestPermission();
  if (sdk.Notifications.permission) await sdk.User.PushSubscription.optIn();
}
// Call during sign-out/account switch. Stop Socket.IO as well as revoking API auth.
export async function disconnectPush(sdk: OneSignalWeb) {
  if (initialized) {
    await initialized;
    await sdk.logout();
  }
}
