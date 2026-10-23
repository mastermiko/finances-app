import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, TextInput } from '../components/Field';

const meta = {
  title: 'Composants/Dialogue',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** `<dialog>` natif : piège de focus, arrière-plan inerte et Échap fournis par le navigateur. */
export const Formulaire: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Nouvelle catégorie
        </Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Nouvelle catégorie"
          closeLabel="Fermer"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Créer
              </Button>
            </>
          }
        >
          <Field label="Nom">
            <TextInput maxLength={60} />
          </Field>
        </Dialog>
      </>
    );
  },
};

export const Confirmation: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Vider la corbeille
        </Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          role="alertdialog"
          size="sm"
          title="Vider la corbeille ?"
          description="Les 12 opérations de la corbeille seront supprimées définitivement."
          closeLabel="Fermer"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Vider la corbeille
              </Button>
            </>
          }
        />
      </>
    );
  },
};
