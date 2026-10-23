import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../components/Button';

const meta = {
  title: 'Composants/Bouton',
  component: Button,
  args: { children: 'Enregistrer', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['md', 'sm'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primaire: Story = {
  args: { variant: 'primary', icon: <Plus aria-hidden="true" />, children: 'Nouvelle opération' },
};
export const Secondaire: Story = {};
export const Discret: Story = { args: { variant: 'ghost', children: 'Annuler' } };
export const Danger: Story = {
  args: { variant: 'danger', icon: <Trash2 aria-hidden="true" />, children: 'Supprimer' },
};
export const EnCours: Story = {
  args: { variant: 'primary', loading: true, children: 'Import en cours' },
};
export const Desactive: Story = { args: { disabled: true } };

export const Icone: StoryObj<typeof IconButton> = {
  render: () => <IconButton label="Exporter" icon={<Download aria-hidden="true" />} />,
};
