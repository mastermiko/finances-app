import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Menu.module.css';

export interface MenuItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

/**
 * Menu button (WAI-ARIA menu pattern): arrows, Home/End, Escape, typeahead-free.
 * The popup is fixed-positioned in a portal so scroll containers never clip it.
 */
export function Menu({
  trigger,
  items,
}: {
  readonly trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }) => ReactNode;
  readonly items: readonly MenuItem[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const focusIndex = useRef(0);
  const menuId = useId();

  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) buttonRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? items.length * 46 + 8;
    const menuWidth = menuRef.current?.offsetWidth ?? 220;
    const below = rect.bottom + 4 + menuHeight <= window.innerHeight;
    setPosition({
      top: below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - menuHeight),
      left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[focusIndex.current]?.focus();
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onScroll = (): void => close(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, position, close]);

  const move = (delta: number | 'first' | 'last'): void => {
    const nodes = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!nodes || nodes.length === 0) return;
    const current = Array.from(nodes).indexOf(document.activeElement as HTMLElement);
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? nodes.length - 1
          : (current + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <>
      {trigger({
        ref: (el) => {
          buttonRef.current = el;
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
        onClick: () => {
          focusIndex.current = 0;
          setOpen((o) => !o);
        },
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            focusIndex.current = e.key === 'ArrowDown' ? 0 : items.length - 1;
            setOpen(true);
          }
        },
      })}
      {open
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              className={styles.menu}
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { visibility: 'hidden', top: 0, left: 0 }
              }
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  move('first');
                } else if (e.key === 'End') {
                  e.preventDefault();
                  move('last');
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                } else if (e.key === 'Tab') {
                  close(false);
                }
              }}
            >
              {items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={[styles.item, item.danger ? styles.danger : ''].join(' ')}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
