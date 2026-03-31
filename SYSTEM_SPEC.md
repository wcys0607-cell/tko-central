# TKO Operations Hub — System Specification

> **Project:** TKO Operations Hub
> **Company:** Top Kim Oil Sdn. Bhd. (petroleum supplier, Senai, Johor)
> **Builder:** Wilson Chong (using Claude Code — not a coder)
> **Date:** 30 March 2026
> **Replaces:** 4 AppSheet apps + 7 Google Apps Scripts + 4 Google Spreadsheets

---

## 1. Project Overview

TKO Operations Hub is a single web application that replaces:

- **Order Log Book** (AppSheet) — 2,694 orders, 34 columns, 2,317 customers
- **Stock Control** (AppSheet) — 2,698 stock transactions, 15 storage locations
- **Fleet Management** (AppSheet) — 997 vehicles, 140 documents, 999 maintenance logs
- **Driver & Maintenance** (AppSheet) — 492 checklists, 1,792 driver records

Plus 7 Google Apps Script files handling: WhatsApp alerts, stock sync, report generation, recurring orders, fleet expiry alerts, driver maintenance alerts.

### Why replace AppSheet?

- 4 separate spreadsheets with duplicated data (customers in 3 places, vehicles in 3 places)
- 7 AppScript files with hardcoded API tokens, phone numbers, and spreadsheet IDs
- Manual stock sync (button-click + date entry) that breaks if forgotten
- Zero connection to Bukku accounting — every invoice typed manually
- Report generation requires 6+ manual steps every month-end
- Google Sheets slows down as data grows

### What we are building

One web app with role-based views. Deployed on Vercel, backed by Supabase (PostgreSQL). Integrates with Bukku accounting API and OnSend WhatsApp API.

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | React-based, SSR, API routes built-in, deploys to Vercel |
| UI | Tailwind CSS + shadcn/ui | Fast styling, professional components, mobile-responsive |
| Database | Supabase (PostgreSQL) | Free tier handles this scale. RLS, real-time, built-in auth |
| Auth | Supabase Auth | Email/password. Roles: Admin, Manager, Office, Driver |
| Hosting | Vercel | Auto-deploy from GitHub. Free tier sufficient |
| Accounting | Bukku API (REST) | Read contacts/products/invoices, create invoices/DOs |
| WhatsApp | OnSend API | Already working in current system |
| Storage | Supabase Storage | Driver checklist photos, vehicle doc scans, report PDFs |

---

## 3. Database Schema

All tables use UUID primary keys, `created_at` / `updated_at` timestamps, and soft-delete (`deleted_at` nullable).

### 3.1 customers

Master customer list. Single source of truth — synced with Bukku Contacts.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| name | TEXT NOT NULL | Company/customer name (UPPERCASE) |
| short_name | TEXT | For display in mobile views |
| address | TEXT | Delivery address |
| phone | TEXT | Contact phone |
| email | TEXT | Contact email |
| tin_number | TEXT | Tax ID for e-invoicing (LHDN) |
| credit_limit | DECIMAL(12,2) | Maximum outstanding allowed |
| payment_terms | INTEGER | Days (e.g., 30, 60) |
| middle_man_id | UUID (FK) | References agents/middlemen (self-referencing customers table or separate) |
| bukku_contact_id | INTEGER | Bukku API contact ID for sync |
| bukku_sync_status | TEXT | synced / pending / error |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### 3.2 products

Fuel types and services. Synced with Bukku Products.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| name | TEXT NOT NULL | Diesel, ADO, R95, Euro 5, Lubricant |
| unit | TEXT | Liters, KG |
| default_price | DECIMAL(10,4) | Default selling price per unit |
| sst_rate | DECIMAL(5,2) | SST percentage (6% for fuel) |
| bukku_product_id | INTEGER | Bukku API product ID |
| classification_code | TEXT | LHDN e-invoice product classification |
| is_active | BOOLEAN | DEFAULT true |

### 3.3 drivers

