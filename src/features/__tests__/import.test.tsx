import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allLiveOperations, getDb, readSnapshot } from '@/data';
import { serializeExport } from '@/io/json/export-json';
import { encryptText } from '@/io/crypto/encryption';
import { freshDatabase, renderApp, resetEnvironment } from '@/test/render-app';

const WORKBOOK = resolve(process.cwd(), 'src/test/fixtures/finances-fictif.xlsx');

function file(content: BlobPart, name: string, type = 'application/octet-stream'): File {
  return new File([content], name, { type });
}

async function choose(f: File): Promise<void> {
  // The native input is hidden; the visible "Choose a file" button opens it.
  await screen.findByRole('button', { name: 'Choisir un fichier' });
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('file input not found');
  fireEvent.change(input, { target: { files: [f] } });
}

beforeEach(async () => {
  await freshDatabase();
});
afterEach(async () => {
  await resetEnvironment();
});

describe('import screen', () => {
  it('imports the workbook with balance controls, then offers grouping and the café tracker', async () => {
    const user = userEvent.setup();
    await renderApp('/import');
    await choose(file(readFileSync(WORKBOOK), 'Finances.xlsx'));
    expect(await screen.findByText('Aucun écart', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText(/Avril2026, ligne 43/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Fusionner' }));
    await user.click(screen.getByRole('button', { name: 'Importer 364 opérations' }));
    expect(
      await screen.findByText('364 opérations importées.', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(await allLiveOperations()).toHaveLength(364);
    await user.click(screen.getByRole('button', { name: 'Télécharger le rapport d’import' }));
    expect(screen.getByText(/libellés écrits de plusieurs façons/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Créer le tag #café et la règle/ }));
    await waitFor(async () => expect(await getDb().tags.count()).toBe(1));
    await waitFor(async () =>
      expect((await allLiveOperations()).filter((o) => o.tagIds.length > 0).length).toBeGreaterThan(
        50,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Annuler cet import' }));
    await waitFor(async () => expect(await allLiveOperations()).toHaveLength(0));
  });

  it('flags duplicates on a second import and lets the user decide', async () => {
    const user = userEvent.setup();
    await renderApp('/import');
    await choose(file(readFileSync(WORKBOOK), 'Finances.xlsx'));
    await user.click(
      await screen.findByRole('button', { name: 'Importer 364 opérations' }, { timeout: 10000 }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Importer un autre fichier' }, { timeout: 10000 }),
    );
    await choose(file(readFileSync(WORKBOOK), 'Finances.xlsx'));
    expect(
      await screen.findByRole('heading', { name: /doublons possibles/ }, { timeout: 10000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importer tous' }));
    expect(screen.getByRole('button', { name: 'Importer 364 opérations' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ignorer tous' }));
    expect(screen.getByRole('button', { name: /^Importer 0 opération/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
  });

  it('restores a JSON backup and an encrypted backup', async () => {
    const user = userEvent.setup();
    const snapshot = await readSnapshot();
    const { text } = await serializeExport(snapshot, '1.0.0', '2026-10-23T10:00:00.000Z');
    await renderApp('/import');
    await choose(file(text, 'finances.json', 'application/json'));
    expect(await screen.findByText('Somme de contrôle vérifiée')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Fusionner' }));
    await user.click(screen.getByRole('radio', { name: 'Remplacer' }));
    await user.click(screen.getByRole('button', { name: 'Restaurer la sauvegarde' }));
    expect(await screen.findByText(/opération importée\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler cet import' }));
    await user.click(screen.getByRole('button', { name: 'Importer un autre fichier' }));

    const tampered = text.replace('"Logement"', '"Maison"');
    await choose(file(tampered, 'modifie.json'));
    expect(await screen.findByText(/La somme de contrôle ne correspond pas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer la sauvegarde' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Importer quand même/ }));
    expect(screen.getByRole('button', { name: 'Restaurer la sauvegarde' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    const encrypted = await encryptText(text, 'motdepasse', 100_000);
    await choose(file(encrypted, 'sauvegarde.finances.enc'));
    const password = await screen.findByLabelText('Mot de passe de la sauvegarde');
    await user.type(password, 'faux{Enter}');
    expect(
      await screen.findByText('Mot de passe incorrect, ou fichier endommagé.'),
    ).toBeInTheDocument();
    await user.clear(password);
    await user.type(password, 'motdepasse{Enter}');
    expect(
      await screen.findByText('Somme de contrôle vérifiée', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });

  it('maps bank CSV columns, remembers them, and reads OFX / QIF', async () => {
    const user = userEvent.setup();
    await renderApp('/import');
    const csv =
      'Date opération;Libellé;Montant\n01/10/2026;CB CAFE;-2,50\n02/10/2026;VIR SALAIRE;1240,00\n';
    await choose(file(csv, 'releve.csv', 'text/csv'));
    expect(await screen.findByText('Colonnes du relevé')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Aperçu du fichier' });
    expect(within(region).getByText('CB CAFE')).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Format de date' }),
      'dd/MM/yyyy',
    );
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText(/Aperçu de releve.csv/)).toBeInTheDocument();
    expect(screen.getByText('À classer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importer 2 opérations' }));
    expect(await screen.findByText('2 opérations importées.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Importer un autre fichier' }));

    const ofx =
      '<OFX><STMTTRN><DTPOSTED>20261003<TRNAMT>-4.20<FITID>1<NAME>BOULANGERIE</STMTTRN></OFX>';
    await choose(file(ofx, 'releve.ofx'));
    expect(await screen.findByText(/Aperçu de releve.ofx/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await choose(file('!Type:Bank\nD04/10/2026\nT-3,00\nPPAIN\n^\n', 'releve.qif'));
    expect(await screen.findByText(/Aperçu de releve.qif/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await choose(file('x', 'image.png'));
    expect(await screen.findByText(/Format non pris en charge/)).toBeInTheDocument();
    await choose(file('not a zip', 'faux.xlsx'));
    expect(await screen.findByText(/n’est pas un classeur Excel valide/)).toBeInTheDocument();
    await choose(file('{"a":1}', 'autre.json'));
    expect(await screen.findByText(/n’est pas une sauvegarde/)).toBeInTheDocument();
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.csv');
    await choose(big);
    expect(await screen.findByText(/Fichier trop volumineux/)).toBeInTheDocument();
  });
});
