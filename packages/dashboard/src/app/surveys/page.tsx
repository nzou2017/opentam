'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/DataTable';
import { getSurveys, deleteSurvey, updateSurvey, getLicenseInfo } from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import type { SurveyDefinition } from '@opentam/shared';

type SurveyRow = SurveyDefinition & { responseCount?: number };

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [licensed, setLicensed] = useState<boolean | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('q_token') : null;

  async function load() {
    if (!token) return;
    try {
      const licenseInfo = await getLicenseInfo(token);
      if (!licenseInfo.licensed || !licenseInfo.features.includes('surveys')) {
        setLicensed(false);
        setLoading(false);
        return;
      }
      setLicensed(true);
      const data = await getSurveys(token);
      setSurveys(data.surveys);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!token || !confirm('Delete this survey?')) return;
    try {
      await deleteSurvey(token, id);
      setSurveys(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleActive(survey: SurveyRow) {
    if (!token) return;
    try {
      const { survey: updated } = await updateSurvey(token, survey.id, { active: !survey.active });
      setSurveys(prev => prev.map(s => s.id === updated.id ? { ...updated, responseCount: s.responseCount } : s));
    } catch (e: any) {
      setError(e.message);
    }
  }

  const columns: Column<SurveyRow>[] = [
    { key: 'name', header: 'Name', sortable: true, filterable: true },
    {
      key: 'questions',
      header: 'Questions',
      render: (row) => <span>{row.questions.length}</span>,
    },
    {
      key: 'active',
      header: 'Active',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleActive(row); }}
          aria-label={`Toggle ${row.name} active`}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            row.active
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {row.active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'triggerOn',
      header: 'Trigger',
      render: (row) => (
        <span className="text-gray-500 dark:text-gray-400">{row.triggerOn ?? 'None'}</span>
      ),
    },
    {
      key: 'responseCount',
      header: 'Responses',
      sortable: true,
      render: (row) => <span>{row.responseCount ?? 0}</span>,
    },
  ];

  if (licensed === false) {
    return <UpgradePrompt feature="Surveys" description="Create and manage feedback surveys for your users with the Enterprise plan." />;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Surveys</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create and manage feedback surveys for your users
          </p>
        </div>
        <Link
          href="/surveys/new"
          aria-label="Create new survey"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
        >
          New Survey
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          data={surveys}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search surveys..."
          emptyMessage="No surveys yet. Create one to start collecting feedback."
          onRowClick={(row) => { window.location.href = `/surveys/${row.id}`; }}
          actions={(row) => (
            <div className="flex gap-2">
              <Link
                href={`/surveys/${row.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label="Edit survey"
                className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Edit
              </Link>
              <Link
                href={`/surveys/${row.id}/results`}
                onClick={(e) => e.stopPropagation()}
                aria-label="View survey results"
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Results
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                aria-label="Delete survey"
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Delete
              </button>
            </div>
          )}
        />
      )}
    </div>
  );
}
