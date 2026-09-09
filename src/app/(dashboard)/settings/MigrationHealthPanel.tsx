'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { loadMigrationHealth, type HealthResult } from '@/lib/supabase/migrationHealth';
import migrations from '@/lib/supabase/migrationManifest.json';

export function MigrationHealthPanel({ clubId }: { clubId: string }) {
  const t = useTranslations('settings.migrationHealth');
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => () => { requestId.current += 1; }, []);

  async function check() {
    const request = ++requestId.current;
    setLoading(true);
    setResult(null);
    const next = await loadMigrationHealth(createClient(), clubId);
    if (request !== requestId.current) return;
    setResult(next);
    setLoading(false);
  }

  const data = result?.status === 'ready' ? result.data : null;
  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-1 shrink-0 text-primary-600" size={22} />
          <div>
            <h2 className="font-bold text-gray-950">{t('title')}</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('description')}</p>
          </div>
        </div>
        <button type="button" className="btn-primary" disabled={loading} onClick={check}>
          {loading ? t('checking') : t('check')}
        </button>
      </div>
      <div aria-live="polite" className="mt-4 text-sm">
        {result?.status === 'unavailable' && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{t('unavailable')}</p>}
        {result?.status === 'error' && <p role="alert" className="text-danger-600">{t('error')}</p>}
        {data && <>
          <p className="mb-4 text-gray-600">{t('historyNote')}</p>
          {!data.historyAvailable && <p className="mb-4 text-amber-800">{t('noHistory')}</p>}
          <h3 className="font-semibold text-gray-900">{t('featureChecks')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('checksNote')}</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {data.checks.map((check) => <li key={check.name} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="min-w-0 break-all font-mono text-xs">{check.version} · {check.name}</span>
              <span className={check.status === 'matching' ? 'text-success-600' : 'text-amber-800'}>{t(check.status)}</span>
            </li>)}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-gray-900">{t('allMigrations', { count: migrations.length })}</summary>
            <ul className="mt-2 max-h-96 divide-y divide-gray-100 overflow-auto">
              {migrations.map((file) => <li key={file} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="min-w-0 break-all font-mono text-xs">{file}</span>
                <span className="text-xs text-gray-600">{t(data.historyAvailable && data.recordedVersions.includes(file.split('_')[0]) ? 'recorded' : 'unconfirmed')}</span>
              </li>)}
            </ul>
          </details>
          <p className="mt-4 text-xs text-gray-500">{t('nextSteps')}</p>
        </>}
      </div>
    </section>
  );
}
