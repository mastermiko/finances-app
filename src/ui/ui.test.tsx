import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Amount,
  Badge,
  Button,
  CategoryIcon,
  Checkbox,
  ColorSwatch,
  Combobox,
  Dialog,
  EmptyState,
  Field,
  Gauge,
  glyphColor,
  IconButton,
  InfoTip,
  Menu,
  MonthSwitcher,
  Section,
  Segmented,
  Skeleton,
  Switch,
  Tabs,
  TextInput,
  toast,
  Toaster,
  useToasts,
} from './index';

describe('Button and fields', () => {
  it('renders variants, loading state and wired field messages', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button variant="primary" onClick={onClick} icon={<span>i</span>}>
          OK
        </Button>
        <Button loading>Busy</Button>
        <IconButton label="Fermer" icon={<span>x</span>} />
        <Field label="Montant" hint="Aide" error="Erreur" optionalLabel="(facultatif)">
          <TextInput />
        </Field>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /OK/ }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Busy' })).toHaveAttribute('aria-busy', 'true');
    const input = screen.getByRole('textbox', { name: /Montant/ });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Aide Erreur');
    expect(screen.getByRole('alert')).toHaveTextContent('Erreur');
  });

  it('checkbox, switch and segmented control', async () => {
    const onCheck = vi.fn();
    const onSwitch = vi.fn();
    function Seg(): React.ReactNode {
      const [v, setV] = useState<'a' | 'b'>('a');
      return (
        <Segmented
          name="s"
          legend="Choix"
          value={v}
          onChange={setV}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
      );
    }
    render(
      <>
        <Checkbox label="Cocher" description="desc" checked={false} onChange={onCheck} />
        <Switch label="Activer" description="Explication" checked={false} onChange={onSwitch} />
        <Seg />
      </>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /Cocher/ }));
    expect(onCheck).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('switch', { name: /Activer/ }));
    expect(onSwitch).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
  });
});

describe('Display components', () => {
  it('amounts carry a sign icon, gauges are meters, badges, empty states and skeletons render', () => {
    render(
      <>
        <Amount minor={-1250} formatted="−12,50 €" kind="expense" srLabel="moins douze" />
        <Amount minor={1250} formatted="+12,50 €" planned />
        <Amount minor={-500} formatted="−5,00 €" kind="transfer" />
        <Gauge ratio={1.4} level="over" label="Budget" valueText="140 %" marker={0.5} />
        <Gauge ratio={Number.POSITIVE_INFINITY} level="warn" label="Inf" valueText="∞" />
        <Badge tone="danger">Alerte</Badge>
        <Badge tone="ok">OK</Badge>
        <Badge tone="warn">Warn</Badge>
        <Badge tone="accent">Info</Badge>
        <EmptyState
          title="Vide"
          icon={<span />}
          actions={<button type="button">Agir</button>}
          centered
        >
          Texte
        </EmptyState>
        <Skeleton />
        <Section title="Titre" actions={<span>act</span>} panel headingLevel={3}>
          contenu
        </Section>
        <Section>sans titre</Section>
        <CategoryIcon icon="inconnue" color="#eda100" size="sm" />
        <ColorSwatch color="#2a78d6" />
      </>,
    );
    expect(screen.getByText('moins douze')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Budget' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('heading', { name: 'Vide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Titre', level: 3 })).toBeInTheDocument();
    expect(glyphColor('#eda100')).toBe('#0b0b0b');
    expect(glyphColor('#1d4f8f')).toBe('#ffffff');
  });

  it('toggletip opens on click and closes with Escape or outside click', async () => {
    render(
      <>
        <InfoTip label="Aide">Contenu d’aide</InfoTip>
        <button type="button">ailleurs</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aide' }));
    expect(screen.getByText('Contenu d’aide')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Contenu d’aide')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aide' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'ailleurs' }));
    expect(screen.queryByText('Contenu d’aide')).not.toBeInTheDocument();
  });

  it('tabs support arrow keys and month switcher buttons', async () => {
    const onPrev = vi.fn();
    const onLabel = vi.fn();
    function T(): React.ReactNode {
      const [v, setV] = useState<'a' | 'b' | 'c'>('a');
      return (
        <Tabs
          idPrefix="t"
          label="Onglets"
          value={v}
          onChange={setV}
          items={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ]}
        />
      );
    }
    render(
      <>
        <T />
        <MonthSwitcher
          label="Octobre"
          previousLabel="Préc"
          nextLabel="Suiv"
          onPrevious={onPrev}
          onNext={vi.fn()}
          onLabelClick={onLabel}
          labelHint="retour"
        />
        <MonthSwitcher
          label="Nov"
          previousLabel="P2"
          nextLabel="S2"
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />
      </>,
    );
    screen.getByRole('tab', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}{Home}');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Préc' }));
    await userEvent.click(screen.getByRole('button', { name: 'Octobre' }));
    expect(onPrev).toHaveBeenCalled();
    expect(onLabel).toHaveBeenCalled();
  });
});

