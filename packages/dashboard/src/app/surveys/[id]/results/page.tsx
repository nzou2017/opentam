'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getSurvey, getSurveyStats, getSurveyResponses, getLicenseInfo } from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import type { SurveyDefinition, SurveyQuestion, SurveyResponse } from '@opentam/shared';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const AMBER_COLORS = ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'];

export default function SurveyResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const token = typeof window !== 'undefined' ? localStorage.getItem('q_token') : null;
  const [licensed, setLicensed] = useState<boolean | null>(null);

  const [survey, setSurvey] = useState<SurveyDefinition | null>(null);
  const [stats, setStats] = useState<{
    totalResponses: number;
    questionStats: Record<string, { average?: number; distribution?: Record<string, number> }>;
  } | null>(null);
  const [textResponses, setTextResponses] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [textPage, setTextPage] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token) return;
    getLicenseInfo(token).then((info) => {
      setLicensed(info.licensed && info.features.includes('surveys'));
    }).catch(() => setLicensed(false));
    Promise.all([
      getSurvey(token, id),
      getSurveyStats(token, id),
      getSurveyResponses(token, id),
    ])
      .then(([surveyData, statsData, responsesData]) => {
        setSurvey(surveyData.survey);
        setStats(statsData);

        // Extract text responses for text-type questions
        const textMap: Record<string, string[]> = {};
        for (const q of surveyData.survey.questions) {
          if (q.type === 'text') {
            textMap[q.id] = responsesData.responses
              .map(r => r.answers[q.id])
              .filter((v): v is string => typeof v === 'string' && v.length > 0);
          }
        }
        setTextResponses(textMap);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (licensed === false) {
    return <UpgradePrompt feature="Surveys" description="View survey results with the Enterprise plan." />;
  }

  if (loading) return <div className="p-8 text-gray-400 dark:text-gray-500">Loading...</div>;
  if (!survey || !stats) return <div className="p-8 text-gray-400">Survey not found.</div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{survey.name} - Results</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {stats.totalResponses} total response{stats.totalResponses !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href={`/surveys/${id}`}
          aria-label="Edit survey"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Edit Survey
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stats overview card */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-4xl font-bold text-amber-500">{stats.totalResponses}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Responses</p>
        </div>
      </div>

      {/* Per-question stats */}
      <div className="space-y-6">
        {survey.questions.map((q, idx) => (
          <QuestionStats
            key={q.id}
            question={q}
            index={idx}
            stats={stats.questionStats[q.id]}
            textResponses={textResponses[q.id] ?? []}
            textPage={textPage[q.id] ?? 0}
            onTextPageChange={(page) => setTextPage(prev => ({ ...prev, [q.id]: page }))}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionStats({
  question,
  index,
  stats,
  textResponses,
  textPage,
  onTextPageChange,
}: {
  question: SurveyQuestion;
  index: number;
  stats?: { average?: number; distribution?: Record<string, number> };
  textResponses: string[];
  textPage: number;
  onTextPageChange: (page: number) => void;
}) {
  const PAGE_SIZE = 10;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4">
        <span className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
          Question {index + 1} ({question.type.replace('_', ' ')})
        </span>
        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1">{question.text}</h3>
      </div>

      {question.type === 'rating' && stats && (
        <div>
          {/* Average display */}
          {stats.average !== undefined && (
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-500">{stats.average.toFixed(1)}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                / {question.max ?? 5} average
              </span>
            </div>
          )}

          {/* Distribution chart */}
          {stats.distribution && Object.keys(stats.distribution).length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Array.from({ length: question.max ?? 5 }, (_, i) => ({
                    name: String(i + 1),
                    count: stats.distribution?.[String(i + 1)] ?? 0,
                  }))}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {Array.from({ length: question.max ?? 5 }, (_, i) => (
                      <Cell key={i} fill={AMBER_COLORS[i % AMBER_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {(question.type === 'single_choice' || question.type === 'multi_choice') && stats?.distribution && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={Object.entries(stats.distribution).map(([name, count]) => ({ name, count }))}
              layout="vertical"
            >
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {Object.keys(stats.distribution).map((_, i) => (
                  <Cell key={i} fill={AMBER_COLORS[i % AMBER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {question.type === 'text' && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {textResponses.length} text response{textResponses.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {textResponses
              .slice(textPage * PAGE_SIZE, (textPage + 1) * PAGE_SIZE)
              .map((text, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {text}
                </div>
              ))}
          </div>
          {textResponses.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                onClick={() => onTextPageChange(Math.max(0, textPage - 1))}
                disabled={textPage === 0}
                aria-label="Previous page"
                className="text-amber-600 hover:text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-amber-400"
              >
                Previous
              </button>
              <span className="text-gray-500 dark:text-gray-400">
                Page {textPage + 1} of {Math.ceil(textResponses.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => onTextPageChange(Math.min(Math.ceil(textResponses.length / PAGE_SIZE) - 1, textPage + 1))}
                disabled={textPage >= Math.ceil(textResponses.length / PAGE_SIZE) - 1}
                aria-label="Next page"
                className="text-amber-600 hover:text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-amber-400"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {!stats && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No data yet.</p>
      )}
    </div>
  );
}
