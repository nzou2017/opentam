'use client';

// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only


import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface TimeSeriesChartProps {
  data: { month: string; events: number; chats: number }[];
}

export function TimeSeriesChart({ data }: TimeSeriesChartProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Usage Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="events"
            stackId="1"
            stroke="#f59e0b"
            fill="#fef3c7"
            name="Events"
          />
          <Area
            type="monotone"
            dataKey="chats"
            stackId="1"
            stroke="#6366f1"
            fill="#e0e7ff"
            name="Chats"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
