'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { backendConfig } from '@/lib/config';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { getLicenseInfo } from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function TeamSettingsPage() {
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState('');

  function loadUsers() {
    fetch(`${backendConfig.backendUrl}/api/v1/tenant/users`, {
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    })
      .then(r => r.json())
      .then((data: { users?: TeamUser[] }) => setUsers(data.users ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    const token = localStorage.getItem('q_token') ?? backendConfig.secretKey;
    if (token) {
      getLicenseInfo(token).then((info) => {
        setLicensed(info.licensed && info.features.includes('team'));
      }).catch(() => setLicensed(false));
    }
    loadUsers();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setMessage('');
    try {
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/auth/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendConfig.secretKey}`,
        },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json() as { tempPassword: string };
        setMessage(`User invited. Temp password: ${data.tempPassword}`);
        setInviteEmail('');
        setInviteName('');
        loadUsers();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setMessage(body.error ?? 'Failed to invite');
      }
    } catch { setMessage('Failed to invite'); }
    setInviting(false);
  }

  const [resetMsg, setResetMsg] = useState('');

  async function handleRemove(id: string) {
    if (!confirm('Remove this user?')) return;
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${backendConfig.secretKey}` },
    });
    loadUsers();
  }

  async function handleResetPassword(id: string) {
    if (!confirm('Reset this user\'s password? They will need to set a new one on next login.')) return;
    setResetMsg('');
    try {
      const token = localStorage.getItem('q_token') ?? backendConfig.secretKey;
      const res = await fetch(`${backendConfig.backendUrl}/api/v1/tenant/users/${id}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { tempPassword: string };
        setResetMsg(`Temp password for user: ${data.tempPassword}`);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setResetMsg(body.error ?? 'Failed to reset password');
      }
    } catch {
      setResetMsg('Failed to reset password');
    }
  }

  async function handleChangeRole(id: string, role: string) {
    await fetch(`${backendConfig.backendUrl}/api/v1/tenant/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendConfig.secretKey}`,
      },
      body: JSON.stringify({ role }),
    });
    loadUsers();
  }

  const columns: Column<TeamUser>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      filterable: true,
      render: (u) => <span className="font-medium text-gray-900 dark:text-gray-100">{u.name}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      filterable: true,
      render: (u) => <span className="text-gray-600 dark:text-gray-400">{u.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      filterable: true,
      render: (u) => (
        <select
          value={u.role}
          onChange={e => handleChangeRole(u.id, e.target.value)}
          disabled={u.role === 'owner'}
          aria-label="Select role"
          className="rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      ),
    },
  ];

  if (licensed === false) {
    return <UpgradePrompt feature="Team Management" description="Manage team members and roles with the Enterprise plan." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Invite form */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="mb-4 text-base font-medium text-gray-800 dark:text-gray-200">Invite User</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input type="text" required value={inviteName} onChange={e => setInviteName(e.target.value)}
              aria-label="Invite name" className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              aria-label="Invite email" className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'admin' | 'viewer')}
              aria-label="Select invite role" className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm">
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviting}
            aria-label="Invite user" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50">
            {inviting ? '...' : 'Invite'}
          </button>
        </form>
        {message && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>}
      </div>

      {resetMsg && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 shadow-sm">
          <p className="text-sm text-amber-800 dark:text-amber-200 font-mono break-all">{resetMsg}</p>
          <button onClick={() => setResetMsg('')} aria-label="Dismiss" className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Users list */}
      <DataTable
        columns={columns}
        data={users}
        rowKey={(u) => u.id}
        searchable
        searchPlaceholder="Search team members..."
        emptyMessage="No team members."
        pageSize={10}
        actions={(u) => (
          <div className="flex items-center justify-end gap-2">
            {u.role !== 'owner' && (
              <button onClick={() => handleResetPassword(u.id)}
                aria-label="Reset password" className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300">Reset Password</button>
            )}
            {u.role !== 'owner' && (
              <button onClick={() => handleRemove(u.id)}
                aria-label="Remove user" className="text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
          </div>
        )}
      />
    </div>
  );
}