All drivers and staff. Linked to Supabase Auth for login.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| auth_user_id | UUID (FK) | Links to Supabase auth.users for login |
| name | TEXT NOT NULL | Display name |
| ic_number | TEXT | Malaysian IC |
| phone | TEXT | WhatsApp number (60xxxxxxxxx format) |
| email | TEXT | For sharing (optional) |
| role | TEXT | admin / manager / office / driver |
| assigned_vehicle_id | UUID (FK) | Current primary vehicle |
| is_active | BOOLEAN | DEFAULT true |

### 3.4 vehicles

Fleet registry. Trucks, tankers, company vehicles.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| plate_number | TEXT NOT NULL UNIQUE | e.g., JXR6367 |
| type | TEXT | Road Tanker / Mini Tanker / Trailer / Car / Excavator |
| capacity_liters | INTEGER | Fuel capacity (for tankers) |
| owner | TEXT | Company / Partner |
| is_active | BOOLEAN | DEFAULT true |

### 3.5 orders

**The core table.** Every fuel delivery order. Replaces Order Log sheet (34 columns, 2,694+ rows).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| order_date | DATE NOT NULL | Delivery date |
| customer_id | UUID (FK) | References customers |
| destination | TEXT | Delivery address/site name |
| product_id | UUID (FK) | References products (fuel type) |
| quantity_liters | DECIMAL(10,2) | Order quantity |
| unit_price | DECIMAL(10,4) | Selling price per liter |
| total_sale | DECIMAL(12,2) | Computed: qty × unit_price |
| sst_amount | DECIMAL(10,2) | Computed: total_sale × sst_rate |
| cost_price | DECIMAL(10,4) | Cost/agent price per liter |
| load_from | TEXT | Store / Caltex / Petronas / Direct |
| driver_id | UUID (FK) | Assigned driver |
| vehicle_id | UUID (FK) | Assigned truck |
| dn_number | TEXT | Delivery Note number |
| invoice_number | TEXT | Invoice number |
| status | TEXT | pending / approved / rejected / delivered / cancelled |
| acceptance | TEXT | Manager approval status |
| order_type | TEXT | own / agent |
| middle_man_id | UUID (FK) | Commission agent |
| commission_rate | DECIMAL(10,4) | Per-liter commission |
| remark | TEXT | Free-text notes |
| created_by | UUID (FK) | User who created |
| approved_by | UUID (FK) | Manager who approved |
| bukku_invoice_id | INTEGER | Bukku invoice ID after sync |
| bukku_sync_status | TEXT | pending / synced / error / skipped |
| stock_sync_status | TEXT | pending / synced |
| smart_do_number | TEXT | For SmartStream orders |
| references_number | TEXT | For SmartStream |
| document_number | TEXT | For SmartStream |
| wages | DECIMAL(10,2) | Driver wages for this delivery |
| allowance | DECIMAL(10,2) | Driver allowance |
| transport | DECIMAL(10,2) | Transport charge |
| r95_liters | DECIMAL(10,2) | R95 portion (SmartStream split) |
| ado_liters | DECIMAL(10,2) | ADO portion (SmartStream split) |

### 3.6 stock_locations

Physical storage — tanks, trucks, drums. Replaces Locations sheet (15 locations).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| code | TEXT NOT NULL UNIQUE | T_A, T_B, T_C, T_D, T_E, T_F, T_G, T_H, V_Trailer, V_JXR6367, D_Drum, M_Meter, T_Euro5 |
| name | TEXT | Display name (Tank A, Trailer, etc.) |
| type | TEXT | tank / vehicle / drum / meter |
| capacity_liters | INTEGER | Max capacity |
| initial_balance | DECIMAL(10,2) | Starting balance for calculations |
| current_balance | DECIMAL(10,2) | Running balance from transactions |
| low_threshold | DECIMAL(10,2) | Alert when below this |
| owner | TEXT | Company / Partner |

### 3.7 stock_transactions

