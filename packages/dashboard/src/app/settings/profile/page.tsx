'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useState, useEffect } from 'react';
import { apiGetMe, apiUpdateProfile, apiChangePassword } from '@/lib/api';

const EMOJI_CHOICES = ['😀', '🚀', '💻', '🎨', '🔧', '⚡', '🌟', '🎯', '🦊', '🐱', '🌈', '🔥'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('q_token');
    if (!token) return;
    apiGetMe(token).then((data) => {
      if (data?.user) {
        setName(data.user.name ?? '');
        setEmail(data.user.email ?? '');
        setAvatar(data.user.avatar ?? null);
        setRole(data.user.role ?? '');
      }
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    const token = localStorage.getItem('q_token');
    if (!token) return;
    try {
      const result = await apiUpdateProfile(token, { name, email, avatar });
      setName(result.user.name);
      setEmail(result.user.email);
      setAvatar(result.user.avatar);
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      setError(err.message ?? 'Failed to update profile');
    }
    setSaving(false);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage('');
    setPwError('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    setChangingPw(true);
    const token = localStorage.getItem('q_token');
    if (!token) return;
    try {
      await apiChangePassword(currentPassword, newPassword, token);
      setPwMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message ?? 'Failed to change password');
    }
    setChangingPw(false);
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Avatar + Profile */}
      <form onSubmit={handleSave} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm space-y-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Profile</h2>

        {/* Avatar section */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Avatar</label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-2xl font-bold text-gray-900 shadow-sm">
              {avatar || getInitials(name || 'U')}
            </div>

            {/* Emoji picker grid */}
            <div className="flex flex-wrap gap-2">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  aria-label={`Select avatar ${emoji}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors ${
                    avatar === emoji
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-600 bg-white dark:bg-gray-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAvatar(null)}
                aria-label="Use initials as avatar"
                className={`flex h-9 items-center justify-center rounded-lg border px-2 text-xs transition-colors ${
                  avatar === null
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                Initials
              </button>
            </div>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            aria-label="Name"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Role (read only) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
          <span className="inline-block rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">
            {role}
          </span>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          aria-label="Save profile"
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Password change */}
      <form onSubmit={handlePasswordChange} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Change Password</h2>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            aria-label="Current password"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            aria-label="New password"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            aria-label="Confirm new password"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {pwError && <p className="text-sm text-red-600 dark:text-red-400">{pwError}</p>}
        {pwMessage && <p className="text-sm text-green-600 dark:text-green-400">{pwMessage}</p>}

        <button
          type="submit"
          disabled={changingPw}
          aria-label="Change password"
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-amber-400 disabled:opacity-50"
        >
          {changingPw ? 'Changing...' : 'Change Password'}
        </button>
      </form>

      {/* 2FA link */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Two-Factor Authentication</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Manage your two-factor authentication settings for added account security.
        </p>
        <a
          href="/settings/security"
          className="mt-3 inline-block text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
        >
          Go to Security Settings &rarr;
        </a>
      </div>
    </div>
  );
}
