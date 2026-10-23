import { describe, expect, it } from 'vitest';
import { category } from '@/test/factories';
import {
  buildCategoryTree,
  categoriesOfKind,
  findCategoryByName,
  flattenTree,
  indexById,
  rootCategoryId,
  sortCategories,
  wouldCreateCycle,
} from './categories';

const food = category({ name: 'Alimentation', order: 1 });
const coffee = category({ name: 'Café', parentId: food.id, order: 0 });
const housing = category({ name: 'Logement', order: 0 });
const income = category({ name: 'Revenu', kind: 'income', order: 2 });
const orphan = category({
  name: 'Orpheline',
  parentId: '0190a0a0-0000-7000-8000-000000000000',
  order: 3,
});
const all = [food, coffee, housing, income, orphan];

describe('category tree', () => {
  it('builds and flattens the tree, attaching orphans to the root', () => {
    const flat = flattenTree(buildCategoryTree(all));
    expect(flat.map((n) => [n.category.name, n.depth])).toEqual([
      ['Logement', 0],
      ['Alimentation', 0],
      ['Café', 1],
      ['Revenu', 0],
      ['Orpheline', 0],
    ]);
    expect(sortCategories([income, housing])[0]?.name).toBe('Logement');
  });

  it('finds roots, detects cycles and filters by kind', () => {
    const byId = indexById(all);
    expect(rootCategoryId(coffee.id, byId)).toBe(food.id);
    expect(rootCategoryId('unknown', byId)).toBe('unknown');
    expect(wouldCreateCycle(food.id, coffee.id, all)).toBe(true);
    expect(wouldCreateCycle(food.id, food.id, all)).toBe(true);
    expect(wouldCreateCycle(coffee.id, housing.id, all)).toBe(false);
    expect(wouldCreateCycle(coffee.id, null, all)).toBe(false);
    expect(categoriesOfKind(all, 'income').map((c) => c.name)).toEqual(['Revenu']);
    expect(findCategoryByName(all, 'cafe')?.id).toBe(coffee.id);
  });
});
