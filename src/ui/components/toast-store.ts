import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ToastAction {
  readonly label: string;
  readonly onAction: () => void | Promise<void>;
}

export interface Toast {
  readonly id: number;
  readonly message: ReactNode;
  readonly tone: 'info' | 'success' | 'warning' | 'error';
  readonly action?: ToastAction;
  /** ms; undo toasts stay 10 s. Paused while hovered or focused. */
  readonly duration: number;
}

interface ToastState {
  readonly toasts: readonly Toast[];
  push: (
    toast: Omit<Toast, 'id' | 'duration' | 'tone'> & Partial<Pick<Toast, 'duration' | 'tone'>>,
  ) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    const duration = toast.duration ?? (toast.action ? 10_000 : 6_000);
    set((s) => ({ toasts: [...s.toasts.slice(-2), { tone: 'info', ...toast, id, duration }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(
  message: ReactNode,
  options: { tone?: Toast['tone']; action?: ToastAction; duration?: number } = {},
): number {
  return useToasts.getState().push({ message, ...options });
}