Every fuel movement. Replaces Transactions sheet (2,698+ rows). Auto-created from approved orders.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| transaction_date | TIMESTAMPTZ | When this happened |
| type | TEXT | purchase / sale / transfer / adjustment |
| source_location_id | UUID (FK) | Where fuel came from |
| dest_location_id | UUID (FK) | Where fuel went to |
| quantity_liters | DECIMAL(10,2) | Amount moved |
| price_per_liter | DECIMAL(10,4) | For WAC calculation |
| order_id | UUID (FK) | Linked order (if from order sync) |
| customer_name | TEXT | Denormalized for quick display |
| reference | TEXT | Invoice/DN number |
| owner | TEXT | Company / Partner |
| notes | TEXT | Free-text |
| created_by | UUID (FK) | User who created |
| running_total_qty | DECIMAL(12,2) | Running total after this transaction |
| running_total_value | DECIMAL(14,2) | Running value after this transaction |
| running_avg_cost | DECIMAL(10,4) | WAC after this transaction |

### 3.8 stock_history

Daily closing balances per location. Generated by nightly cron.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| date | DATE | Closing date |
| location_id | UUID (FK) | References stock_locations |
| closing_balance | DECIMAL(10,2) | Balance at end of day |
| company_qty | DECIMAL(10,2) | Company-owned portion |
| company_value | DECIMAL(12,2) | Company stock value |
| partner_qty | DECIMAL(10,2) | Partner-owned portion |
| partner_value | DECIMAL(12,2) | Partner stock value |

### 3.9 stock_takes

Physical inventory counts (dip-stick). 77 existing records.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| date | DATE | Stock take date |
| location_id | UUID (FK) | Which tank/location |
| measured_liters | DECIMAL(10,2) | Physical measurement |
| system_liters | DECIMAL(10,2) | What system says |
| variance | DECIMAL(10,2) | measured - system |
| photo_url | TEXT | Photo in Supabase Storage |
| taken_by | UUID (FK) | Who measured |
| notes | TEXT | |

### 3.10 fleet_documents

Vehicle documents with expiry tracking. 140 records.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| vehicle_id | UUID (FK) | References vehicles |
| doc_type | TEXT | Road Tax / Insurance / Puspakom / SPAD Permit / Grant |
| expiry_date | DATE | When it expires |
| days_remaining | INTEGER | Computed daily |
| status | TEXT | valid / expiring_soon / expired |
| document_url | TEXT | Scan/photo in Supabase Storage |
| alert_sent | BOOLEAN | Prevent duplicate WhatsApp alerts |
| last_alert_date | DATE | When last alert sent |
| updated_by | UUID (FK) | Who last updated |

### 3.11 maintenance_logs

Vehicle service records. 999 existing. Odometer-based maintenance.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| vehicle_id | UUID (FK) | References vehicles |
| service_date | DATE | When service done |
| odometer | INTEGER | ODO reading at service |
| service_type | TEXT | Engine Oil / Gear Oil / Steering Oil / Diesel Filter / Tyre / Other |
| next_service_odo | INTEGER | ODO when next service due |
| mechanic | TEXT | Who did the work |
| cost | DECIMAL(10,2) | Service cost |
| gps_location | TEXT | GPS coordinates |
| notes | TEXT | |
| created_by | UUID (FK) | |

### 3.12 driver_checklists

Daily pre-trip vehicle inspections. 492 existing.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| driver_id | UUID (FK) | References drivers |
| vehicle_id | UUID (FK) | References vehicles |
| check_date | TIMESTAMPTZ | When inspection done |
| odometer | INTEGER | Current ODO reading |
| tyres_ok | BOOLEAN | |
| brakes_ok | BOOLEAN | |
| engine_oil_ok | BOOLEAN | |
| coolant_ok | BOOLEAN | |
| lights_ok | BOOLEAN | |
| fire_extinguisher_ok | BOOLEAN | |
| has_defect | BOOLEAN | Any defect found? |
| defect_details | TEXT | Description |
| defect_photo_url | TEXT | Photo in Supabase Storage |

### 3.13 recurring_rules

Auto-generate orders on schedule. 5 existing rules.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| customer_id | UUID (FK) | References customers |
| destination | TEXT | Default destination |
| quantity_liters | DECIMAL(10,2) | Default qty |
| remark | TEXT | Default remark |
| trigger_day | TEXT | Monday / Tuesday / ... / Sunday |
| day_offset | INTEGER | Days after trigger for delivery date (0=same day, 1=next day) |
| is_active | BOOLEAN | DEFAULT true |

