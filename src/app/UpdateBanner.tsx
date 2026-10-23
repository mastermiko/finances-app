import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { T } from '@/i18n';
import { Button } from '@/ui';
import { useUpdate } from './sw';
import styles from './Layout.module.css';

export function UpdateBanner(): ReactNode {
  const { needRefresh, update, dismiss } = useUpdate();
  if (!needRefresh) return null;
  return (
    <div className={styles.banner} role="status">
      <p>
        <T id="update.available" />
      </p>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        <T id="update.later" />
      </Button>
      <Button size="sm" variant="primary" icon={<RefreshCw />} onClick={() => void update?.()}>
        <T id="update.reload" />
      </Button>
    </div>
  );
}
