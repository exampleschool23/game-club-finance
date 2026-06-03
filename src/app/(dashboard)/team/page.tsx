import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TeamPageClient from './TeamPageClient';

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner') redirect('/');

  return <TeamPageClient currentUserId={user.id} />;
}
