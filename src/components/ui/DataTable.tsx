import React from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  className?: string;
  stickyHeader?: boolean;
}

export function DataTable<T>({ columns, data, keyExtractor, className, stickyHeader = false }: DataTableProps<T>) {
  return (
    <div
      className={cn(
        'max-w-full rounded-xl border border-gray-100',
        stickyHeader ? 'max-h-[calc(100vh-12rem)] overflow-auto' : 'overflow-x-auto',
        className,
      )}
    >
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide',
                  stickyHeader && 'sticky top-0 z-20 border-b border-gray-100 bg-gray-50',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-50">
          {data.map((row) => (
            <tr key={keyExtractor(row)} className="hover:bg-gray-50 transition-colors">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-3 text-gray-700', col.className)}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
