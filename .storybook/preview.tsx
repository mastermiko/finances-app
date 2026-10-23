import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import '../src/ui/styles/tokens.css';
import '../src/ui/styles/base.css';

/** Applies the light / dark theme of the toolbar to <html>, like the app does. */
function ThemeRoot({ theme, children }: { theme: string; children: ReactNode }): ReactNode {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  return children;
}

const withTheme: Decorator = (Story, context) => (
  <ThemeRoot theme={String(context.globals.theme)}>
    <Story />
  </ThemeRoot>
);

const withI18n: Decorator = (Story) => (
  <I18nProvider locale="fr-FR">
    <Story />
  </I18nProvider>
);

const preview: Preview = {
  decorators: [withTheme, withI18n],
  globalTypes: {
    theme: {
      description: 'Thème',
      toolbar: {
        title: 'Thème',
        icon: 'contrast',
        items: [
          { value: 'system', title: 'Système' },
          { value: 'light', title: 'Clair' },
          { value: 'dark', title: 'Sombre' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
