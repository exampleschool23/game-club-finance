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
      paymentMethodBalancesByMonth: {
        '2026-07': { cash: 800, terminal: 200 },
        '2026-08': { cash: -100, card: 50 },
      },
      paymentMethodBalances: { cash: 700, terminal: 250, card: 50, playstation: 100 },
    });

    expect(result.paymentMethodBalancesByMonth['2026-07']).toEqual({ cash: 800, terminal: 200, card: 0, playstation: 0 });
    expect(result.paymentMethodBalancesByMonth['2026-08']).toEqual({ cash: -100, terminal: 0, card: 50, playstation: 0 });
    expect(result.paymentMethodBalancesByMonth['2026-09']).toBeUndefined();
    // The bar card shows earned money before withdrawals, matching the method cards.
    expect(result.byMonth['2026-07'].bar.earned).toBe(500);
    expect(result.byMonth['2026-07'].bar.available).toBe(0);
    expect(result.byMonth['2026-07'].gameClub.available).toBe(800);
    expect(result.byMonth['2026-08'].gameClub.overdrawnBy).toBe(100);
    expect(result.total.gameClub.available).toBe(800);
    expect(result.total.bar.available).toBe(200);
    expect(result.total.totalAvailable).toBe(1_000);
    expect(result.paymentMethodBalances).toEqual({
      cash: 700,
      terminal: 250,
      card: 50,
      playstation: 100,
    });
  });

  it('defaults payment-method balances for compatibility with the previous RPC payload', () => {
    const result = buildOwnerProfitSnapshot({ monthlyBalances: [], withdrawalRows: [] });

    expect(result.paymentMethodBalancesByMonth).toEqual({});
    expect(result.paymentMethodBalances).toEqual({ cash: 0, terminal: 0, card: 0, playstation: 0 });
  });
});
