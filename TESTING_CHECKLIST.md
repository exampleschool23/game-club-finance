# Manual Testing Checklist — 15 Minutes

Run after every significant change. Each section should take ~2-3 minutes.

---

## A. Daily Cash Entry (`/daily-cash`)

- [ ] Add cash: **1,000,000 UZS**
- [ ] Add terminal: **500,000 UZS**
- [ ] Add card: **250,000 UZS**
- [ ] Confirm total shows: **1,750,000 UZS**
- [ ] Click Save — entry appears in "Today's Entry" section
- [ ] Edit a value within 15 minutes — confirm save works
- [ ] Wait 15 minutes (or use a past date) — confirm admin cannot edit locked entry
- [ ] Owner can always edit — verify with owner account

**Expected:** Total = Cash + Terminal + Card. Edit window enforced for admins.

---

## B. Stock Purchase (`/stock-purchase`)

- [ ] Select product: **Coca-Cola**
- [ ] Set quantity: **10**
- [ ] Set cost price: **4,500 UZS**
- [ ] Click "Record Purchase"
- [ ] Go to Inventory — confirm Coca-Cola stock increased by 10

**Expected:** Stock increases. Purchase appears in recent purchases table.

---

## C. Closing Stock (`/closing-stock`)

- [ ] Previous stock: **100**, Added today: **10**, Closing stock: **95**
- [ ] Confirm Sold Qty = **15** (100 + 10 - 95)
- [ ] Confirm Bar Income = Sold Qty × Sale Price
- [ ] Confirm Bar Profit = (Sale Price - Cost Price) × Sold Qty
- [ ] Click Save — success message appears

**Expected:** All calculated values match the formulas in the sidebar.

---

## D. Expenses (`/expenses`)

- [ ] Add expense: **120,000 UZS**, category: **cleaning**
- [ ] Confirm expense appears in recent list
- [ ] Go to Dashboard → Today — confirm expenses update

**Expected:** Expense shows on dashboard. Net profit decreases by 120,000.

---

## E. Debts (`/debts`)

- [ ] Add new debt for person: **Test Person**, amount: **500,000 UZS**
- [ ] Click "Add Payment", enter: **200,000 UZS**
- [ ] Confirm remaining = **300,000 UZS**, status = **Partial**
- [ ] Click "Add Payment", enter: **300,000 UZS**
- [ ] Confirm status = **Paid**, debt moves to paid section

**Expected:** Remaining debt decreases correctly. Status updates automatically.

---

## F. Dashboard (`/`)

- [ ] Confirm **Total Income = Game Club Income + Bar Income**
- [ ] Confirm **Net Profit = Total Income - Total Expenses**
- [ ] Switch period: Today / This Week / This Month — numbers change
- [ ] Confirm Income Trend chart shows last 7 days

**Expected:** All metrics are mathematically consistent.

---

## G. Automated Sanity Checks (`/test-checklist`)

- [ ] Open as owner/admin
- [ ] All checks show ✅ Pass
- [ ] If any check fails, follow the link to fix the issue

**Run this after entering daily data to confirm no inconsistencies.**

---

## H. Localization

- [ ] Switch language to RU — all visible text is in Russian
- [ ] Switch to UZ — all visible text is in Uzbek
- [ ] Switch back to EN — English restored
- [ ] Date pickers still work after language change

---

## Seed / Reset Test Data (Development Only)

```bash
# Add realistic test data
npm run seed:test-data

# Remove all [TEST] data
npm run reset:test-data
```

> ⚠️ Never run seed on production without review.
