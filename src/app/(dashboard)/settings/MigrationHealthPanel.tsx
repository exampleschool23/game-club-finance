'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, InlineAlert, SectionHeading } from '@/components/PresentationFoundation';
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
  const allChecksPass = Boolean(data && data.checks.every((check) => check.status === 'matching'));

  return (
    <Card as="section" padding="lg" className="mt-5" aria-busy={loading}>
      <SectionHeading
        icon={<ShieldCheck size={22} aria-hidden="true" />}
        title={t('title')}
        description={t('description')}
        action={<Button loading={loading} loadingLabel={t('checking')} onClick={check}>{t('check')}</Button>}
      />
      <div aria-live="polite" className="mt-4 text-sm">
        {result?.status === 'unavailable' && <InlineAlert variant="warning">{t('unavailable')}</InlineAlert>}
        {result?.status === 'error' && <InlineAlert variant="danger">{t('error')}</InlineAlert>}
        {data && <>
          {allChecksPass && <InlineAlert variant="success" className="mb-4">{t('checksPassed')}</InlineAlert>}
          <h3 className="font-semibold text-gray-900">{t('featureChecks')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('checksNote')}</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {data.checks.map((check) => (
              <li key={check.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 break-all font-mono text-xs">{check.version} · {check.name}</span>
                <Badge variant={check.status === 'matching' ? 'success' : 'warning'}>{t(check.status)}</Badge>
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-gray-900">{t('allMigrations', { count: migrations.length })}</summary>
            <p className="mt-2 text-gray-600">{t('historyNote')}</p>
            {!data.historyAvailable && <p className="mt-2 text-gray-500">{t('noHistory')}</p>}
            {data.historyAvailable && (
              <ul className="mt-2 max-h-96 divide-y divide-gray-100 overflow-auto">
                {migrations.map((file) => (
                  <li key={file} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 break-all font-mono text-xs">{file}</span>
                    <Badge variant={data.recordedVersions.includes(file.split('_')[0]) ? 'success' : 'neutral'} size="sm">
                      {t(data.recordedVersions.includes(file.split('_')[0]) ? 'recorded' : 'unconfirmed')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </details>
          {!allChecksPass && <p className="mt-4 text-xs text-gray-500">{t('nextSteps')}</p>}
        </>}
      </div>
    </Card>
  );
}
