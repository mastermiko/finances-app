import { create } from 'zustand';
import type { Operation } from '@/domain/model';

export interface EntryRequest {
  /** Edit an existing operation */
  readonly editId?: string;
  /** Prefill from an operation (duplicate / repeat) */
  readonly template?: Partial<
    Pick<
      Operation,
      'amountMinor' | 'categoryId' | 'label' | 'kind' | 'accountId' | 'note' | 'tagIds'
    >
  >;
  /** Default budget period for undated charges and the default date */
  readonly period?: string;
}

interface UiState {
  readonly entry: EntryRequest | null;
  openEntry: (request?: EntryRequest) => void;
  closeEntry: () => void;
}

export const useUi = create<UiState>((set) => ({
  entry: null,
  openEntry: (request = {}) => set({ entry: request }),
  closeEntry: () => set({ entry: null }),
}));
