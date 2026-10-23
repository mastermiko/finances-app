import type { StorybookConfig } from '@storybook/react-vite';

/** Design system catalogue (src/ui): `pnpm storybook`, static build: `pnpm build-storybook`. */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  viteFinal(viteConfig) {
    // The app's PWA and CSP plugins do not apply to the catalogue.
    viteConfig.plugins = (viteConfig.plugins ?? []).flat().filter((plugin) => {
      const name = plugin && typeof plugin === 'object' && 'name' in plugin ? plugin.name : '';
      return !name.startsWith('vite-plugin-pwa') && name !== 'finances-csp-meta';
    });
    return viteConfig;
  },
};

export default config;
