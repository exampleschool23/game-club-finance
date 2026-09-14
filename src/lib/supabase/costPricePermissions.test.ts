import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function current_user_club_role(uuid) returns text language sql as $$
      select case when $1 = '10000000-0000-0000-0000-000000000001'::uuid then current_setting('test.role',true) else null end $$;
    create table products(id int primary key, club_id uuid, cost_price numeric default 0, name text);
    create table stock_purchases(id int primary key, product_id int references products, club_id uuid, cost_price numeric);
    insert into products values (1,'10000000-0000-0000-0000-000000000001',10,'Product');
    create function buy(n int, cost numeric) returns void language sql security definer as $$
      insert into stock_purchases values(n,1,'10000000-0000-0000-0000-000000000001',cost);
      update products set cost_price=cost where id=1;
    $$;
    create function repair_cost(cost numeric) returns void language sql security definer as $$ update products set cost_price=cost where id=1 $$;
  `);
  await db.exec(readFileSync('supabase/migrations/056_owner_only_cost_prices.sql','utf8'));
}, 20000);
afterAll(async () => { await db?.close(); });

it('blocks non-owner changes through direct writes and security-definer inventory paths', async () => {
  for (const role of ['admin','viewer','']) {
    await db.query("select set_config('test.role',$1,false)", [role]);
    await expect(db.exec('update products set cost_price=20 where id=1')).rejects.toThrow('Only a club owner');
    await expect(db.exec('select repair_cost(20)')).rejects.toThrow('Only a club owner');
    await expect(db.exec('select buy(1,20)')).rejects.toThrow('Only a club owner');
    await expect(db.exec("insert into products values(2,'10000000-0000-0000-0000-000000000001',20,'New')")).rejects.toThrow('Only a club owner');
  }
  expect((await db.query('select * from stock_purchases')).rows).toEqual([]);
  expect((await db.query('select cost_price from products')).rows).toEqual([{cost_price:'10'}]);
});

it('allows admins to retain approved cost and owners to change it', async () => {
  await db.exec("select set_config('test.role','admin',false); select buy(1,10); update products set name='Renamed' where id=1;");
  await db.exec("select set_config('test.role','owner',false); select buy(2,20);");
  expect((await db.query('select cost_price from products')).rows).toEqual([{cost_price:'20'}]);
  await db.exec("select set_config('test.role','admin',false)");
  await expect(db.exec('update stock_purchases set cost_price=20 where id=1')).rejects.toThrow('Only a club owner');
});

it('does not accept ownership in a different club', async () => {
  await db.exec("select set_config('test.role','owner',false)");
  await expect(db.exec("insert into products values(3,'20000000-0000-0000-0000-000000000001',20,'Other club')")).rejects.toThrow('Only a club owner');
});
