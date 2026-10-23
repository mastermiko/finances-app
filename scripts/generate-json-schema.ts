/**
 * Publishes the JSON Schema of the export format (docs/export-format.schema.json),
 * generated from the Zod schemas so documentation and code never diverge.
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { exportEnvelopeSchema, SCHEMA_VERSION } from '../src/domain/model/schemas';

const schema = z.toJSONSchema(exportEnvelopeSchema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
});
const document = {
  $id: `https://finances.local/schemas/export-v${SCHEMA_VERSION}.json`,
  title: `Finances – format d'export JSON v${SCHEMA_VERSION}`,
  description:
    'Enveloppe de sauvegarde complète (.json). Montants en centimes entiers signés, dates civiles AAAA-MM-JJ, périodes AAAA-MM, identifiants UUID v7, horodatages ISO 8601 UTC. La somme de contrôle est le SHA-256 du JSON canonique (clés triées) de `data`.',
  ...schema,
};
writeFileSync(
  new URL('../docs/export-format.schema.json', import.meta.url),
  `${JSON.stringify(document, null, 2)}\n`,
);
console.log(`docs/export-format.schema.json written (schema v${SCHEMA_VERSION})`);