### 3.14 commissions

Agent/middleman commission tracking. Computed from orders.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| order_id | UUID (FK) | References orders |
| agent_id | UUID (FK) | References customers (middleman) |
| agent_name | TEXT | Denormalized |
| quantity_liters | DECIMAL(10,2) | From order |
| unit_price | DECIMAL(10,4) | Sale price |
| cost_to_agent | DECIMAL(10,4) | Agent cost price |
| commission_per_liter | DECIMAL(10,4) | unit_price - cost_to_agent |
| total_commission | DECIMAL(12,2) | qty × commission_per_liter |
| month | TEXT | YYYY-MM for grouping |
| payment_status | TEXT | unpaid / paid |

### 3.15 notifications_log

Track all WhatsApp messages sent. Prevents duplicates, audit trail.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| type | TEXT | order_urgent / fleet_expiry / maintenance_due / report_sent / invoice_created |
| recipient_phone | TEXT | Phone number |
| recipient_name | TEXT | Display name |
| message | TEXT | Full content |
| reference_id | UUID | Order/vehicle/doc ID that triggered it |
| status | TEXT | sent / failed |
| sent_at | TIMESTAMPTZ | When sent |

### 3.16 app_config

Centralized configuration. No more hardcoded values.

| Key | Value | Description |
|-----|-------|-------------|
| BUKKU_API_TOKEN | (token) | Bukku API bearer token |
| BUKKU_BASE_URL | https://yourcompany.bukku.my/api | Bukku API base URL |
| ONSEND_API_TOKEN | (token) | OnSend WhatsApp API token |
| ONSEND_INSTANCE_ID | +60186678007 | OnSend instance |
| ALERT_FLEET_EXPIRY_DAYS | 30 | Days before expiry to alert |
| ALERT_STOCK_LOW_THRESHOLD | 5000 | Liters — alert when below |
| MANAGER_PHONE | 60127681224 | Nelson |
| ADMIN_PHONE | 60175502007 | Wilson |
| DEFAULT_SST_RATE | 6 | SST percentage |
| DEFAULT_PAYMENT_TERMS | 30 | Days |
| BIG_ORDER_THRESHOLD | 5000 | Liters — triggers WhatsApp alert |
| LATE_ENTRY_CUTOFF_HOUR | 17 | After 5pm = late entry |
| PENDING_TIMEOUT_MINUTES | 60 | Alert if not approved within this |

---

## 4. Application Pages & User Flows

### 4.1 Roles & Access

| Role | Users | Access |
|------|-------|--------|
| Admin | Wilson | Everything. Settings, Bukku sync, reports, all data |
| Manager | Nelson | Orders (approve/reject), stock, fleet, reports. No settings |
| Office | Suria, Yvonne | Create/edit orders, view stock, view fleet |
| Driver | Hilmi, Hamizan, Azmi, Sobree, Noh, etc. | Own checklists, own orders/wages. Mobile-first |

### 4.2 Dashboard (Admin/Manager)

- Today's orders: count, total liters, total revenue, pending approvals
- Stock overview: all tank levels as visual gauges, low-stock warnings
- Fleet status: vehicles with expiring documents (red/yellow/green)
- Revenue chart: daily/weekly/monthly with Bukku data
- Outstanding invoices: total unpaid, overdue count, aging breakdown
- Quick actions: approve orders, sync Bukku, generate reports

### 4.3 Orders (Admin/Manager/Office)

- List view: filterable by date, customer, status, driver. Searchable
- Create order form: customer dropdown, destination, qty, price, load-from, driver, truck, remark
- Order detail: full info + Bukku invoice status + stock sync status + commission
- Approve/Reject buttons for Manager (triggers WhatsApp to creator)
- Bulk actions: approve multiple, export to Excel
- SmartStream sub-view: filtered for SmartStream orders with extra columns (DO No, References No, Document No, R95, ADO)
- Recurring rules management page

