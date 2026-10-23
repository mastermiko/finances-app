import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  DatabaseBackup,
  FileDown,
  Goal,
  HardDrive,
  Info,
  Landmark,
  Layers,
  ListFilter,
  Repeat,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  SpellCheck,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { T, useT, type MessageId } from '@/i18n';
import { Skeleton } from '@/ui';
import { PageHeader } from '@/app/Layout';
import { useMediaQuery, WIDE_QUERY } from '../shared/hooks';
import styles from './SettingsPage.module.css';

export const SECTIONS = [
  'general',
  'categories',
  'accounts',
  'tags',
  'rules',
  'labels',
  'recurrences',
  'goals',
  'data',
  'backups',
  'trash',
  'storage',
  'privacy',
  'help',
  'about',
  'danger',
] as const;
export type SectionId = (typeof SECTIONS)[number];

const META: Record<SectionId, { icon: LucideIcon; title: MessageId; description: MessageId }> = {
  general: {
    icon: SlidersHorizontal,
    title: 'settings.general',
    description: 'settings.general.description',
  },
  categories: {
    icon: Layers,
    title: 'settings.categories',
    description: 'settings.categories.description',
  },
  accounts: {
    icon: Landmark,
    title: 'settings.accounts',
    description: 'settings.accounts.description',
  },
  tags: { icon: Tags, title: 'settings.tags', description: 'settings.tags.description' },
  rules: { icon: ListFilter, title: 'settings.rules', description: 'settings.rules.description' },
  labels: {
    icon: SpellCheck,
    title: 'settings.labels',
    description: 'settings.labels.description',
  },
  recurrences: {
    icon: Repeat,
    title: 'settings.recurrences',
    description: 'settings.recurrences.description',
  },
  goals: { icon: Goal, title: 'settings.goals', description: 'settings.goals.description' },
  data: { icon: FileDown, title: 'settings.data', description: 'settings.data.description' },
  backups: {
    icon: DatabaseBackup,
    title: 'settings.backups',
    description: 'settings.backups.description',
  },
  trash: { icon: Archive, title: 'settings.trash', description: 'settings.trash.description' },
  storage: {
    icon: HardDrive,
    title: 'settings.storage',
    description: 'settings.storage.description',
  },
  privacy: {
    icon: ShieldCheck,
    title: 'settings.privacy',
    description: 'settings.privacy.description',
  },
  help: { icon: BookOpen, title: 'settings.help', description: 'settings.help.description' },
  about: { icon: Info, title: 'settings.about', description: 'settings.about.description' },
  danger: {
    icon: ShieldAlert,
    title: 'settings.danger',
    description: 'settings.danger.description',
  },
};

const lazySection = (loader: () => Promise<{ default: ComponentType }>): ComponentType =>
  lazy(loader);

const COMPONENTS: Record<SectionId, ComponentType> = {
  general: lazySection(() => import('./GeneralSettings')),
  categories: lazySection(() => import('./CategoriesSettings')),
  accounts: lazySection(() => import('./AccountsSettings')),
  tags: lazySection(() => import('./TagsSettings')),
  rules: lazySection(() => import('./RulesSettings')),
  labels: lazySection(() => import('./LabelsSettings')),
  recurrences: lazySection(() => import('./RecurrencesSettings')),
  goals: lazySection(() => import('./GoalsSettings')),
  data: lazySection(() => import('./DataSettings')),
  backups: lazySection(() => import('./BackupsSettings')),
  trash: lazySection(() => import('./TrashSettings')),
  storage: lazySection(() => import('./StorageSettings')),
  privacy: lazySection(() => import('./PrivacySettings')),
  help: lazySection(() => import('./HelpGuide')),
  about: lazySection(() => import('./AboutSettings')),
  danger: lazySection(() => import('./DangerSettings')),
};

export function isSection(value: string): value is SectionId {
  return (SECTIONS as readonly string[]).includes(value);
}

export function SettingsIndexPage(): ReactNode {
  const wide = useMediaQuery(WIDE_QUERY);
  return wide ? <SettingsLayout section="general" /> : <SettingsLayout section={null} />;
}

export function SettingsSectionPage(): ReactNode {
  const { section } = useParams({ from: '/settings/$section' });
  return <SettingsLayout section={isSection(section) ? section : 'general'} />;
}

function SettingsLayout({ section }: { section: SectionId | null }): ReactNode {
  const t = useT();
  const wide = useMediaQuery(WIDE_QUERY);
  const showList = wide || section === null;
  const Component = section ? COMPONENTS[section] : null;
  return (
    <div className={wide ? styles.split : undefined}>
      {showList ? (
        <nav aria-label={t('settings.title')} className={styles.nav}>
          {!section || wide ? <PageHeader title={<T id="settings.title" />} /> : null}
          <ul className={styles.list} role="list">
            {SECTIONS.map((id) => {
              const { icon: Icon, title, description } = META[id];
              return (
                <li key={id}>
                  <Link
                    to="/settings/$section"
                    params={{ section: id }}
                    className={[styles.item, id === 'danger' ? styles.danger : ''].join(' ')}
                    aria-current={id === section ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    <span>
                      <span className={styles.itemTitle}>
                        <T id={title} />
                      </span>
                      {!wide ? (
                        <span className={styles.itemDescription}>
                          <T id={description} />
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {section && Component ? (
        <div className={styles.content}>
          {!wide ? (
            <Link to="/settings" className={styles.back}>
              <ArrowLeft aria-hidden="true" />
              <T id="settings.back" />
            </Link>
          ) : null}
          <PageHeader title={<T id={META[section].title} />} />
          <Suspense fallback={<Skeleton height={200} />}>
            <Component />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
