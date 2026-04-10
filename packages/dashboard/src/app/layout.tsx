// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { QScript } from './QScript';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SidebarNav, navSections } from '@/components/SidebarNav';
import { SidebarProvider } from '@/components/SidebarContext';
import { UserMenu } from '@/components/UserMenu';
import { SidebarShell } from '@/components/SidebarShell';
import type { Feature } from '@opentam/shared';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenTAM Dashboard',
  description: 'OpenTAM admin dashboard',
};

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/change-password'];

async function fetchLicensedFeatures(): Promise<Feature[] | undefined> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.Q_BACKEND_URL ?? 'http://localhost:3001';
    const secretKey = process.env.NEXT_PUBLIC_SECRET_KEY ?? process.env.Q_SECRET_KEY ?? '';
    if (!secretKey) return undefined;
    const res = await fetch(`${backendUrl}/api/v1/tenant/license`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { licensed: boolean; features: Feature[] };
    return data.licensed ? data.features : [];
  } catch {
    return undefined;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('q_theme')?.value as 'light' | 'dark' | 'system' | undefined;
  const initialTheme = themeCookie ?? 'system';
  const htmlClass = initialTheme === 'dark' ? 'dark' : '';

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));

  const licensedFeatures = isAuthPage ? undefined : await fetchLicensedFeatures();

  return (
    <html lang="en" className={htmlClass}>
      <body className={`${isAuthPage ? '' : 'flex h-screen '}bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased`}>
        <ThemeProvider initialTheme={initialTheme}>
          {isAuthPage ? (
            children
          ) : (
            <SidebarProvider>
              {/* Sidebar */}
              <SidebarShell>
                <SidebarNav sections={navSections} licensedFeatures={licensedFeatures} />
                <UserMenu />
              </SidebarShell>

              {/* Main content */}
              <main className="flex flex-1 flex-col overflow-y-auto">
                {children}
              </main>

              <QScript />
            </SidebarProvider>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
