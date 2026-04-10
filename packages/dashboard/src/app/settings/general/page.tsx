'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { backendConfig } from '@/lib/config';
import { getLicenseInfo, activateLicense } from '@/lib/api';
import type { LicenseInfo } from '@/lib/api';

export default function GeneralSettingsPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [licenseMsg, setLicenseMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('q_token') ?? backendConfig.secretKey;
    fetch(`${backendConfig.backendUrl}/api/v1/tenant`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setTenant(data); setName(data.name ?? ''); })
      .catch(() => {});
    if (token) {
      getLicenseInfo(token).then(setLicenseInfo).catch(() => {});
    }
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) setMessage('Saved');
      else setMessage('Failed to save');
    } catch { setMessage('Failed to save'); }
    setSaving(false);
  }

  async function handleActivateLicense() {
    if (!licenseKey.trim()) return;
    setActivating(true);
    setLicenseMsg('');
    try {
      const token = localStorage.getItem('q_token') ?? backendConfig.secretKey;
      const result = await activateLicense(token, licenseKey.trim());
      setLicenseInfo(result);
      if (result.licensed) {
        setLicenseMsg('License activated successfully!');
        setLicenseKey('');
      } else {
        setLicenseMsg(result.error ?? 'Invalid license key');
      }
    } catch {
      setLicenseMsg('Failed to activate license');
    }
    setActivating(false);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Tenant Info</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-label="Tenant name"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
            <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-300 capitalize">
              {tenant?.plan ?? '...'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Save tenant settings"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {message && <span className="text-sm text-green-600">{message}</span>}
          </div>
        </div>
      </div>

      {/* License */}
      <div id="license" className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">License</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              licenseInfo?.licensed
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {licenseInfo?.licensed ? 'Enterprise' : 'Community'}
            </span>
            {licenseInfo?.licensed && licenseInfo.expiresAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Expires: {new Date(licenseInfo.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {licenseInfo?.licensed && licenseInfo.features.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Licensed Features</label>
              <div className="flex flex-wrap gap-1">
                {licenseInfo.features.map((f) => (
                  <span key={f} className="rounded bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">License Key</label>
            <textarea
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              placeholder="Paste your OpenTAM Enterprise license key here..."
              rows={3}
              aria-label="License key"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm font-mono shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleActivateLicense}
              disabled={activating || !licenseKey.trim()}
              aria-label="Activate license"
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50"
            >
              {activating ? 'Activating...' : 'Activate'}
            </button>
            {licenseMsg && (
              <span className={`text-sm ${licenseMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {licenseMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
