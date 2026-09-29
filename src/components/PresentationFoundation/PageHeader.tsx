'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Actions rendered on the right (or full width on phones). */
  action?: ReactNode;
  /** Icon shown in a tinted square before the title. */
  icon?: ReactNode;
  /** Small chip below the description, for a date range or status. */
  meta?: ReactNode;
  /** Renders a back link. Pass an href to link, or `true` to use browser history. */
  back?: string | true;
  backLabel?: string;
  className?: string;
}

/** Page title block. Every page starts with one of these. */
export function PageHeader({ title, description, action, icon, meta, back, backLabel, className }: PageHeaderProps) {
  const router = useRouter();
  const backClassName =
    'mb-3 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

  return (
    <div className={cn('mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {back && (
          back === true ? (
            <button type="button" onClick={() => router.back()} className={backClassName}>
              <ArrowLeft size={16} />
              {backLabel}
            </button>
          ) : (
            <Link href={back} className={backClassName}>
              <ArrowLeft size={16} />
              {backLabel}
            </Link>
          )
        )}
        <div className="flex min-w-0 items-center gap-4">
          {icon && (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 sm:h-14 sm:w-14">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-normal text-gray-950 sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
          </div>
        </div>
        {meta && <div className="mt-3">{meta}</div>}
      </div>
      {action && (
        <div className="flex w-full flex-shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}
