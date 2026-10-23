import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CircleCheck, TriangleAlert, Wallet } from 'lucide-react';
import { Button } from '../components/Button';
import {
  Amount,
  Badge,
  EmptyState,
  Gauge,
  InfoTip,
  MonthSwitcher,
  Section,
  Skeleton,
  Tabs,
} from '../components/Display';

const meta = {
  title: 'Composants/Affichage',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Le signe et la flèche portent le sens, la couleur ne fait que le renforcer. */
export const Montants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, fontSize: 18 }}>
      <Amount minor={-4210} formatted="−42,10 €" kind="expense" />
      <Amount minor={115000} formatted="+1 150,00 €" kind="income" />
      <Amount minor={-30000} formatted="−300,00 €" kind="transfer" />
      <Amount minor={-1399} formatted="−13,99 €" kind="expense" planned />
    </div>
  ),
};

/** Jauge exposée comme `meter` ARIA ; le repère indique la part écoulée du mois. */
export const Jauges: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <Gauge
        ratio={0.42}
        level="ok"
        label="Budget Loisirs"
        valueText="42 % consommés"
        marker={0.7}
      />
      <Gauge
        ratio={0.85}
        level="warn"
        label="Budget Alimentation"
        valueText="85 % consommés"
        marker={0.7}
      />
      <Gauge
        ratio={1.2}
        level="over"
        label="Budget Transport"
        valueText="120 % consommés"
        marker={0.7}
      />
    </div>
  ),
};

export const Pastilles: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge>Prévue</Badge>
      <Badge tone="accent">Virement</Badge>
      <Badge tone="warn" icon={<TriangleAlert aria-hidden="true" />}>
        80 % atteints
      </Badge>
      <Badge tone="danger">Dépassé</Badge>
      <Badge tone="ok" icon={<CircleCheck aria-hidden="true" />}>
        Soldes identiques
      </Badge>
    </div>
  ),
};

export const EtatVide: Story = {
  render: () => (
    <EmptyState
      icon={<Wallet aria-hidden="true" />}
      title="Aucune opération ce mois-ci"
      actions={<Button variant="primary">Ajouter une opération</Button>}
    >
      Saisissez une dépense ou importez votre classeur Finances.
    </EmptyState>
  ),
};

export const Chargement: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }} aria-busy="true">
      <Skeleton height={48} width="40%" />
      <Skeleton height={140} />
    </div>
  ),
};

export const AideContextuelle: Story = {
  render: () => (
    <p>
      Mois budgétaire{' '}
      <InfoTip label="Aide sur le mois budgétaire">
        Si votre salaire arrive le 26, commencez le mois budgétaire le 26.
      </InfoTip>
    </p>
  ),
};

export const SectionEtOnglets: Story = {
  render: function Render() {
    const [tab, setTab] = useState<'evolution' | 'compare'>('evolution');
    return (
      <Section title="Analyses" panel>
        <Tabs
          idPrefix="story"
          label="Vues"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'evolution', label: 'Évolution' },
            { value: 'compare', label: 'Comparaison' },
          ]}
        />
        <div
          id="story-panel"
          role="tabpanel"
          aria-labelledby={`story-tab-${tab}`}
          style={{ paddingTop: 16 }}
        >
          {tab === 'evolution'
            ? 'Dépenses mois par mois'
            : 'Ce mois-ci par rapport au mois précédent'}
        </div>
      </Section>
    );
  },
};

export const SelecteurDeMois: Story = {
  render: () => (
    <MonthSwitcher
      label="Octobre 2026"
      previousLabel="Mois précédent"
      nextLabel="Mois suivant"
      onPrevious={() => undefined}
      onNext={() => undefined}
    />
  ),
};
