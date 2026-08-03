# Restaurant Ledger Pro

# Lovable Build Prompt — Multi-Restaurant Vendor & Cash Management System

Copy everything below into Lovable as your project prompt.

---

## PROJECT OVERVIEW

Build a **production-ready, secure, multi-restaurant Vendor & Cash Management web application**. The system lets a business that operates multiple restaurants manage vendors per restaurant, record purchases (cash or credit), pay vendors from restaurant-specific cash vaults, and generate clear, exportable financial reports and vendor ledgers.

This is a real business tool — prioritize **data integrity, correct balance math, full CRUD everywhere, and clean audit trails** over flashy design. Every number shown on screen must be traceable to a transaction.

Use a modern stack: **React + TypeScript + Tailwind + shadcn/ui** for frontend, **Supabase** (Postgres + Auth + Storage) as backend, with Row Level Security enabled on all tables.

---

## AUTHENTICATION & SECURITY

- Secure email/password login is **mandatory** — no part of the app is accessible without logging in.
- On first setup, seed one admin user:
  - Email: `admin@software.com`
  - Password: `Admin123`
  - Role: `admin`
- Build a `users`/`profiles` table with a `role` column (`admin`, `manager`, `staff` — admin required now, structure the schema so more roles can be added later).
- Add a settings screen where the admin can create additional users, reset passwords, and deactivate accounts.
- Enforce Supabase Row Level Security on every table so data can only be read/written by authenticated users.
- Add session timeout / logout, and protect all routes with an auth guard that redirects to `/login` if not authenticated.
- Log every create/update/delete (who did it, when, before/after values) in an `activity_log` table — show this optionally in Settings for audit purposes.

---

## LEFT-SIDE NAVIGATION MENU

1. Dashboard
2. Restaurants
3. Vendors
4. Purchase
5. Payments
6. Vendor Ledger
7. Vaults / Cash in Hand
8. Report
9. Settings

---

## CORE DATA MODEL (build these tables/relationships first)

- **restaurants**: id, name, address, phone, opening_cash_balance, current_cash_balance, is_active, created_at, updated_at
- **vendors**: id, restaurant_id (FK), name, phone, address, opening_balance, current_balance, is_active, created_at, updated_at
  - A vendor belongs to exactly one restaurant. The same real-world vendor supplying multiple restaurants should be added as separate vendor records per restaurant (keep it simple and explicit).
- **vaults** (Cash in Hand users): id, restaurant_id (FK), vault_user_name, opening_balance, current_balance, is_active, created_at, updated_at
  - Each restaurant can have multiple vault/cash-in-hand users (e.g., "Manager A Cash", "Petty Cash").
- **purchases**: id, restaurant_id (FK), vendor_id (FK), amount, payment_type (`cash` | `credit` | `partial`), amount_paid_now, amount_on_credit, details (optional text), invoice_images (array of file URLs), created_by, created_at, updated_at, is_deleted (soft delete)
- **payments**: id, restaurant_id (FK), vault_id (FK), vendor_id (FK), amount, note, payment_images (optional), created_by, created_at, updated_at, is_deleted
- **vendor_ledger_entries** (derived or materialized view): a unified chronological feed per vendor combining opening balance, every purchase (increases balance owed), and every payment (decreases balance owed), with running balance.
- **cash_transactions** (derived from vaults + payments): tracks vault opening balance and every deduction, with running balance per vault and rolled up per restaurant.

**Balance logic (must be exact):**
- Vendor `current_balance` = opening_balance + SUM(all purchase amounts on credit/partial unpaid portion) − SUM(all payments made to that vendor).
- Vault/Cash in Hand `current_balance` = opening_balance − SUM(all payments made from that vault) (+ any manual top-ups if that feature is added later).
- Restaurant-level cash in hand totals = SUM of all vaults' opening_balance and current_balance under that restaurant.
- All balance calculations must be done server-side (via database views, functions, or triggers) — never trust client-calculated numbers for what's stored.

---

## MODULE-BY-MODULE FUNCTIONALITY

### 1. Dashboard
- Summary cards: total restaurants, total active vendors, total cash in hand (across all restaurants), total outstanding vendor payables (across all restaurants).
- Quick restaurant selector showing that restaurant's cash in hand and top 5 vendors by outstanding balance.
- Recent activity feed (last 10 purchases/payments across the system).

### 2. Restaurants
- Full CRUD: Create, list (table with search/filter), view detail, edit, delete (soft delete with confirmation — block delete if vendors/purchases exist, or cascade with a clear warning).
- Fields: name, address, phone, opening cash balance (informational — actual cash tracked in Vaults), status (active/inactive).
- Detail page shows: vendor count, total outstanding to vendors, all vaults under this restaurant, and quick links to that restaurant's Vendor Ledger and Report.

