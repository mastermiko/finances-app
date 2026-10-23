import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { T } from '@/i18n';
import { EmptyState } from '@/ui';

export function NotFound(): ReactNode {
  return (
    <EmptyState
      title={<T id="notFound.title" />}
      actions={
        <Link to="/">
          <T id="notFound.back" />
        </Link>
      }
    >
      <T id="notFound.text" />
    </EmptyState>
  );
}
