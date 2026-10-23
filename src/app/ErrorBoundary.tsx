import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError, readSnapshot } from '@/data';

interface State {
  readonly error: Error | null;
  readonly exporting: boolean;
  readonly exported: boolean;
}

/**
 * Last-resort screen. It must work even if i18n or the data layer is broken,
 * so its few strings are bilingual and inline (exception to the i18n rule).
 * It offers an emergency export that reads IndexedDB directly.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, exporting: false, exported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void logError(
      Object.assign(error, { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }),
      location.hash,
      __APP_VERSION__,
    );
  }

  private emergencyExport = async (): Promise<void> => {
    this.setState({ exporting: true });
    try {
      const [data, { serializeExport, exportFileName }] = await Promise.all([
        readSnapshot(),
        import('@/io/json/export-json'),
      ]);
      const { text } = await serializeExport(data, __APP_VERSION__, new Date().toISOString());
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(new Date(), 'json');
      a.click();
      this.setState({ exported: true });
    } finally {
      this.setState({ exporting: false });
    }
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    /* eslint-disable local/no-jsx-text */
    return (
      <main className="fatal" lang="fr">
        <h1>Une erreur empêche l'affichage · An error occurred</h1>
        <p>
          Vos données sont intactes dans ce navigateur. Exportez-les par sécurité, puis rechargez
          l'application.
          <br />
          Your data is still stored in this browser. Export it, then reload the app.
        </p>
        <p className="fatal-actions">
          <button
            type="button"
            onClick={() => void this.emergencyExport()}
            disabled={this.state.exporting}
          >
            {this.state.exported
              ? 'Export terminé · Export done'
              : 'Exporter mes données · Export my data'}
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Recharger · Reload
          </button>
        </p>
        <details>
          <summary>Détails techniques · Technical details</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </main>
    );
    /* eslint-enable local/no-jsx-text */
  }
}