### 3. Vendors
- Full CRUD.
- **Creating a vendor requires selecting its Restaurant first** — a vendor always belongs to one restaurant.
- Fields: name, phone, address, opening balance, status.
- List view: filter by restaurant (dropdown), search by vendor name/phone, sortable columns (name, opening balance, current balance).
- Vendor detail page: shows opening balance, current balance, full purchase history, full payment history, and a "View Ledger" button that jumps to Vendor Ledger for this vendor.
- Edit/delete with confirmation; prevent deleting a vendor with existing transactions (soft delete/deactivate instead).

### 4. Purchase (record what a restaurant bought from a vendor)
Step-by-step required flow:
1. **Select Restaurant** (required, first field).
2. Once restaurant is selected, **Vendor dropdown populates with only that restaurant's vendors**.
3. Select Vendor.
4. Enter Amount (total purchase value).
5. Choose Payment Type: **Full Credit**, **Full Cash Paid Now**, or **Partial** (pay part now, rest goes to credit/balance).
   - If Partial or Full Cash Paid Now is chosen, also require selecting the **Vault/Cash in Hand user** the payment is coming from (same cascading restaurant → vault selection as in Payments).
6. Optional **Details** text field (free text notes about the purchase, e.g., items bought).
7. Optional **Image upload** — support multiple images (invoice/bill photos), stored in Supabase Storage, shown as thumbnails with a lightbox/preview viewer.
8. Save — this updates: vendor's current_balance (adds credit portion), and if any cash was paid, deducts from the chosen vault's current_balance and creates a linked payment record automatically.
- **Full CRUD**: Purchase list with search/filter (by restaurant, vendor, date range, payment type), edit any purchase (re-adjust balances correctly on edit), delete with confirmation (correctly reverse the balance impact on delete/soft-delete).
- Purchase detail/view screen shows all fields including full-size images and any linked payment.

### 5. Payments (pay a vendor from a vault)
Step-by-step required flow:
1. **Select Restaurant** first.
2. **Select Vault/Cash in Hand user** for that restaurant (dropdown populated based on restaurant chosen).
3. **Select Vendor** (populated based on restaurant chosen).
4. Once vendor is selected, **display that vendor's current outstanding balance** clearly on screen before confirming payment.
5. Enter payment Amount (validate: warn if amount exceeds vendor's outstanding balance, and warn if it exceeds the vault's current cash balance — allow override with confirmation if business needs it, but flag clearly).
6. Optional note field and optional image upload (payment receipt/proof).
7. Save — deducts from vault's current_balance and reduces vendor's current_balance (payable).
- Full CRUD: list/search/filter (by restaurant, vault, vendor, date range), edit, delete with correct balance reversal, detail view with images.

### 6. Vendor Ledger
- Choose Restaurant → choose Vendor → click "Show Ledger."
- Displays a clean chronological statement (like a bank statement) with columns:
  - Date | Description (Opening Balance / Purchase / Payment) | Reference/Details | Debit (increases owed) | Credit (payment made) | Running Balance
- Top of the ledger: Vendor name, restaurant, opening balance, current balance, total purchased, total paid — clearly displayed as summary cards.
- **PDF Export button** — generates a professionally formatted PDF (letterhead-style: company/restaurant name, vendor name, date range, the full ledger table, and a summary footer) ready to share with the vendor.
- Include date-range filter to narrow the ledger to a specific period.

### 7. Vaults / Cash in Hand
- Choose Restaurant first, then the screen shows/manages that restaurant's Vault/Cash-in-Hand users.
- Full CRUD to add a vault user: name, opening balance, (current balance auto-calculated, read-only).
- List view shows each vault's opening balance, current balance, total paid out, linked restaurant.
- Vault detail page: transaction history (every payment made from this vault, with vendor, amount, date, linked purchase if applicable).
- Edit/delete vault with confirmation (block delete if it has transaction history — deactivate instead).

### 8. Report
- Choose Restaurant → click "Show" to generate the report.
- **Top of report**: Total Cash in Hand — Opening and Current (summed across all vaults for that restaurant), plus report generation date and restaurant name.
- **Main table**, one row per vendor, columns exactly as follows:
  - Vendor Name
  - Opening Balance / Old Balance
  - Total Purchased (in period)
  - Total Paid
  - Current Balance
  - Total (Opening + Current, as requested) — include this as its own column even though it's a derived check figure
- **Totals row at the bottom** of the table summing every numeric column (Opening Balances, Purchases, Paid, Current Balances, Total).
- Add optional date-range filter (this month, custom range, all-time) applied consistently to both the vendor table and the cash-in-hand summary.
- **PDF Export button** — clean, printable PDF with the restaurant name/header, the cash-in-hand summary at top, the full vendor table, and the totals row — formatted for sharing with owners/stakeholders.
- Add search/sort within the on-screen table (search vendor by name, sort by any column) before exporting.

