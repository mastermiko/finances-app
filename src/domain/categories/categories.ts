import type { Category, CategoryKind } from '../model/types';

export interface CategoryNode {
  readonly category: Category;
  readonly children: CategoryNode[];
  readonly depth: number;
}

export function sortCategories(categories: readonly Category[]): Category[] {
  return [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Builds the category tree (orphans are attached to the root). */
export function buildCategoryTree(categories: readonly Category[]): CategoryNode[] {
  const byParent = new Map<string | null, Category[]>();
  const ids = new Set(categories.map((c) => c.id));
  for (const c of sortCategories(categories)) {
    const parent = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null;
    const list = byParent.get(parent);
    if (list) list.push(c);
    else byParent.set(parent, [c]);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): CategoryNode[] =>
    (byParent.get(parent) ?? [])
      .filter((c) => !seen.has(c.id))
      .map((c) => {
        const next = new Set(seen).add(c.id);
        return { category: c, depth, children: build(c.id, depth + 1, next) };
      });
  return build(null, 0, new Set());
}

/** Depth-first flattening of the tree, useful for selects. */
export function flattenTree(nodes: readonly CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = [];
  const walk = (list: readonly CategoryNode[]): void => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Root ancestor id of a category (itself when top-level). Cycle-safe. */
export function rootCategoryId(id: string, byId: ReadonlyMap<string, Category>): string {
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current !== undefined && current.parentId !== null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? id;
}

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** True if `candidateParentId` is `id` itself or one of its descendants (would create a cycle). */
export function wouldCreateCycle(
  id: string,
  candidateParentId: string | null,
  categories: readonly Category[],
): boolean {
  if (candidateParentId === null) return false;
  if (candidateParentId === id) return true;
  const byId = indexById(categories);
  let current = byId.get(candidateParentId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === id) return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

export function categoriesOfKind(
  categories: readonly Category[],
  kind: CategoryKind,
  includeArchived = false,
): Category[] {
  return sortCategories(
    categories.filter((c) => c.kind === kind && (includeArchived || !c.archived)),
  );
}

/** Finds a category by name, case- and accent-insensitive. */
export function findCategoryByName(
  categories: readonly Category[],
  name: string,
): Category | undefined {
  const norm = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('fr')
      .trim();
  const target = norm(name);
  return categories.find((c) => norm(c.name) === target);
}
