'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarRange, Download, FileText } from 'lucide-react';
import { todayIso, currentYearMonth } from '@/lib/utils';

type ReportTab = 'daily' | 'weekly' | 'monthly' | 'custom';

const tabs: Array<{ value: ReportTab; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom Range' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('daily');
  const [date, setDate] = useState(todayIso());
  const [month, setMonth] = useState(currentYearMonth());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-normal text-gray-950">Reports</h1>
          <p className="mt-1 text-base text-gray-600">
            Detailed reports for export, review, and custom ranges.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
        >
          <Download size={17} className="text-primary-600" />
          Export
        </button>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${
                tab === item.value
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
          {tab === 'daily' && (
            <div className="grid gap-4 md:grid-cols-[260px_1fr] md:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Daily report date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <Link
                href={`/daily-report?date=${date}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 md:w-fit"
              >
                <FileText size={17} />
                Open Daily Detail
              </Link>
            </div>
          )}

          {tab === 'weekly' && (
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <CalendarRange size={22} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-950">Weekly Report</h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">
                  Weekly detail is available from the Dashboard period switcher. Export controls can be expanded here without crowding the main dashboard.
                </p>
              </div>
            </div>
          )}

          {tab === 'monthly' && (
            <div className="grid gap-4 md:grid-cols-[260px_1fr] md:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Monthly report</span>
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <Link
                href={`/monthly-report?month=${month}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 md:w-fit"
              >
                <CalendarDays size={17} />
                Open Monthly Detail
              </Link>
            </div>
          )}

          {tab === 'custom' && (
            <div className="grid gap-4 md:grid-cols-[220px_220px_1fr] md:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-600">
                Custom export range selected: {from} to {to}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