### 4.4 Stock Control (Admin/Manager/Office)

- Tank dashboard: visual representation of all 15 locations with fill-level bars
- Transaction log: all movements, filterable by date/type/location
- Manual entry: for purchases, transfers, adjustments not from orders
- Stock take: enter physical measurements, auto-compare with system, flag variances
- History chart: stock levels over time per tank (line chart)
- WAC (weighted average cost) display per owner (Company / Partner)

### 4.5 Fleet Management (Admin/Manager)

- Vehicle list: plate number, type, capacity, status, assigned driver
- Document tracker: grid view of all docs per vehicle with color-coded expiry (green >30 days, yellow 7-30, red <7 or expired)
- Maintenance log: filterable by vehicle, date, service type
- Next-service calculator: current ODO vs next_service_odo
- Add/edit vehicle and documents

### 4.6 Driver Portal (Driver role — mobile-first)

- Daily checklist form: big buttons for OK/Not OK, photo upload for defects
- My orders today: see assigned deliveries, mark as delivered
- My wages: view monthly wage statements (replaces Google Drive sharing)
- Submit ODO reading: for maintenance tracking

### 4.7 Reports (Admin/Manager)

- Wages report: per driver, per month. Auto-generated, downloadable as Excel
- Commission report: per agent, per month. With customer breakdown
- SmartStream statement: per truck, per month
- Sales summary: by customer, by product, by period
- Stock report: current levels, movement summary, variance report
- Fleet report: upcoming renewals, maintenance due, cost summary
- All reports exportable as Excel/PDF and shareable via WhatsApp

### 4.8 Bukku Sync (Admin)

- Sync dashboard: status of contact sync, product sync, invoice sync
- Manual sync buttons: pull contacts, pull products, push invoices
- Error log: any failed syncs with retry button
- Mapping view: which customers/products are linked to Bukku IDs
- Payment status: pulled from Bukku, shown on orders

### 4.9 Settings (Admin only)

- App config: edit all config values (API keys, thresholds, phones)
- User management: add/edit/deactivate users, assign roles
- WhatsApp log: all messages sent, with status and timestamps
- Audit log: who changed what, when

---

## 5. Bukku API Integration

**Base URL:** `https://{subdomain}.bukku.my/api`
**Auth:** Bearer token in Authorization header
**Policy:** Start READ ONLY. Test thoroughly before enabling WRITE.

### 5.1 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| GET /contacts | GET | Sync customer list, get Bukku IDs, TIN |
| GET /products | GET | Sync fuel products, get Bukku IDs |
| GET /sales/invoices | GET | Pull invoice status (Paid/Unpaid), amounts |
| GET /sales/payments | GET | Pull payment records for reconciliation |
| POST /sales/invoices | POST | Create invoice from approved order (Phase 5) |
| POST /sales/delivery_orders | POST | Create DO linked to invoice (Phase 5) |
| GET /accounts | GET | Chart of accounts for reporting |

### 5.2 Contact Sync Flow

1. GET /contacts from Bukku (paginated)
2. Match by name to customers table
3. If match: store bukku_contact_id, update TIN if missing
4. If no match: create customer record from Bukku data
5. Set bukku_sync_status = 'synced'

### 5.3 Invoice Creation Flow

1. Order marked 'approved' and bukku_sync_status = 'pending'
2. Look up bukku_contact_id from customer
3. Look up bukku_product_id from product
4. POST /sales/invoices with line items (qty, unit_price, SST)
5. Store returned invoice_id as bukku_invoice_id on order
6. Set bukku_sync_status = 'synced'
7. Send WhatsApp confirmation to admin

### 5.4 Payment Status Flow

1. Cron runs every 30 minutes
2. GET /sales/invoices?status=unpaid for recent invoices
3. Update order payment status (paid/partial/unpaid/overdue)
4. If overdue > 30 days: WhatsApp alert to admin

---

## 6. WhatsApp Notifications (OnSend API)

**Endpoint:** POST https://onsend.io/api/v1/send
**Auth:** Bearer token