describe('Dialog', () => {
  it('opens modally, closes with the close button and reports user closes only', async () => {
    const onClose = vi.fn();
    function D(): React.ReactNode {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            parent-close
          </button>
          <Dialog
            open={open}
            onClose={onClose}
            title="Titre"
            description="Desc"
            closeLabel="Fermer"
            footer={<span>pied</span>}
            size="sm"
          >
            corps
          </Dialog>
        </>
      );
    }
    const { unmount } = render(<D />);
    expect(screen.getByText('corps')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('scroll-locked');
    fireEvent.click(screen.getByText('parent-close'));
    await waitFor(() => expect(screen.queryByText('corps')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    unmount();

    render(
      <Dialog open onClose={onClose} title="T2" closeLabel="Fermer">
        x
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can be non-dismissible', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Bloqué"
        closeLabel="Fermer"
        dismissible={false}
        role="alertdialog"
      >
        x
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument();
    const dialog = document.querySelector('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    fireEvent.click(dialog);
  });
});

describe('Menu', () => {
  it('opens with the keyboard, moves with arrows and selects', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <Menu
        items={[
          { id: 'e', label: 'Modifier', onSelect: onEdit },
          { id: 'd', label: 'Supprimer', danger: true, onSelect: onDelete },
        ]}
        trigger={(props) => (
          <button type="button" {...props}>
            Actions
          </button>
        )}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toHaveFocus();
    await userEvent.keyboard('{End}{ArrowUp}{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(onDelete).toHaveBeenCalled();
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{Tab}');
    await userEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Combobox', () => {
  it('filters, navigates and picks an option', async () => {
    const onPick = vi.fn();
    function C(): React.ReactNode {
      const [v, setV] = useState('');
      return (
        <Combobox
          aria-label="Libellé"
          value={v}
          onValueChange={setV}
          listLabel="Suggestions"
          options={
            v
              ? [
                  { id: 'a', label: 'Café' },
                  { id: 'b', label: 'Carte' },
                ]
              : []
          }
          onPick={(o) => {
            onPick(o.label);
            setV(o.label);
          }}
        />
      );
    }
    render(<C />);
    const input = screen.getByRole('combobox', { name: 'Libellé' });
    await userEvent.type(input, 'ca');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(onPick).toHaveBeenCalledWith('Café');
    await userEvent.type(input, 'x');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.type(input, 'y');
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Carte' }));
    expect(onPick).toHaveBeenLastCalledWith('Carte');
  });
});

describe('Toaster', () => {
  it('announces toasts, runs the action, pauses on hover and expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onUndo = vi.fn();
    render(<Toaster closeLabel="Fermer" regionLabel="Notifications" />);
    act(() => {
      toast('Enregistré', { tone: 'success', action: { label: 'Annuler', onAction: onUndo } });
      toast('Info');
      toast('Attention', { tone: 'warning' });
      toast('Erreur', { tone: 'error', duration: 1000 });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Erreur');
    expect(useToasts.getState().toasts).toHaveLength(3);
    fireEvent.pointerEnter(screen.getByText('Attention'));
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByText('Attention')).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByText('Attention'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0]!);
    act(() => {
      vi.advanceTimersByTime(11000);
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
    act(() => {
      toast('Supprimé', { action: { label: 'Annuler', onAction: onUndo } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onUndo).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
