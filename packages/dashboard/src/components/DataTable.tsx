'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useMemo, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
  /** Extra rows rendered inside <tbody> after the data rows (e.g. inline edit forms) */
  extraRows?: React.ReactNode;
  /** Override how a specific row renders (return null to use default) */
  renderRow?: (row: T) => React.ReactNode | null;
}

type SortDir = 'asc' | 'desc';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCellValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function matchesSearch<T>(row: T, columns: Column<T>[], query: string): boolean {
  const q = query.toLowerCase();
  return columns.some((col) => {
    const v = getCellValue(row, col.key);
    if (v == null) return false;
    return String(v).toLowerCase().includes(q);
  });
}

// ── Search icon SVG ──────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  pageSize: defaultPageSize = 20,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data.',
  rowKey,
  onRowClick,
  actions,
  extraRows,
  renderRow,
}: DataTableProps<T>) {
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // All columns including actions pseudo-column
  const allColumns = useMemo(() => {
    if (!actions) return columns;
    return [
      ...columns,
      { key: '__actions__', header: 'Actions', sortable: false, filterable: false } as Column<T>,
    ];
  }, [columns, actions]);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
      setPage(0);
    },
    [sortKey],
  );

  const setColumnFilter = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }, []);

  // Pipeline: global search -> column filters -> sort -> paginate
  const processed = useMemo(() => {
    let result = [...data];

    // 1. Global search
    if (globalSearch.trim()) {
      result = result.filter((row) => matchesSearch(row, columns, globalSearch));
    }

    // 2. Per-column filters
    for (const col of columns) {
      const filterVal = columnFilters[col.key];
      if (filterVal && filterVal.trim()) {
        const q = filterVal.toLowerCase();
        result = result.filter((row) => {
          const v = getCellValue(row, col.key);
          if (v == null) return false;
          return String(v).toLowerCase().includes(q);
        });
      }
    }

    // 3. Sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = getCellValue(a, sortKey);
        const bVal = getCellValue(b, sortKey);
        const aStr = aVal == null ? '' : String(aVal);
        const bStr = bVal == null ? '' : String(bVal);
        const cmp = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [data, globalSearch, columnFilters, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = processed.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const hasFilterableColumns = columns.some((c) => c.filterable);

  return (
    <div>
      {/* Global search */}
      {searchable && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label="Search"
              className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              {/* Header row */}
              <tr>
                {allColumns.map((col) => {
                  const isSortable = col.sortable !== false && col.key !== '__actions__';
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
                        isSortable ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200' : ''
                      } ${col.className ?? ''}`}
                      onClick={isSortable ? () => handleSort(col.key) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {isSortable && isSorted && (
                          <span aria-hidden="true">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>

              {/* Per-column filter row */}
              {hasFilterableColumns && (
                <tr>
                  {allColumns.map((col) => (
                    <th key={`filter-${col.key}`} className="px-4 pb-2">
                      {col.filterable ? (
                        <input
                          type="text"
                          value={columnFilters[col.key] ?? ''}
                          onChange={(e) => setColumnFilter(col.key, e.target.value)}
                          placeholder={col.header}
                          aria-label={`Filter by ${col.header}`}
                          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {pageData.length === 0 && !extraRows ? (
                <tr>
                  <td
                    colSpan={allColumns.length}
                    className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageData.map((row) => {
                  // Allow custom row rendering (e.g. inline edit mode)
                  if (renderRow) {
                    const custom = renderRow(row);
                    if (custom !== null) return custom;
                  }

                  return (
                    <tr
                      key={rowKey(row)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        onRowClick ? 'cursor-pointer' : ''
                      }`}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                          {col.render ? col.render(row) : String(getCellValue(row, col.key) ?? '')}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-4 py-3">{actions(row)}</td>
                      )}
                    </tr>
                  );
                })
              )}
              {extraRows}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex flex-wrap items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              aria-label="Select page size"
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="ml-2 text-gray-500 dark:text-gray-400">
              {processed.length} result{processed.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="rounded px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Previous
            </button>
            <span className="text-gray-600 dark:text-gray-400">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="Next page"
              className="rounded px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
