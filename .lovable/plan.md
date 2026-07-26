## Multi-Restaurant Vendor & Cash Management System

### Phase 1 — Foundation
- Enable Lovable Cloud (Postgres + Auth + Storage + server functions)
- Design system: clean business/admin theme, semantic tokens in `src/styles.css`
- App shell: left sidebar (9 items), top bar with restaurant quick-switch + user menu, auth guard

### Phase 2 — Auth & Roles
- Email/password auth, seeded admin `admin@software.com` / `Admin123`
- `profiles` + `user_roles` enum (admin/manager/staff) + `has_role()` security-definer function
- `_authenticated` route gate; `/auth` login; sign-out cache teardown
- `activity_log` (who/when/before/after JSONB) via generic trigger

### Phase 3 — Data model & balance engine (server-authoritative)
Tables: `restaurants`, `vendors`, `vaults`, `purchases`, `payments`, `activity_log`, `app_settings`
- Triggers on `purchases`/`payments` (INSERT / UPDATE / DELETE / soft-delete flip) atomically apply deltas to `vendors.current_balance` and `vaults.current_balance` — edits and deletes reverse cleanly by construction
- A cash/partial purchase auto-creates a linked `payments` row (`source_purchase_id`) so ALL vault deductions flow through one path
- RLS on every table; GRANTs to authenticated + service_role
- Storage: private `purchase-images`, `payment-images` buckets (signed URLs)

### Phase 4 — Modules (full CRUD; cascading Restaurant → Vendor/Vault everywhere)
Dashboard · Restaurants · Vendors · Vaults · Purchases · Payments · Vendor Ledger · Report · Settings
- **Vendor Ledger**: SQL view w/ running balance, date filter, PDF export
- **Report**: SQL fn `restaurant_vendor_report(restaurant_id, from, to)` + cash-in-hand summary + PDF

### Phase 5 — Cross-cutting
Image upload (jpg/png/pdf, size cap) + lightbox · currency formatter from settings · skeletons + empty states · destructive-action confirmations · responsive (desktop + tablet) · PDFs via `jspdf` + `jspdf-autotable`

---

### 🔒 Locked confirmations (per your review)

1. **Report shape — locked.** `restaurant_vendor_report(restaurant_id, from_date, to_date)` returns one row per vendor with EXACTLY these columns, in this order:
   `vendor_name | opening_balance | total_purchased | total_paid | current_balance | total (= opening_balance + current_balance)`
   The UI table renders these columns 1:1 and appends a **totals row** summing every numeric column (opening, purchased, paid, current, total). PDF export mirrors the same shape including the totals row.

2. **Delete rules for Restaurants, Vendors, Vaults — locked.** For all three: if the entity has any related transactions (purchases, payments, or vault movements) OR a non-zero current balance, hard delete is **blocked**; the confirmation dialog only offers **Deactivate** (soft delete via `is_active = false`). Deactivated records remain fully visible in Vendor Ledger and Report history. Enforced in DB (trigger raising an exception on hard delete when history exists) AND in the UI dialog copy — same rule for all three entities, not just purchases/payments.

3. **Search & filter coverage — locked.**
   - **Purchases**: restaurant, vendor, vault, date range, amount range (min/max), payment type (cash/credit/partial), free-text on details
   - **Payments**: restaurant, vault, vendor, date range, amount range, free-text on note
   - **Vendors**: name (search), phone, restaurant, status (active/inactive)
   - **Vaults**: name (search), restaurant, status (active/inactive)
   - **Restaurants**: name, status
   All lists paginated, sortable on every numeric/date column.

4. **Payment edit/delete rebalancing — locked.** Payments use the **same trigger system** as purchases: `AFTER INSERT/UPDATE/DELETE` on `payments` (including soft-delete flips) applies deltas to BOTH `vendors.current_balance` (increase back the payable) AND `vaults.current_balance` (return the cash). Editing amount / vendor / vault correctly reverses the old row's effect and applies the new one in a single transaction. Verified end-to-end in the QA checklist (scenarios 6 and 7 from your spec).

5. **Overpayment warnings — locked.** In the Payment form, on vendor select the vendor's outstanding balance is shown live; on vault select the vault's current cash is shown live. Before submit:
   - If `amount > vendor.current_balance` → inline warning: *"Payment exceeds vendor's outstanding balance of {X}. This will create a credit for the vendor. Continue?"* — requires explicit confirm.
   - If `amount > vault.current_balance` → inline warning: *"Payment exceeds vault's available cash of {Y}. This will push the vault negative. Continue?"* — requires explicit confirm.
   Both warnings can fire together; neither silently blocks nor silently allows. Same pattern applied to the cash/partial portion of the Purchase form.

---

### Technical details
- **Stack**: TanStack Start + React + TS + Tailwind v4 + shadcn/ui + Lovable Cloud
- **Balance integrity**: DB triggers only — client never writes balance columns
- **Ledger view**: union of opening + credit portions of purchases + payments, with window-function running balance
- **Auth**: managed `_authenticated` gate; server fns via `createServerFn` + `requireSupabaseAuth`
- **Activity log**: generic trigger writing before/after JSONB + `auth.uid()`

### Scope note
Large build (9 modules, ~7 tables, triggers, 2 PDF exports, storage, roles, audit). I'll ship in phase order so each layer is verified before the next, and flag anything deferred (e.g., logo image upload vs. text-only business name on PDFs) explicitly rather than silently cutting scope.
