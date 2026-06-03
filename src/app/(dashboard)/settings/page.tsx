import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="max-w-xl">
      <PageHeader title={t('title')} />

      <div className="space-y-4">
        {/* Language */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('language')}
          </h2>
          <LanguageSwitcher />
        </div>

        {/* Account */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('account')}
          </h2>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">{t('emailLabel')}: </span>
              {user?.email ?? '—'}
            </p>
            {profile?.full_name && (
              <p className="text-gray-700">
                <span className="font-medium">{t('nameLabel')}: </span>
                {profile.full_name}
              </p>
            )}
            {profile?.role && (
              <p className="text-gray-700">
                <span className="font-medium">{t('roleLabel')}: </span>
                <span className="capitalize">{profile.role}</span>
              </p>
            )}
          </div>
        </div>

        {/* App info */}
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
