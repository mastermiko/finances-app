import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import {
  Checkbox,
  Field,
  Segmented,
  Select,
  Switch,
  TextArea,
  TextInput,
} from '../components/Field';

const meta = {
  title: 'Composants/Champs',
  component: Field,
  args: { label: 'Libellé', children: <TextInput /> },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Texte: Story = {
  args: {
    label: 'Libellé',
    hint: '120 caractères maximum',
    children: <TextInput defaultValue="Courses" />,
  },
};

export const Montant: Story = {
  args: {
    label: 'Montant',
    hint: 'Calcul accepté : 12,50+7,30',
    children: <TextInput inputMode="decimal" defaultValue="12,50+7,30" />,
  },
};

export const EnErreur: Story = {
  args: {
    label: 'Montant',
    error: 'Saisissez un montant, par exemple 12,50.',
    children: <TextInput inputMode="decimal" defaultValue="12,,5" />,
  },
};

export const Optionnel: Story = {
  args: { label: 'Note', optionalLabel: '(facultatif)', children: <TextArea rows={3} /> },
};

export const Liste: Story = {
  args: {
    label: 'Compte',
    children: (
      <Select defaultValue="courant">
        <option value="courant">Compte courant</option>
        <option value="livret">Livret A</option>
      </Select>
    ),
  },
};

export const CasesEtInterrupteurs: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(true);
    const [kind, setKind] = useState<'expense' | 'income'>('expense');
    return (
      <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
        <Checkbox checked={checked} onChange={setChecked} label="Remboursement" />
        <Switch checked={checked} onChange={setChecked} label="Reporter le reste du mois" />
        <Segmented
          name="kind"
          legend="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Dépense', icon: <ArrowDownRight aria-hidden="true" /> },
            { value: 'income', label: 'Revenu', icon: <ArrowUpRight aria-hidden="true" /> },
          ]}
        />
      </div>
    );
  },
};