| Event | Recipients | Trigger |
|-------|-----------|---------|
| Urgent order (today/late/weekend) | Nelson (Manager) | Immediately on order create/edit |
| Order rejected | Creator | Immediately on rejection |
| Pending > 1 hour (today orders only) | Creator | Cron every 30 min |
| Big order > 5000L | Nelson | On create |
| Fleet doc expiring (<30 days) | Wilson, Nelson, Ck Chen (Road Tax/Insurance only) | Daily 8am |
| Fleet doc updated | Ck Chen (Puspakom only) | On update |
| Maintenance due (ODO threshold) | Nelson, Fook | On checklist submit |
| Vehicle defect found | Nelson, Fook | On checklist submit |
| Invoice created in Bukku | Wilson | After sync |
| Overdue invoice > 30 days | Wilson | Daily check |
| Wages report ready | Each driver individually | Monthly |
| Low stock alert | Wilson, Nelson | When tank below threshold |

### Recipient Contact Details (move to app_config)

| Person | Phone | Role |
|--------|-------|------|
| Wilson | 60175502007 | Admin |
| Nelson | 60127681224 | Manager |
| Suria | 60174318992 | Office |
| Yvonne | 60167178334 | Office |
| Fook | 60197260488 | Driver/Mechanic |
| Ck Chen | 60137535544 | External (fleet vendor) |

---

## 7. Auto Stock Sync Logic

**Critical business logic.** When an order is created or approved, the system automatically creates a stock transaction.

### Rules:

1. **PURCHASE (Stock In):** Customer name contains "TOP KIM" AND destination = "STORE" → type='purchase', dest=T_A (default tank)
2. **SALE from STORE:** Load-from = "Store" → type='sale', source=T_A
3. **SALE from TRUCK:** Load-from = truck name (e.g., "JXR6367 - Hilmi") → type='sale', source=V_{plate}
4. **DIRECT DELIVERY (no stock impact):** Load-from = "Caltex" / "Petronas" / "Petron" → NO stock transaction
5. **TRANSPORT ONLY (skip):** Unit price < RM 0.50 → No fuel sale, skip stock sync

### WAC (Weighted Average Cost) Calculation:

Separate tracking for Company and Partner ownership:

- **Purchase:** total_qty += liters; total_value += (liters × price)
- **Sale:** avg_cost = total_value / total_qty; then total_qty -= liters; total_value -= (liters × avg_cost)
- **Adjustment (+):** total_qty += liters (value unchanged)
- **Adjustment (-):** same as sale logic (uses current avg cost)

**This MUST be a Supabase database function / RPC, NOT client-side JavaScript.**

---

## 8. Background Jobs (Cron / Edge Functions)

| Function | Schedule | What It Does |
|----------|----------|-------------|
| sync-bukku-invoices | Every 15 min | Push approved orders to Bukku, pull payment status |
| check-pending-orders | Every 30 min | Find orders pending > 1 hour, send WhatsApp |
| generate-recurring-orders | Daily 5am | Create orders from recurring_rules |
| check-fleet-documents | Daily 8am | Check expiry dates, send WhatsApp alerts |
| calculate-stock-history | Daily 11:59pm | Snapshot closing balances to stock_history |
| generate-monthly-reports | 1st of month 6am | Generate wages, commissions, SmartStream reports |
| sync-bukku-contacts | Daily 2am | Pull updated contacts/products from Bukku |

---

## 9. Build Phases

### Phase 1: Foundation
1. Create Next.js project with TypeScript, Tailwind, shadcn/ui
2. Set up Supabase project, run all CREATE TABLE migrations
3. Set up Row Level Security (RLS) per role
4. Implement Supabase Auth (login page, role-based middleware)
5. Build app shell: sidebar navigation, role-based menu, responsive layout
6. Build Settings page: app_config CRUD, user management
7. Deploy to Vercel

### Phase 2: Orders Module
1. Orders list page with filters (date, customer, status, driver)
2. Create/edit order form with dropdowns
3. Order detail page
4. Approve/reject workflow for Manager
5. Auto stock sync: Supabase trigger on order insert/update (implement the 5 rules from Section 7)
6. WhatsApp notifications for urgent/late/rejected orders
7. Recurring rules page + cron function
8. **Data migration:** Import customers, drivers, vehicles, orders from existing spreadsheets

