'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { createClient } from '@/lib/supabase/client';

interface SettingsPageClientProps {
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
}

export function SettingsPageClient({ email, fullName, role }: SettingsPageClientProps) {
  const t = useTranslations('settings');
  const [account, setAccount] = useState({
    email,
    fullName,
    role,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!cancelled) {
        setAccount({
          email: session.user.email,
          fullName: data?.full_name,
          role: data?.role,
        });
      }
    }

    loadAccount().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('language')}
          </h2>
          <LanguageSwitcher />
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('account')}
          </h2>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">{t('emailLabel')}: </span>
              {account.email ?? '-'}
            </p>
            {account.fullName && (
              <p className="text-gray-700">
                <span className="font-medium">{t('nameLabel')}: </span>
                {account.fullName}
              </p>
            )}
            {account.role && (
              <p className="text-gray-700">
                <span className="font-medium">{t('roleLabel')}: </span>
                <span className="capitalize">{account.role}</span>
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('appInfo')}
          </h2>
          <p className="text-sm text-gray-500">{t('version')}: 2.0.0</p>
          <p className="text-sm text-gray-500 mt-1">GameClub Finance</p>
        </div>
      </div>
    </div>
  );
}