### 9. Settings
- Manage users (add/edit/deactivate, assign roles) — admin only.
- Manage app-level info: business name/logo (used on PDF headers), currency symbol/format.
- View activity log (audit trail) with filter by user/date/action.
- Backup/export data option (CSV export of all core tables) as a bonus if time allows.

---

## CROSS-CUTTING REQUIREMENTS (apply everywhere — do not skip)

- **Full CRUD on every entity**: Restaurants, Vendors, Vaults, Purchases, Payments must all support Create, Read (list + detail), Update, and Delete. Every delete requires a confirmation dialog. Prefer soft delete (is_deleted / is_active flags) so historical reports stay accurate even if something is later "removed."
- **Editing a Purchase or Payment must correctly re-calculate all affected balances** (vendor balance, vault balance) — never let edits silently desync the numbers. Show a clear warning in the edit form that changing amount/type will adjust balances.
- **Image uploads**: every purchase and payment supports optional multiple image attachments (bills/receipts), stored in Supabase Storage with proper file size/type validation (jpg/png/pdf, reasonable size limit), shown as thumbnails in list/detail views with a full-screen preview/lightbox.
- **Cascading dropdowns everywhere**: any screen involving a vendor or vault must first require selecting the Restaurant, then populate the next dropdown accordingly (Restaurant → Vendor, Restaurant → Vault). Never show a vendor or vault picker before its restaurant is chosen.
- **Advanced search**: global search bar plus per-module filters — search purchases/payments by vendor name, restaurant, date range, amount range, payment type; search vendors/vaults by name/status. Results should update live or via clear "Search" action, with pagination for large lists.
- **Validation everywhere**: required fields enforced, numeric fields can't go negative, amount fields validated against available balances with clear warning messages (not silent blocks unless it's a hard business rule).
- **Responsive design**: must work cleanly on desktop and tablet (staff may use this on a tablet at the counter); mobile-friendly is a plus.
- **Loading and empty states**: every list/table has a loading skeleton and a friendly empty state ("No vendors yet — add one to get started").
- **Currency formatting**: consistent formatting throughout (e.g., thousand separators, fixed 2 decimals) and configurable currency symbol from Settings.
- **PDF exports** (Report + Vendor Ledger) must be genuinely presentable: clear headers, aligned tables, page numbers if multi-page, generated client-side or via an edge function — test that it actually renders correctly, not just a raw HTML dump.
- **No orphaned data**: deleting/deactivating a restaurant should never silently break vendor/vault/purchase/payment records — enforce foreign key constraints and confirm cascading behavior explicitly with the user before allowing it.

---

## TESTING & QA EXPECTATIONS BEFORE CALLING THIS "DONE"

Explicitly verify each of these end-to-end flows work correctly with real balance math, not just UI rendering:

1. Create a restaurant → add 2+ vendors with opening balances → add 2+ vaults with opening balances.
2. Record a full-credit purchase → vendor balance increases correctly, no vault affected.
3. Record a full-cash purchase → vendor balance unaffected (net), vault balance decreases correctly.
4. Record a partial purchase → vendor balance increases by unpaid portion only, vault balance decreases by paid portion.
5. Make a standalone payment to a vendor from a vault → vendor balance decreases, vault balance decreases.
6. Edit a purchase amount → confirm balances re-adjust correctly (not double-counted).
7. Delete a payment → confirm vendor balance and vault balance both correctly reverse.
8. Open Vendor Ledger for a vendor with mixed purchases/payments → confirm running balance matches vendor's current_balance exactly.
9. Open Report for a restaurant with multiple vendors → confirm every column totals correctly and matches the sum of individual vendor balances, and cash-in-hand total matches the sum of that restaurant's vaults.
10. Export both PDF reports and confirm formatting is clean and all numbers match the on-screen figures.
11. Try logging in with wrong credentials — should fail gracefully; log in with `admin@software.com` / `Admin123` — should succeed and reach Dashboard.
12. Confirm all dropdowns are properly cascading (nothing shows vendors/vaults before a restaurant is picked).
13. Upload multiple images to a purchase, confirm they display correctly in list, detail, and don't break the PDF export.

---

## DELIVERABLE

A fully functional, deployed, production-ready web app matching every module and rule above — not a prototype or mockup. All CRUD operations, balance calculations, cascading selections, image uploads, PDF exports, search, and authentication must be fully working, not placeholder UI.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://arabic-manager.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f750eb46-b3f5-4d96-b30c-8f3c1495bc97).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
