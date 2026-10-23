/**
 * Trusted Types (CSP: require-trusted-types-for 'script').
 * The default policy only lets same-origin JavaScript URLs reach script sinks
 * (Web Worker, service worker registration) and rejects any non-empty HTML or
 * any script string, so an injection can never become markup or code.
 */
interface TrustedTypePolicyFactoryLike {
  createPolicy: (name: string, rules: Record<string, (input: string) => string>) => unknown;
  defaultPolicy?: unknown;
}

export function isSameOriginScript(input: string, base: string = location.href): boolean {
  try {
    const url = new URL(input, base);
    return url.origin === location.origin && /\.(?:js|mjs|ts)$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function installTrustedTypes(): void {
  const tt = (globalThis as { trustedTypes?: TrustedTypePolicyFactoryLike }).trustedTypes;
  if (!tt || tt.defaultPolicy) return;
  const reject = (): string => {
    throw new TypeError('Blocked by the Trusted Types policy');
  };
  tt.createPolicy('default', {
    // Only clearing an element (innerHTML = '', used by the chart library) is allowed.
    createHTML: (input) => (input === '' ? '' : reject()),
    createScript: reject,
    createScriptURL: (input) => {
      if (isSameOriginScript(input)) return input;
      throw new TypeError('Blocked script URL');
    },
  });
}
