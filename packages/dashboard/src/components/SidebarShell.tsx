'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useSidebar } from './SidebarContext';

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar();

  return (
    <div className="relative flex-shrink-0">
      <aside className={`flex h-full flex-col bg-gray-900 text-white shadow-lg transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
        {/* Header */}
        <div className={`flex items-center border-b border-gray-700 ${collapsed ? 'justify-center px-2 py-6' : 'gap-3 px-5 py-6'}`}>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 font-bold text-gray-900 text-lg shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]"
            aria-label="OpenTAM logo"
          >
            Q
          </div>
          {!collapsed && <span className="text-lg font-semibold tracking-tight">OpenTAM</span>}
        </div>

        {/* Nav + UserMenu passed as children */}
        {children}
      </aside>

      {/* Collapse toggle — pinned to the right edge */}
      <button
        onClick={toggle}
        className="absolute top-1/3 -right-3 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-gray-400 shadow-md hover:bg-gray-700 hover:text-white transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true">
          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
