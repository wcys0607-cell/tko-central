# Phase 1: Foundation — Database + Auth + App Shell

## Context

I'm building a web app called **TKO Operations Hub** for my fuel delivery company Top Kim Oil Sdn. Bhd. This app will replace 4 AppSheet apps + 7 Google Apps Scripts + 4 Google Spreadsheets that currently run our operations (orders, stock control, fleet management, driver checklists).

**Tech stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL + Auth), Tailwind CSS + shadcn/ui, deployed on Vercel.

Read the full system specification in `SYSTEM_SPEC.md` in this project folder for complete database schema and all business logic details.

This is Phase 1 — set up the project foundation. Do NOT build any business modules yet (orders, stock, fleet, etc). Just the skeleton.

---

## Tasks for This Session

### 1. Create Next.js Project

```
npx create-next-app@latest tko-ops-hub --typescript --tailwind --app --src-dir --import-alias "@/*"
```

Install shadcn/ui and set up these components: Button, Input, Card, Table, Dialog, Select, Badge, Tabs, Dropdown Menu, Avatar, Sidebar/Navigation.

### 2. Set Up Supabase

Connect to my Supabase project. I'll provide the URL and anon key.

Create all 16 database tables. Here are the SQL migrations to run:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  short_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  tin_number TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  payment_terms INTEGER DEFAULT 30,
  middle_man_id UUID REFERENCES customers(id),
  bukku_contact_id INTEGER,
  bukku_sync_status TEXT DEFAULT 'pending',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'Liters',
  default_price DECIMAL(10,4) DEFAULT 0,
  sst_rate DECIMAL(5,2) DEFAULT 6.00,
  bukku_product_id INTEGER,
  classification_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. vehicles (must be before drivers because drivers references vehicles)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plate_number TEXT NOT NULL UNIQUE,
  type TEXT,
  capacity_liters INTEGER,
  owner TEXT DEFAULT 'Company',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. drivers
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID,
  name TEXT NOT NULL,
  ic_number TEXT,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'driver' CHECK (role IN ('admin', 'manager', 'office', 'driver')),
  assigned_vehicle_id UUID REFERENCES vehicles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. stock_locations
CREATE TABLE stock_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  type TEXT CHECK (type IN ('tank', 'vehicle', 'drum', 'meter')),
  capacity_liters INTEGER,
  initial_balance DECIMAL(10,2) DEFAULT 0,
  current_balance DECIMAL(10,2) DEFAULT 0,
  low_threshold DECIMAL(10,2) DEFAULT 5000,
  owner TEXT DEFAULT 'Company',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. orders (the big one)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_date DATE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  destination TEXT,
  product_id UUID REFERENCES products(id),
  quantity_liters DECIMAL(10,2),
  unit_price DECIMAL(10,4),
  total_sale DECIMAL(12,2),
  sst_amount DECIMAL(10,2),
  cost_price DECIMAL(10,4),
  load_from TEXT,
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  dn_number TEXT,
  invoice_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'delivered', 'cancelled')),
  acceptance TEXT,
  order_type TEXT DEFAULT 'own',
  middle_man_id UUID REFERENCES customers(id),
  commission_rate DECIMAL(10,4),
  remark TEXT,
  created_by UUID REFERENCES drivers(id),
  approved_by UUID REFERENCES drivers(id),
  bukku_invoice_id INTEGER,
  bukku_sync_status TEXT DEFAULT 'pending',
  stock_sync_status TEXT DEFAULT 'pending',
  smart_do_number TEXT,
  references_number TEXT,
  document_number TEXT,
  wages DECIMAL(10,2) DEFAULT 0,
  allowance DECIMAL(10,2) DEFAULT 0,
  transport DECIMAL(10,2) DEFAULT 0,
  r95_liters DECIMAL(10,2),
  ado_liters DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. stock_transactions
CREATE TABLE stock_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_date TIMESTAMPTZ DEFAULT NOW(),
  type TEXT CHECK (type IN ('purchase', 'sale', 'transfer', 'adjustment')),
  source_location_id UUID REFERENCES stock_locations(id),
  dest_location_id UUID REFERENCES stock_locations(id),
  quantity_liters DECIMAL(10,2),
  price_per_liter DECIMAL(10,4),
  order_id UUID REFERENCES orders(id),
  customer_name TEXT,
  reference TEXT,
  owner TEXT DEFAULT 'Company',
  notes TEXT,
  created_by UUID REFERENCES drivers(id),
  running_total_qty DECIMAL(12,2),
  running_total_value DECIMAL(14,2),
  running_avg_cost DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. stock_history
CREATE TABLE stock_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE,
  location_id UUID REFERENCES stock_locations(id),
  closing_balance DECIMAL(10,2),
  company_qty DECIMAL(10,2),
  company_value DECIMAL(12,2),
  partner_qty DECIMAL(10,2),
  partner_value DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. stock_takes
CREATE TABLE stock_takes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE,
  location_id UUID REFERENCES stock_locations(id),
  measured_liters DECIMAL(10,2),
  system_liters DECIMAL(10,2),
  variance DECIMAL(10,2),
  photo_url TEXT,
  taken_by UUID REFERENCES drivers(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. fleet_documents
CREATE TABLE fleet_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id),
  doc_type TEXT,
  expiry_date DATE,
  days_remaining INTEGER,
  status TEXT DEFAULT 'valid',
  document_url TEXT,
  alert_sent BOOLEAN DEFAULT false,
  last_alert_date DATE,
  updated_by UUID REFERENCES drivers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. maintenance_logs
