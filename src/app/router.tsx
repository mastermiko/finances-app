import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { validateOperationsSearch } from '@/features/operations/search';
import {
  compact,
  optCoercedString,
  optEnum,
  optPeriod,
  optString,
  type RawSearch,
} from '@/features/shared/search-params';
import { NotFound } from './NotFound';
import { Layout } from './Layout';

const ANALYTICS_TABS = ['evolution', 'compare', 'flows', 'year', 'labels', 'tags'] as const;

interface MonthSearch {
  m?: string | undefined;
}
interface DashboardSearch extends MonthSearch {
  /** ?new=1 (manifest shortcut) opens the entry sheet. */
  new?: number | boolean | undefined;
}
interface AnalyticsSearch extends MonthSearch {
  tab?: (typeof ANALYTICS_TABS)[number] | undefined;
  tag?: string | undefined;
  year?: string | undefined;
}

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound });

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: RawSearch): DashboardSearch =>
    compact({
      m: optPeriod(s.m),
      new: typeof s.new === 'number' || typeof s.new === 'boolean' ? s.new : undefined,
    }),
  component: DashboardPage,
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/operations',
  validateSearch: validateOperationsSearch,
  component: lazyRouteComponent(
    () => import('@/features/operations/OperationsPage'),
    'OperationsPage',
  ),
});

const budgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/budget',
  validateSearch: (s: RawSearch): MonthSearch => compact({ m: optPeriod(s.m) }),
  component: lazyRouteComponent(() => import('@/features/budget/BudgetPage'), 'BudgetPage'),
});

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  validateSearch: (s: RawSearch): AnalyticsSearch =>
    compact({
      tab: optEnum(s.tab, ANALYTICS_TABS),
      m: optPeriod(s.m),
      tag: optString(s.tag, 64),
      year: optCoercedString(s.year, 4),
    }),
  component: lazyRouteComponent(
    () => import('@/features/analytics/AnalyticsPage'),
    'AnalyticsPage',
  ),
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: lazyRouteComponent(() => import('@/features/io/ImportPage'), 'ImportPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(
    () => import('@/features/settings/SettingsPage'),
    'SettingsIndexPage',
  ),
});

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/$section',
  component: lazyRouteComponent(
    () => import('@/features/settings/SettingsPage'),
    'SettingsSectionPage',
  ),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  operationsRoute,
  budgetRoute,
  analyticsRoute,
  importRoute,
  settingsRoute,
  settingsSectionRoute,
]);

export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({
    routeTree,
    history,
    scrollRestoration: true,
    defaultPreload: 'intent',
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
