/**
 * Internationalisation (FormatJS / ICU MessageFormat). Every user-facing string
 * lives in the catalogues of this folder; components never contain raw text.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IntlProvider, useIntl, type PrimitiveType } from 'react-intl';
import type { AppLocale, DateFormat } from '@/domain/model';
import { fr, type MessageId } from './fr';

export type { MessageId };

export type Catalog = Record<MessageId, string>;

/**
 * French ships in the initial bundle (reference language); other catalogues are
 * separate chunks loaded on demand and cached (precached by the service worker).
 */
const catalogs = new Map<AppLocale, Catalog>([['fr-FR', fr]]);

export function loadCatalog(locale: AppLocale): Promise<Catalog> {
  const cached = catalogs.get(locale);
  if (cached) return Promise.resolve(cached);
  return import('./en').then(({ en }) => {
    catalogs.set('en-GB', en);
    return en;
  });
}

/** Catalogue of `locale`, loading it if needed; the previous one stays displayed meanwhile. */
function useCatalog(locale: AppLocale): { locale: AppLocale; messages: Catalog } {
  const [, setLoaded] = useState(0);
  const cached = catalogs.get(locale);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    void loadCatalog(locale).then(() => {
      if (alive) setLoaded((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [locale, cached]);
  return cached ? { locale, messages: cached } : { locale: 'fr-FR', messages: fr };
}

export type MessageValues = Record<
  string,
  PrimitiveType | ReactNode | ((chunks: ReactNode[]) => ReactNode)
>;

export function I18nProvider({
  locale,
  children,
}: {
  locale: AppLocale;
  children: ReactNode;
}): ReactNode {
  const catalog = useCatalog(locale);
  return (
    <IntlProvider locale={catalog.locale} defaultLocale="fr-FR" messages={catalog.messages}>
      {children}
    </IntlProvider>
  );
}

export type Translate = (id: MessageId, values?: Record<string, PrimitiveType>) => string;

export function useT(): Translate {
  const intl = useIntl();
  return useMemo(() => (id, values) => intl.formatMessage({ id }, values), [intl]);
}

/** Inline translated text: <T id="dashboard.title" /> */
export function T({ id, values }: { id: MessageId; values?: MessageValues }): ReactNode {
  const intl = useIntl();
  return <>{intl.formatMessage({ id }, values as Record<string, PrimitiveType>)}</>;
}

// ---------------------------------------------------------------------------
// Formatting context (currency and date format come from the settings)

export interface FormatOptions {
  readonly currency: string;
  readonly dateFormat: DateFormat;
}

const FormatContext = createContext<FormatOptions>({ currency: 'EUR', dateFormat: 'locale' });

export function FormatProvider({
  value,
  children,
}: {
  value: FormatOptions;
  children: ReactNode;
}): ReactNode {
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export function useFormatOptions(): FormatOptions {
  return useContext(FormatContext);
}
