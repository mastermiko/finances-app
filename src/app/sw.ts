/**
 * Service worker registration (vite-plugin-pwa, "prompt" strategy): a new
 * version is downloaded in the background, then a banner offers to reload.
 * Other tabs are told through a BroadcastChannel.
 */
import { create } from 'zustand';

interface UpdateState {
  readonly needRefresh: boolean;
  readonly offlineReady: boolean;
  update: (() => Promise<void>) | null;
  dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set) => ({
  needRefresh: false,
  offlineReady: false,
  update: null,
  dismiss: () => set({ needRefresh: false, offlineReady: false }),
}));

const CHANNEL = 'finances-app';

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  const channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel(CHANNEL) : null;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUpdate.setState({ needRefresh: true });
      channel?.postMessage({ type: 'update-available' });
    },
    onOfflineReady() {
      useUpdate.setState({ offlineReady: true });
    },
    onRegisteredSW(_url, registration) {
      // Check for updates every hour while the app stays open.
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
  useUpdate.setState({ update: () => updateSW(true) });
  channel?.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === 'update-available') useUpdate.setState({ needRefresh: true });
    if (event.data?.type === 'reload') window.location.reload();
  });
}

/** Registers once the page has loaded, so the precache download never competes with the first screen. */
export function registerServiceWorkerAfterLoad(): void {
  const start = (): void => void registerServiceWorker();
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

export function broadcastReload(): void {
  if ('BroadcastChannel' in globalThis)
    new BroadcastChannel(CHANNEL).postMessage({ type: 'reload' });
}
