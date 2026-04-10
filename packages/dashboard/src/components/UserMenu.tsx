'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSidebar } from '@/components/SidebarContext';

interface UserInfo {
  name: string;
  email: string;
  avatar?: string | null;
  role: string;
}

export function UserMenu() {
  const router = useRouter();
  const { collapsed } = useSidebar();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then(data => { if (data?.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/clear-token', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  if (!user) return null;

  const initials = user.avatar ?? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div ref={menuRef} className="relative shrink-0 px-3 py-3 border-t border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
        aria-label="User menu"
        title={collapsed ? user.name : undefined}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600 text-xs font-semibold text-white">
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-gray-200">{user.name}</p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
        )}
      </button>

      {open && (
        <div className={`absolute bottom-full mb-1 rounded-md border border-gray-600 bg-gray-800 py-1 shadow-lg ${collapsed ? 'left-full ml-1 bottom-0 w-52' : 'left-3 right-3'}`}>
          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            Profile
          </Link>
          <Link
            href="/settings/security"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            Security
          </Link>
          <div className="px-4 py-2">
            <ThemeToggle />
          </div>
          <hr className="my-1 border-gray-700" />
          <button
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 hover:text-red-300"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
