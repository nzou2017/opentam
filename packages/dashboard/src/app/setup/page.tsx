'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { backendConfig } from '@/lib/config';

type Plan = 'hobbyist' | 'startup' | 'enterprise';
type Step = 'plan' | 'contact' | 'confirm';

interface PlanInfo {
  id: Plan;
  name: string;
  tagline: string;
  price: string;
  features: string[];
  badge?: string;
}

const PLANS: PlanInfo[] = [
  {
    id: 'hobbyist',
    name: 'Hobbyist',
    tagline: 'Self-hosted, community edition',
    price: 'Free',
    features: [
      'Frustration detection',
      'Overlay hints & tooltips',
      'Basic analytics',
      'Community support',
    ],
  },
  {
    id: 'startup',
    name: 'Startup',
    tagline: 'Managed SaaS for small teams',
    price: 'Free',
    badge: 'Popular',
    features: [
      'Everything in Hobbyist',
      'Team access',
      'User surveys',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Private cloud with advanced controls',
    price: 'Contact sales',
    features: [
      'Everything in Startup',
      'SSO / SAML',
      'Advanced analytics',
      'Audit logs',
      'Custom branding',
      'Dedicated support',
    ],
  },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('plan');
  const [selectedPlan, setSelectedPlan] = useState<Plan>('startup');

  // Contact info
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [company, setCompany] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [resultPlan, setResultPlan] = useState('');

  // On mount: check if setup already completed
  useEffect(() => {
    fetch(`${backendConfig.backendUrl}/api/v1/setup/status`, {
      signal: AbortSignal.timeout(5000),
    })
      .then(r => r.json())
      .then((data: { setupCompleted: boolean }) => {
        if (data.setupCompleted) {
          router.replace('/login');
        }
      })
      .catch(() => {
        // Backend unreachable — let the user continue, setup will surface the error
      });
  }, [router]);

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        plan: selectedPlan,
      };
      if (company.trim()) body.company = company.trim();
      if (selectedPlan === 'enterprise') body.licenseKey = licenseKey.trim();

      const res = await fetch(`${backendConfig.backendUrl}/api/v1/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json() as { success?: boolean; plan?: string; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Setup failed. Please try again.');
        setLoading(false);
        return;
      }

      setResultPlan(data.plan ?? selectedPlan);
      setDone(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Done screen ──────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950 px-4">
        <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-8 shadow-lg text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-bold text-gray-900 text-xl shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
              Q
            </div>
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">OpenTAM</span>
          </div>
          <div className="mb-4 flex justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-3xl">
              &#10003;
            </span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Setup complete!</h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Your OpenTAM instance is activated on the{' '}
            <span className="font-semibold capitalize text-amber-600 dark:text-amber-400">{resultPlan}</span> plan.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-gray-900 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950 px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-bold text-gray-900 text-xl shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
              Q
            </div>
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">OpenTAM</span>
          </div>
          <h1 className="text-lg font-medium text-gray-600 dark:text-gray-400">Welcome — let's get you set up</h1>
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(['plan', 'contact', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                  step === s
                    ? 'bg-amber-500 text-gray-900'
                    : i < (['plan', 'contact', 'confirm'] as Step[]).indexOf(step)
                    ? 'bg-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div className={`h-px w-10 ${i < (['plan', 'contact', 'confirm'] as Step[]).indexOf(step) ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-900 p-8 shadow-lg">
          {/* ── Step 1: Plan selection ── */}
          {step === 'plan' && (
            <div>
              <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Choose your plan</h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                You can upgrade later. All plans include the core frustration detection engine.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative flex flex-col rounded-xl border-2 p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                      selectedPlan === plan.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 left-3 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-900">
                        {plan.badge}
                      </span>
                    )}
                    <span className="mb-0.5 text-sm font-bold text-gray-900 dark:text-gray-100">{plan.name}</span>
                    <span className="mb-2 text-xs text-gray-500 dark:text-gray-400">{plan.tagline}</span>
                    <span className="mb-3 text-base font-semibold text-amber-600 dark:text-amber-400">{plan.price}</span>
                    <ul className="space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                          <span className="mt-0.5 text-amber-500">&#10003;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep('contact')}
                  className="rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-gray-900 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Contact info ── */}
          {step === 'contact' && (
            <div>
              <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Your details</h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                Used to generate your license and send renewal notices.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Work email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Company <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {selectedPlan === 'enterprise' && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
                    <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
                      Enterprise licenses are issued by Aboninge. Contact{' '}
                      <a href="mailto:sales@aboninge.com" className="font-semibold underline hover:no-underline">
                        sales@aboninge.com
                      </a>{' '}
                      to purchase your license key.
                    </p>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      License key <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      placeholder="Paste your Ed25519 JWT license key here..."
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStep('plan')}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!ownerName.trim() || !ownerEmail.trim()) return;
                    if (selectedPlan === 'enterprise' && !licenseKey.trim()) return;
                    setStep('confirm');
                  }}
                  disabled={
                    !ownerName.trim() ||
                    !ownerEmail.trim() ||
                    (selectedPlan === 'enterprise' && !licenseKey.trim())
                  }
                  className="rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-gray-900 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Review
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 'confirm' && (
            <div>
              <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Confirm &amp; activate</h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                Review your details before we activate your license.
              </p>

              <dl className="mb-6 divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-3">
                  <dt className="font-medium text-gray-500 dark:text-gray-400">Plan</dt>
                  <dd className="font-semibold capitalize text-gray-900 dark:text-gray-100">{selectedPlan}</dd>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <dt className="font-medium text-gray-500 dark:text-gray-400">Name</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{ownerName}</dd>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <dt className="font-medium text-gray-500 dark:text-gray-400">Email</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{ownerEmail}</dd>
                </div>
                {company && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <dt className="font-medium text-gray-500 dark:text-gray-400">Company</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{company}</dd>
                  </div>
                )}
                {selectedPlan === 'enterprise' && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <dt className="font-medium text-gray-500 dark:text-gray-400">License key</dt>
                    <dd className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                      {licenseKey.slice(0, 20)}…
                    </dd>
                  </div>
                )}
              </dl>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => { setError(''); setStep('contact'); }}
                  disabled={loading}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-6 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 font-semibold text-gray-900 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                      Activating…
                    </>
                  ) : (
                    'Activate'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
