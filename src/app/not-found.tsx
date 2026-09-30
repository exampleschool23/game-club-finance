import { Compass } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink, Card, EmptyState } from '@/components/PresentationFoundation';

export default async function NotFound() {
  const tc = await getTranslations('common');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={Compass}
          title={tc('notFoundTitle')}
          description={tc('notFoundDescription')}
          action={<ButtonLink href="/">{tc('backToDashboard')}</ButtonLink>}
        />
      </Card>
    </main>
  );
}
