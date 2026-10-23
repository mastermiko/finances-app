import type { CSSProperties, ReactNode } from 'react';
import {
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  House,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Plane,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { darkVariant } from '@/domain/model';
import styles from './category-icons.module.css';

export const ICON_COMPONENTS: Readonly<Record<string, LucideIcon>> = {
  home: House,
  car: Car,
  bus: Bus,
  utensils: Utensils,
  coffee: Coffee,
  'shopping-cart': ShoppingCart,
  party: PartyPopper,
  gamepad: Gamepad2,
  repeat: Repeat,
  heart: Heart,
  'piggy-bank': PiggyBank,
  wallet: Wallet,
  briefcase: Briefcase,
  gift: Gift,
  graduation: GraduationCap,
  plane: Plane,
  dumbbell: Dumbbell,
  shirt: Shirt,
  phone: Smartphone,
  zap: Zap,
  paw: PawPrint,
  baby: Baby,
  book: BookOpen,
  tag: Tag,
};

/** Relative luminance check: dark glyph on light fills (yellow), white otherwise. */
export function glyphColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.35 ? '#0b0b0b' : '#ffffff';
}

export function colorVars(color: string): CSSProperties {
  const dark = darkVariant(color);
  return {
    '--c-light': color,
    '--c-dark': dark,
    '--g-light': glyphColor(color),
    '--g-dark': glyphColor(dark),
  } as CSSProperties;
}

export function CategoryIcon({
  icon,
  color,
  size = 'md',
}: {
  readonly icon: string;
  readonly color: string;
  readonly size?: 'sm' | 'md';
}): ReactNode {
  const Icon = ICON_COMPONENTS[icon] ?? Tag;
  return (
    <span
      className={[styles.icon, size === 'sm' ? styles.sm : ''].join(' ')}
      style={colorVars(color)}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}

export function ColorSwatch({ color }: { readonly color: string }): ReactNode {
  return <span className={styles.swatch} style={colorVars(color)} aria-hidden="true" />;
}
