#!/usr/bin/env node
/**
 * Remove all test/demo data created by seed-test-data.cjs
 * Usage: node scripts/reset-test-data.cjs --confirm
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

if (!process.argv.includes('--confirm')) {
  console.error('⚠️  Pass --confirm to delete test data.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('❌ Missing env vars.'); process.exit(1); }

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function reset() {
  console.log('🗑️  Removing test data...\n');

  // Get test product IDs first
  const { data: testProducts } = await supabase
    .from('products')
    .select('id')
    .like('name', '[TEST]%');

  const testProductIds = (testProducts ?? []).map((p) => p.id);

  if (testProductIds.length > 0) {
    await supabase.from('daily_stock_counts').delete().in('product_id', testProductIds);
    await supabase.from('stock_purchases').delete().in('product_id', testProductIds);
    await supabase.from('products').delete().like('name', '[TEST]%');
    console.log(`   ✅ Removed ${testProductIds.length} test products and related stock data`);
  }

  // Remove test debts and their payments
  const { data: testDebts } = await supabase
    .from('new_debts')
    .select('id')
    .like('person_name', '[TEST]%');

  const testDebtIds = (testDebts ?? []).map((d) => d.id);
  if (testDebtIds.length > 0) {
    await supabase.from('debt_payments').delete().in('debt_id', testDebtIds);
    await supabase.from('new_debts').delete().like('person_name', '[TEST]%');
    console.log(`   ✅ Removed ${testDebtIds.length} test debts and payments`);
  }

  // Remove test expenses
  const { data: removedExpenses, error: expErr } = await supabase
    .from('expenses')
    .delete()
    .like('comment', '[TEST DATA]%')
    .select('id');
  if (!expErr) console.log(`   ✅ Removed ${removedExpenses?.length ?? 0} test expenses`);

  // Remove test daily cash entries
  const { data: removedCash, error: cashErr } = await supabase
    .from('daily_cash_entries')
    .delete()
    .like('comment', '[TEST DATA]%')
    .select('id');
  if (!cashErr) console.log(`   ✅ Removed ${removedCash?.length ?? 0} test daily cash entries`);

  console.log('\n✅ Test data removed.\n');
}

reset().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
