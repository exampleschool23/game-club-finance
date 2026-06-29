#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_WORKBOOK = '/Users/hoggish/Downloads/Приход_Расход 05.2026.xlsx';
const DEFAULT_SOURCE_SHEET = '31.05.2026';
const DEFAULT_TARGET_DATE = '2026-06-01';

function parseArgs(argv) {
  const args = {
    apply: false,
    workbook: DEFAULT_WORKBOOK,
    sourceSheet: DEFAULT_SOURCE_SHEET,
    date: DEFAULT_TARGET_DATE,
    email: '',
    password: '',
    clubId: '',
  };

  argv.forEach((arg) => {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--workbook=')) args.workbook = arg.slice('--workbook='.length);
    else if (arg.startsWith('--source-sheet=')) args.sourceSheet = arg.slice('--source-sheet='.length);
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg.startsWith('--password=')) args.password = arg.slice('--password='.length);
    else if (arg.startsWith('--club-id=')) args.clubId = arg.slice('--club-id='.length);
  });

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readItems(workbookPath, sourceSheet) {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: true, cellDates: true });
  const worksheet = workbook.Sheets[sourceSheet];
  if (!worksheet) {
    throw new Error(`Sheet "${sourceSheet}" not found. Available: ${workbook.SheetNames.join(', ')}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  return rows
    .slice(1)
    .map((row, index) => {
      const name = String(row[0] ?? '').trim();
      const salePrice = asNumber(row[1]);
      const costPrice = asNumber(row[2]);
      const openingStock = asNumber(row[3]);
      const soldQty = asNumber(row[4]);
      const receivedQty = asNumber(row[5]);
      const juneOpeningStock = openingStock - soldQty + receivedQty;

      return {
        source_row: index + 2,
        name,
        category: 'bar',
        sale_price: salePrice,
        cost_price: costPrice,
        current_stock: juneOpeningStock,
        low_stock_threshold: 5,
        is_active: true,
      };
    })
    .filter((item) => item.name && (item.sale_price > 0 || item.cost_price > 0));
}

function productKey(product) {
  return [
    String(product.name).trim().toLowerCase(),
    Number(product.sale_price).toFixed(2),
    Number(product.cost_price).toFixed(2),
  ].join('|');
}

async function signInIfNeeded(supabase, args, env) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return null;

  const email = args.email || env.SUPABASE_USER_EMAIL || process.env.SUPABASE_USER_EMAIL;
  const password = args.password || env.SUPABASE_USER_PASSWORD || process.env.SUPABASE_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Apply mode needs either SUPABASE_SERVICE_ROLE_KEY or login credentials. ' +
        'Pass --email=... --password=... or set SUPABASE_USER_EMAIL and SUPABASE_USER_PASSWORD.'
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session?.user?.id ?? null;
}

async function getTargetClubId(supabase, args) {
  if (args.clubId) return args.clubId;

  const { data, error } = await supabase
    .from('clubs')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error('Could not resolve target club. Pass --club-id=<uuid> after running the multi-club migration.');
  }

  console.log(`Target club: ${data.name} (${data.id})`);
  return data.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = {
    ...loadEnvFile(path.join(process.cwd(), '.env.local')),
    ...process.env,
  };

  const items = readItems(args.workbook, args.sourceSheet);
  const duplicateNames = items
    .map((item) => item.name)
    .filter((name, index, names) => names.indexOf(name) !== index);

  console.log(`Workbook: ${args.workbook}`);
  console.log(`Source sheet: ${args.sourceSheet}`);
  console.log(`Target date: ${args.date}`);
  console.log(`Bar items found: ${items.length}`);
  console.log(`Duplicate item names kept as separate price/cost rows: ${new Set(duplicateNames).size}`);
  console.table(
    items.slice(0, 10).map((item) => ({
      row: item.source_row,
      name: item.name,
      sale_price: item.sale_price,
      cost_price: item.cost_price,
      june_opening_stock: item.current_stock,
    }))
  );

  if (!args.apply) {
    console.log('\nDry run only. Re-run with --apply to write products and 2026-06-01 stock counts.');
    return;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL/key. Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await signInIfNeeded(supabase, args, env);
  const clubId = await getTargetClubId(supabase, args);

  const { data: existingProducts, error: existingError } = await supabase
    .from('products')
    .select('id,name,sale_price,cost_price')
    .eq('club_id', clubId);
  if (existingError) throw existingError;

  const byKey = new Map((existingProducts ?? []).map((product) => [productKey(product), product]));
  const productsToInsert = items.filter((item) => !byKey.has(productKey(item)));

  if (productsToInsert.length > 0) {
    const { data: insertedProducts, error: insertError } = await supabase
      .from('products')
      .insert(
        productsToInsert.map((item) => ({
          club_id: clubId,
          name: item.name,
          category: item.category,
          sale_price: item.sale_price,
          cost_price: item.cost_price,
          current_stock: item.current_stock,
          low_stock_threshold: item.low_stock_threshold,
          is_active: item.is_active,
        }))
      )
      .select('id,name,sale_price,cost_price');
    if (insertError) throw insertError;
    (insertedProducts ?? []).forEach((product) => byKey.set(productKey(product), product));
  }

  const stockRows = items.map((item) => {
    const product = byKey.get(productKey(item));
    if (!product) throw new Error(`Could not resolve product after insert: ${item.name}`);

    return {
      date: args.date,
      club_id: clubId,
      product_id: product.id,
      previous_stock: item.current_stock,
      added_today: 0,
      closing_stock: item.current_stock,
      sold_quantity: 0,
      sale_price: item.sale_price,
      cost_price: item.cost_price,
      bar_income: 0,
      bar_cost: 0,
      bar_profit: 0,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertError } = await supabase
    .from('daily_stock_counts')
    .upsert(stockRows, { onConflict: 'club_id,date,product_id' });
  if (upsertError) throw upsertError;

  const { error: stockUpdateError } = await supabase
    .from('products')
    .upsert(
      items.map((item) => {
        const product = byKey.get(productKey(item));
        return {
          id: product.id,
          club_id: clubId,
          name: item.name,
          category: item.category,
          sale_price: item.sale_price,
          cost_price: item.cost_price,
          current_stock: item.current_stock,
          low_stock_threshold: item.low_stock_threshold,
          is_active: item.is_active,
          updated_at: new Date().toISOString(),
        };
      })
    );
  if (stockUpdateError) throw stockUpdateError;

  console.log(`\nDone. Inserted ${productsToInsert.length} new products.`);
  console.log(`Upserted ${stockRows.length} stock rows for ${args.date}.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
