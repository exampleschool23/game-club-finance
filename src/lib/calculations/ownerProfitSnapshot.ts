import type { OwnerWithdrawal } from '@/types';
import {
  sumAvailableMoneyResults,
  type AvailableMoneyByMonth,
  type AvailableMoneyResult,
} from './availableMoney';

export interface OwnerProfitMonthlyBalanceRow {
  period_month: string;
  game_club_earned: number;
  bar_earned: number;
  game_club_withdrawn: number;
  bar_withdrawn: number;
}

export interface OwnerProfitSnapshotPayload {
  monthlyBalances: OwnerProfitMonthlyBalanceRow[];
  withdrawalRows: OwnerWithdrawal[];
}

function sourceBalance(earned: number, withdrawn: number) {
  const available = earned - withdrawn;

  return {
    earned,
    withdrawn,
    available,
    overdrawnBy: Math.max(0, -available),
  };
}

export function buildOwnerProfitSnapshot(payload: OwnerProfitSnapshotPayload): {
  byMonth: AvailableMoneyByMonth;
  total: AvailableMoneyResult;
  withdrawals: OwnerWithdrawal[];
} {
  const byMonth = payload.monthlyBalances.reduce<AvailableMoneyByMonth>((result, row) => {
    const month = row.period_month.slice(0, 7);
    const gameClub = sourceBalance(
      Number(row.game_club_earned ?? 0),
      Number(row.game_club_withdrawn ?? 0),
    );
    const bar = sourceBalance(
      Number(row.bar_earned ?? 0),
      Number(row.bar_withdrawn ?? 0),
    );

    result[month] = {
      gameClub,
      bar,
      totalEarned: gameClub.earned + bar.earned,
      totalWithdrawn: gameClub.withdrawn + bar.withdrawn,
      totalAvailable: Math.max(0, gameClub.available) + Math.max(0, bar.available),
      hasOverWithdrawal: gameClub.overdrawnBy > 0 || bar.overdrawnBy > 0,
      invalidWithdrawals: [],
    };
    return result;
  }, {});

  return {
    byMonth,
    total: sumAvailableMoneyResults(Object.values(byMonth)),
    withdrawals: payload.withdrawalRows,
  };
}
