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
  /** Accepted for compatibility; the header no longer draws an icon tile so every page opens the same way. */
  icon?: ReactNode;
  /** Small chip below the description, for a date range or status. */
  meta?: ReactNode;
  /** Renders a back link. Pass an href to link, or `true` to use browser history. */
  back?: string | true;
  backLabel?: string;
  className?: string;
}

/** Page title block. Every page starts with one of these. */
export function PageHeader({ title, description, action, meta, back, backLabel, className }: PageHeaderProps) {
  const router = useRouter();
  const backClassName =
    'mb-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

  return (
    // Wraps instead of squeezing: the title keeps at least ~16rem and the
    // actions drop to their own row when they don't fit beside it.
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 flex-1 basis-64">
        {back && (
          back === true ? (
            <button type="button" onClick={() => router.back()} className={backClassName}>
              <ArrowLeft size={15} />
              {backLabel}
            </button>
          ) : (
            <Link href={back} className={backClassName}>
              <ArrowLeft size={15} />
              {backLabel}
            </Link>
          )
        )}
        <h1 className="break-words text-2xl font-bold tracking-tight text-gray-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        {meta && <div className="mt-3">{meta}</div>}
      </div>
      {action && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}
