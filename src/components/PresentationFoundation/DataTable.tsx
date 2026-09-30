import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Applied to both header and body cells (widths, responsive hiding). */
  className?: string;
  /** Applied only to body cells. */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  /** Optional footer/totals row: cell content per column key. */
  footer?: Partial<Record<string, ReactNode>>;
  emptyState?: ReactNode;
  stickyHeader?: boolean;
  /** Min table width before horizontal scrolling kicks in. */
  minWidth?: number | string;
  rowClassName?: (row: T, index: number) => string | undefined;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Accessible name for the scroll region (lets keyboard users scroll wide tables). */
  label?: string;
  /** Removes the outer border/shadow when the table sits inside a Card. */
  bare?: boolean;
  dense?: boolean;
}

const alignClass = { left: 'text-left', right: 'text-right tabular-nums', center: 'text-center' };

/** Standard data table: uppercase header, zebra hover, optional totals row. */
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  footer,
  emptyState,
  stickyHeader = false,
  minWidth = 720,
  rowClassName,
  onRowClick,
  className,
  bare = false,
  dense = false,
  label,
}: DataTableProps<T>) {
  const cellPadding = dense ? 'px-3 py-2.5' : 'px-4 py-3';

  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      className={cn(
        'max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        !bare && 'rounded-xl border border-gray-200 bg-white shadow-sm',
        stickyHeader ? 'max-h-[calc(100dvh-12rem)] overflow-auto' : 'overflow-x-auto',
        className,
      )}
    >
      <table className="w-full text-sm" style={{ minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth }}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  cellPadding,
                  'text-xs font-semibold uppercase tracking-wide text-gray-500',
                  alignClass[column.align ?? 'left'],
                  stickyHeader && 'sticky top-0 z-20 border-b border-gray-100 bg-gray-50',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {data.length === 0 && emptyState ? (
            <tr>
              <td colSpan={columns.length} className="p-0">{emptyState}</td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn('transition-colors hover:bg-gray-50', onRowClick && 'cursor-pointer focus-visible:bg-primary-50 focus-visible:outline-none', rowClassName?.(row, index))}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(cellPadding, 'text-gray-700', alignClass[column.align ?? 'left'], column.className, column.cellClassName)}
                  >
                    {column.render
                      ? column.render(row, index)
                      : String((row as Record<string, unknown>)[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && data.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
              {columns.map((column) => (
                <td key={column.key} className={cn(cellPadding, alignClass[column.align ?? 'left'], column.className)}>
                  {footer[column.key] ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
