import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

interface RejectRequestBody {
  userId?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rejects a sign-up that has not been given any club access: the auth user is
 * deleted, which cascades to the profile. The person can sign in again later
 * and a fresh request appears. Only club owners may reject, and only people
 * with no memberships anywhere, so an active teammate can never be removed
 * through this route.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as RejectRequestBody | null;
  const userId = typeof body?.userId === 'string' && UUID.test(body.userId) ? body.userId : null;
  if (!userId) return Response.json({ error: 'Invalid request' }, { status: 400 });
  if (userId === user.id) return Response.json({ error: 'Cannot reject yourself' }, { status: 400 });

  // RLS scopes this read to the caller's own memberships.
  const { data: ownedClubs, error: ownerError } = await supabase
    .from('club_memberships')
    .select('club_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .limit(1);
  if (ownerError) return Response.json({ error: ownerError.message }, { status: 400 });
  if (!ownedClubs || ownedClubs.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { data: memberships, error: membershipError } = await service
    .from('club_memberships')
    .select('club_id')
    .eq('user_id', userId)
    .limit(1);
  if (membershipError) return Response.json({ error: membershipError.message }, { status: 400 });
  if (memberships && memberships.length > 0) {
    return Response.json({ error: 'User already has club access' }, { status: 409 });
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(userId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 400 });

  return Response.json({ ok: true });
}
