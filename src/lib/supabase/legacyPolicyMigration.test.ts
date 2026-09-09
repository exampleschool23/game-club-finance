import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('final migration policy state', () => {
  it('removes pre-multi-club bypasses while retaining club-scoped replacements', () => {
    const directory = resolve(process.cwd(), 'supabase/migrations');
    const active = new Set<string>();
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(directory, file), 'utf8');
      const policyStatements = sql.matchAll(
        /\b(create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)/gi,
      );
      for (const [, operation, name, table] of policyStatements) {
        const key = `${table}:${name}`;
        if (operation.toLowerCase() === 'create') active.add(key);
        else active.delete(key);
      }
    }
    expect(active.has('daily_cash_entries:admin_owner_insert_cash_entries')).toBe(false);
    expect(active.has('income_transactions:Viewer can view today income')).toBe(false);
    expect(active.has('debts:Viewer can view own debts')).toBe(false);
    expect(active.has('daily_cash_entries:club_admin_insert_cash_entries')).toBe(true);
    expect(active.has('income_transactions:club_read_income_transactions')).toBe(true);
    expect(active.has('debts:club_read_legacy_debts')).toBe(true);
  });
});
