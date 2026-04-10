'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Feature } from '@opentam/shared';

const settingsLinks: { href: string; label: string; feature?: Feature }[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/general', label: 'General' },
  { href: '/settings/keys', label: 'API Keys' },
  { href: '/settings/team', label: 'Team', feature: 'team' },
  { href: '/settings/model', label: 'Model' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/sso', label: 'SSO', feature: 'sso' },
  { href: '/settings/security', label: 'Security' },
];

export function SettingsNav({ licensedFeatures }: { licensedFeatures?: Feature[] }) {
  const pathname = usePathname();

  const visibleLinks = licensedFeatures
    ? settingsLinks.filter((l) => !l.feature || licensedFeatures.includes(l.feature))
    : settingsLinks;

  return (
    <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-700 pb-3 mb-6">
      {visibleLinks.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            aria-label={`Navigate to ${label}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