### Phase 3: Stock Control Module
1. Tank dashboard with visual fill-level gauges
2. Transaction log with filters
3. Manual transaction entry (purchase, transfer, adjustment)
4. Stock take form with variance calculation
5. WAC calculation as Supabase RPC function
6. Stock history chart
7. Low stock WhatsApp alerts
8. **Data migration:** Import stock transactions, history, stock takes

### Phase 4: Fleet + Driver Module
1. Vehicle list and detail pages
2. Document tracker with expiry color-coding
3. Maintenance log page
4. Driver checklist form (mobile-first, photo upload)
5. Driver portal: my orders, my wages, my checklist
6. Fleet expiry cron + WhatsApp alerts
7. Maintenance due alerts based on ODO
8. **Data migration:** Import vehicles, documents, maintenance logs, checklists

### Phase 5: Bukku Integration
1. Bukku sync settings page
2. Contact sync: pull from Bukku, match to customers
3. Product sync: pull from Bukku, match to products
4. Invoice creation: approved order → POST /sales/invoices
5. Payment status pull from Bukku
6. Overdue invoice alerts
7. Sync error log + retry

### Phase 6: Reports + Dashboard
1. Management dashboard (today's orders, stock, fleet, revenue)
2. Wages report generator (per driver/month, Excel export)
3. Commission report generator (per agent/month)
4. SmartStream statement generator
5. Sales summary with charts
6. Auto-generation cron (1st of month)
7. WhatsApp distribution of reports to drivers

---

## 10. Important Rules

### Bukku API
- Start READ ONLY (GET requests). Test before enabling WRITE (POST)
- Always log every API call
- Never auto-delete or update existing Bukku records — only create new ones
- Sync must be idempotent (running twice = same result)

### Data Integrity
- Never delete orders — use status='cancelled'
- All stock calculations happen server-side (Supabase function), never client-side
- Every WhatsApp message logged in notifications_log
- Bukku sync must be idempotent

### Mobile-First for Drivers
- Driver portal must work perfectly on phone browser
- Big buttons, minimal typing, camera access for photos
- Drivers bookmark URL on phone home screen

### WhatsApp Message Format
- Keep existing format: bold (*text*), emoji prefixes
- Bilingual (English + Malay) for driver messages
- Trilingual (+ Chinese) for wages messages

### Offline Handling
- Checklist form should handle poor signal gracefully
- Queue locally and sync when online, or clear error message
- Never lose data silently

---

## 11. Data Migration Reference

When migrating data, read these existing spreadsheet files:

| Source | Sheet | Target Table | Rows |
|--------|-------|-------------|------|
| Order Log Book.xlsx | Customer List | customers | 2,317 |
| Order Log Book.xlsx | Driver List | drivers | 13 |
| Order Log Book.xlsx | Vehicle List | vehicles | 14 |
| Order Log Book.xlsx | Order Log | orders | 2,694 |
| Order Log Book.xlsx | Recurring Rules | recurring_rules | 5 |
| Stock Control DB.xlsx | Locations | stock_locations | 15 |
| Stock Control DB.xlsx | Transactions | stock_transactions | 2,698 |
| Stock Control DB.xlsx | Daily_Stock_History | stock_history | 1,455 |
| Stock Control DB.xlsx | Stock_Takes | stock_takes | 77 |
| TKO_Fleet_Database.xlsx | Vehicles | vehicles (merge) | 997 |
| TKO_Fleet_Database.xlsx | Documents | fleet_documents | 140 |
| TKO_Fleet_Database.xlsx | Maintenance_Logs | maintenance_logs | 999 |
| TKO_Fleet_Database.xlsx | Driver_Checklists | driver_checklists | 492 |
| TKO_Fleet_Database.xlsx | User | drivers (merge) | 998 |
| Driver Order Record.xlsx | Sheet1 | orders (merge) | 1,792 |

---

*End of specification.*
