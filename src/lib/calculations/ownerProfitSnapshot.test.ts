import { describe, expect, it } from 'vitest';
import { buildOwnerProfitSnapshot } from './ownerProfitSnapshot';

describe('owner profit snapshot', () => {
  it('builds isolated monthly balances and positive aggregate availability', () => {
    const result = buildOwnerProfitSnapshot({
      monthlyBalances: [
        {
          period_month: '2026-07-01',
          game_club_earned: 1_000,
          bar_earned: 500,
          game_club_withdrawn: 200,
          bar_withdrawn: 500,
        },
        {
          period_month: '2026-08-01',
          game_club_earned: -100,
          bar_earned: 300,
          game_club_withdrawn: 0,
          bar_withdrawn: 100,
        },
      ],
      withdrawalRows: [],
    });

    expect(result.byMonth['2026-07'].gameClub.available).toBe(800);
    expect(result.byMonth['2026-08'].gameClub.overdrawnBy).toBe(100);
    expect(result.total.gameClub.available).toBe(800);
    expect(result.total.bar.available).toBe(200);
    expect(result.total.totalAvailable).toBe(1_000);
  });
});
