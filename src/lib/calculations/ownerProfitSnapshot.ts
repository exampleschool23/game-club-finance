import {
  OWNER_WITHDRAWAL_PAYMENT_METHODS,
  type OwnerWithdrawal,
  type OwnerWithdrawalPaymentMethod,
} from '../../types';
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

export interface PaymentMethodWithdrawalBalance {
  method: OwnerWithdrawalPaymentMethod;
  /** Game Club money left in this method after operating expenses, before withdrawals. */
  earned: number;
  withdrawn: number;
  available: number;
}

export interface GameClubWithdrawalsByMethod {
  methods: PaymentMethodWithdrawalBalance[];
  /** Game Club withdrawals recorded without a payment method (older rows, or All). */
  unassignedWithdrawn: number;
}

/**
 * Splits one month's Game Club withdrawals by payment method. Unassigned
 * withdrawals are reported separately and never guessed into a method.
 */
export function gameClubWithdrawalsByMethod(
  balances: MoneyLeftByPaymentMethod,
  withdrawals: readonly OwnerWithdrawal[],
  month: string,
): GameClubWithdrawalsByMethod {
  const withdrawn = Object.fromEntries(
    OWNER_WITHDRAWAL_PAYMENT_METHODS.map((method) => [method, 0]),
  ) as Record<OwnerWithdrawalPaymentMethod, number>;
  let unassignedWithdrawn = 0;

  for (const row of withdrawals) {
    if (row.source !== 'game_club' || row.period_month.slice(0, 7) !== month) continue;
    const amount = Number(row.amount ?? 0);
    if (row.payment_method && row.payment_method in withdrawn) withdrawn[row.payment_method] += amount;
    else unassignedWithdrawn += amount;
  }

  return {
    methods: OWNER_WITHDRAWAL_PAYMENT_METHODS.map((method) => {
      const earned = Number(balances[method] ?? 0);
      return { method, earned, withdrawn: withdrawn[method], available: earned - withdrawn[method] };
    }),
    unassignedWithdrawn,
  };
}

/** What can still be taken from one method: never more than the Game Club month balance. */
export function availableForPaymentMethod(methodAvailable: number, gameClubAvailable: number): number {
  return Math.max(0, Math.min(methodAvailable, gameClubAvailable));
}
