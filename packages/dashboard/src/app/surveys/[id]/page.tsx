'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getSurvey, updateSurvey, getLicenseInfo } from '@/lib/api';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import type { SurveyDefinition, SurveyQuestion, SurveyQuestionType } from '@opentam/shared';

function generateId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyQuestion(): SurveyQuestion {
  return { id: generateId(), type: 'rating', text: '', required: false, ratingStyle: 'stars' };
}

export default function EditSurveyPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const token = typeof window !== 'undefined' ? localStorage.getItem('q_token') : null;
  const [licensed, setLicensed] = useState<boolean | null>(null);

  const [survey, setSurvey] = useState<SurveyDefinition | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerOn, setTriggerOn] = useState('');
  const [active, setActive] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getLicenseInfo(token).then((info) => {
      setLicensed(info.licensed && info.features.includes('surveys'));
    }).catch(() => setLicensed(false));
    getSurvey(token, id)
      .then(({ survey: s }) => {
        setSurvey(s);
        setName(s.name);
        setDescription(s.description ?? '');
        setTriggerOn(s.triggerOn ?? '');
        setActive(s.active);
        setQuestions(s.questions);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  function updateQuestion(index: number, patch: Partial<SurveyQuestion>) {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, ...patch } : q));
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  }

  function addQuestion() {
    setQuestions(prev => [...prev, emptyQuestion()]);
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= questions.length) return;
    setQuestions(prev => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  async function handleSave() {
    if (!token || !name.trim() || questions.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const { survey: updated } = await updateSurvey(token, id, {
        name,
        description: description || undefined,
        questions,
        triggerOn: triggerOn || null,
        active,
      });
      setSurvey(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!token) return;
    try {
      const { survey: updated } = await updateSurvey(token, id, { active: !active });
      setActive(updated.active);
      setSurvey(updated);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (licensed === false) {
    return <UpgradePrompt feature="Surveys" description="Edit surveys with the Enterprise plan." />;
  }

  if (loading) return <div className="p-8 text-gray-400 dark:text-gray-500">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Edit Survey</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleActive}
            aria-label="Toggle survey active"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {active ? 'Active' : 'Inactive'}
          </button>
          <Link
            href={`/surveys/${id}/results`}
            aria-label="View survey results"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            View Results
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            aria-label="Description"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Trigger */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger</label>
          <select
            value={triggerOn}
            onChange={(e) => setTriggerOn(e.target.value)}
            aria-label="Select trigger"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">None (manual only)</option>
            <option value="frustration_high">After frustration event</option>
            <option value="intervention_complete">After intervention</option>
          </select>
        </div>

        {/* Questions */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Questions</h2>
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <QuestionEditor
                key={q.id}
                question={q}
                index={idx}
                total={questions.length}
                onChange={(patch) => updateQuestion(idx, patch)}
                onRemove={() => removeQuestion(idx)}
                onMove={(dir) => moveQuestion(idx, dir)}
              />
            ))}
          </div>
          <button
            onClick={addQuestion}
            aria-label="Add question"
            className="mt-4 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600 transition-colors dark:border-gray-600 dark:text-gray-400 dark:hover:border-amber-500 dark:hover:text-amber-400"
          >
            + Add Question
          </button>
        </div>

        {/* Save */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || questions.length === 0}
            aria-label="Save survey"
            className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => router.push('/surveys')}
            aria-label="Back to surveys"
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  question: SurveyQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<SurveyQuestion>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
          Question {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button onClick={() => onMove(-1)} aria-label="Move question up" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">&uarr;</button>
          )}
          {index < total - 1 && (
            <button onClick={() => onMove(1)} aria-label="Move question down" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">&darr;</button>
          )}
          <button onClick={onRemove} aria-label="Remove question" className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 text-sm">Remove</button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select
              value={question.type}
              onChange={(e) => {
                const type = e.target.value as SurveyQuestionType;
                const patch: Partial<SurveyQuestion> = { type };
                if (type === 'single_choice' || type === 'multi_choice') {
                  patch.options = question.options?.length ? question.options : ['Option 1'];
                }
                if (type === 'rating') patch.ratingStyle = question.ratingStyle ?? 'stars';
                onChange(patch);
              }}
              aria-label="Select question type"
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="rating">Rating</option>
              <option value="single_choice">Single Choice</option>
              <option value="multi_choice">Multi Choice</option>
              <option value="text">Text</option>
            </select>
          </div>

          {question.type === 'rating' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Style</label>
              <select
                value={question.ratingStyle ?? 'stars'}
                onChange={(e) => onChange({ ratingStyle: e.target.value as 'stars' | 'emoji' })}
                aria-label="Select rating style"
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="stars">Stars</option>
                <option value="emoji">Emoji</option>
              </select>
            </div>
          )}

          <div className="flex items-end">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={question.required ?? false}
                onChange={(e) => onChange({ required: e.target.checked })}
                aria-label="Required"
                className="accent-amber-500"
              />
              Required
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Question Text</label>
          <input
            type="text"
            value={question.text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Enter your question..."
            aria-label="Question text"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </div>

        {(question.type === 'single_choice' || question.type === 'multi_choice') && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Options</label>
            <div className="space-y-2">
              {(question.options ?? []).map((opt, optIdx) => (
                <div key={optIdx} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...(question.options ?? [])];
                      newOpts[optIdx] = e.target.value;
                      onChange({ options: newOpts });
                    }}
                    placeholder={`Option ${optIdx + 1}`}
                    aria-label={`Option ${optIdx + 1}`}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  />
                  {(question.options?.length ?? 0) > 1 && (
                    <button
                      onClick={() => onChange({ options: (question.options ?? []).filter((_, i) => i !== optIdx) })}
                      aria-label="Remove option"
                      className="text-red-400 hover:text-red-600 text-sm px-2"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => onChange({ options: [...(question.options ?? []), ''] })}
                aria-label="Add option"
                className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                + Add option
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
