import type { Meta, StoryObj } from '@storybook/react-vite';
import { CATEGORY_ICONS, CATEGORY_PALETTE } from '@/domain/model';
import { CategoryIcon, ColorSwatch } from '../icons/category-icons';

const meta = {
  title: 'Fondations/Catégories',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Palette catégorielle à 8 teintes, validée en clair et en sombre (contraste et daltonismes). */
export const Palette: Story = {
  render: () => (
    <ul
      role="list"
      style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0, flexWrap: 'wrap' }}
    >
      {CATEGORY_PALETTE.map((c) => (
        <li key={c.light} style={{ display: 'grid', justifyItems: 'center', gap: 4, fontSize: 12 }}>
          <ColorSwatch color={c.light} />
          <code>{c.light}</code>
        </li>
      ))}
    </ul>
  ),
};

export const Icones: Story = {
  render: () => (
    <ul
      role="list"
      style={{ display: 'flex', gap: 12, listStyle: 'none', padding: 0, flexWrap: 'wrap' }}
    >
      {CATEGORY_ICONS.map((icon, i) => (
        <li key={icon} title={icon}>
          <CategoryIcon
            icon={icon}
            color={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]?.light ?? '#2a78d6'}
          />
        </li>
      ))}
    </ul>
  ),
};