CREATE TABLE maintenance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id),
  service_date DATE,
  odometer INTEGER,
  service_type TEXT,
  next_service_odo INTEGER,
  mechanic TEXT,
  cost DECIMAL(10,2),
  gps_location TEXT,
  notes TEXT,
  created_by UUID REFERENCES drivers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. driver_checklists
CREATE TABLE driver_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  check_date TIMESTAMPTZ DEFAULT NOW(),
  odometer INTEGER,
  tyres_ok BOOLEAN DEFAULT true,
  brakes_ok BOOLEAN DEFAULT true,
  engine_oil_ok BOOLEAN DEFAULT true,
  coolant_ok BOOLEAN DEFAULT true,
  lights_ok BOOLEAN DEFAULT true,
  fire_extinguisher_ok BOOLEAN DEFAULT true,
  has_defect BOOLEAN DEFAULT false,
  defect_details TEXT,
  defect_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. recurring_rules
CREATE TABLE recurring_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  destination TEXT,
  quantity_liters DECIMAL(10,2),
  remark TEXT,
  trigger_day TEXT,
  day_offset INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. commissions
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  agent_id UUID REFERENCES customers(id),
  agent_name TEXT,
  quantity_liters DECIMAL(10,2),
  unit_price DECIMAL(10,4),
  cost_to_agent DECIMAL(10,4),
  commission_per_liter DECIMAL(10,4),
  total_commission DECIMAL(12,2),
  month TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. notifications_log
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT,
  recipient_phone TEXT,
  recipient_name TEXT,
  message TEXT,
  reference_id UUID,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. app_config
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config
INSERT INTO app_config (key, value, description) VALUES
  ('BUKKU_API_TOKEN', '', 'Bukku API bearer token'),
  ('BUKKU_BASE_URL', '', 'Bukku API base URL (e.g., https://yourcompany.bukku.my/api)'),
  ('ONSEND_API_TOKEN', '', 'OnSend WhatsApp API token'),
  ('ONSEND_INSTANCE_ID', '+60186678007', 'OnSend WhatsApp instance ID'),
  ('ALERT_FLEET_EXPIRY_DAYS', '30', 'Days before expiry to send alert'),
  ('ALERT_STOCK_LOW_THRESHOLD', '5000', 'Liters - alert when tank below this'),
  ('MANAGER_PHONE', '60127681224', 'Nelson phone for alerts'),
  ('ADMIN_PHONE', '60175502007', 'Wilson phone for alerts'),
  ('DEFAULT_SST_RATE', '6', 'SST percentage'),
  ('DEFAULT_PAYMENT_TERMS', '30', 'Default payment terms in days'),
  ('BIG_ORDER_THRESHOLD', '5000', 'Liters - triggers big order WhatsApp alert'),
  ('LATE_ENTRY_CUTOFF_HOUR', '17', 'After this hour = late entry for next day orders'),
  ('PENDING_TIMEOUT_MINUTES', '60', 'Minutes before pending order triggers timeout alert');

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_stock_locations_updated_at BEFORE UPDATE ON stock_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_fleet_documents_updated_at BEFORE UPDATE ON fleet_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_recurring_rules_updated_at BEFORE UPDATE ON recurring_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3. Set Up Row Level Security (RLS)

Enable RLS on all tables. Create policies:

- **Admin role:** Full access to all tables (SELECT, INSERT, UPDATE, DELETE)
- **Manager role:** Full access to orders, stock, fleet, reports. No access to app_config
- **Office role:** SELECT/INSERT/UPDATE on orders, customers. SELECT on stock, fleet
- **Driver role:** SELECT own records only (WHERE driver_id = auth.uid()). INSERT on driver_checklists

Store the user's role in the drivers table (role column). Use a Supabase function to check role:

```sql
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM drivers WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4. Implement Authentication

- Login page at `/login` — email + password form (clean, professional)
- After login, redirect based on role:
  - Admin/Manager → `/dashboard`
  - Office → `/orders`
  - Driver → `/driver`
- Create middleware to protect routes based on role
- Create a Supabase auth context/provider for the app

### 5. Build App Shell

Create a responsive layout with:

- **Sidebar navigation** (collapsible on mobile) with these menu items:

| Menu Item | Icon | Roles |
|-----------|------|-------|
| Dashboard | LayoutDashboard | admin, manager |
| Orders | ClipboardList | admin, manager, office |
| Stock Control | Fuel | admin, manager, office |
| Fleet | Truck | admin, manager |
| Driver Portal | User | driver |
| Reports | FileBarChart | admin, manager |
| Bukku Sync | RefreshCw | admin |
| Settings | Settings | admin |

- **Top bar** with: user name, role badge, logout button
- **Company branding:** "TKO Operations Hub" with accent color #E8A020 (gold) and primary #1A3A5C (dark blue)
- Each page should show a "Coming Soon" placeholder for now (except Settings)

### 6. Build Settings Page

Create `/settings` with two tabs:

**Tab 1: App Configuration**
- Table showing all app_config entries (key, value, description)
- Inline edit or modal edit for each value
- Save button that updates Supabase

**Tab 2: User Management**
- Table showing all drivers (name, email, phone, role, status)
- Add user button → form (name, email, password, phone, IC, role)
- Creating a user should: create Supabase auth user + insert into drivers table
- Edit and deactivate buttons

### 7. Deploy to Vercel

- Push to GitHub
- Connect to Vercel
- Set environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- Deploy and verify: login works, navigation works, settings page works

---

## Done Criteria

- [ ] Can open the Vercel URL in a browser
- [ ] Can log in with email/password
- [ ] See role-appropriate sidebar menu
- [ ] Settings page shows app_config values and can edit them
- [ ] Settings page can create/edit users
- [ ] All 16 database tables exist in Supabase
- [ ] "Coming Soon" placeholder pages for all menu items
