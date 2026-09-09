import type { OwnerWithdrawal } from '@/types';
import {
  sumAvailableMoneyResults,
  type AvailableMoneyByMonth,
  type AvailableMoneyResult,
} from './availableMoney';
import {
  emptyMoneyLeftByPaymentMethod,
  type MoneyLeftByPaymentMethod,
} from './dashboardMetrics';

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
  paymentMethodBalancesByMonth?: Record<string, Partial<MoneyLeftByPaymentMethod>>;
  paymentMethodBalances?: Partial<MoneyLeftByPaymentMethod>;
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
  paymentMethodBalancesByMonth: Record<string, MoneyLeftByPaymentMethod>;
  paymentMethodBalances: MoneyLeftByPaymentMethod;
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
      totalAvailable: gameClub.available + bar.available,
      hasOverWithdrawal: gameClub.overdrawnBy > 0 || bar.overdrawnBy > 0,
      invalidWithdrawals: [],
    };
    return result;
  }, {});

  return {
    byMonth,
    total: sumAvailableMoneyResults(Object.values(byMonth)),
    withdrawals: payload.withdrawalRows,
    paymentMethodBalancesByMonth: Object.fromEntries(
      Object.entries(payload.paymentMethodBalancesByMonth ?? {}).map(([month, balances]) => [month, {
        ...emptyMoneyLeftByPaymentMethod,
        ...Object.fromEntries(Object.entries(balances).map(([method, amount]) => [method, Number(amount ?? 0)])),
      }]),
    ),
    paymentMethodBalances: {
      ...emptyMoneyLeftByPaymentMethod,
      ...Object.fromEntries(Object.entries(payload.paymentMethodBalances ?? {}).map(
        ([method, amount]) => [method, Number(amount ?? 0)],
      )),
    },
  };
}
