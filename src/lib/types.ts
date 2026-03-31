// Database types for TKO Central

export interface Customer {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tin_number: string | null;
  credit_limit: number | null;
  payment_terms: number | null;
  middle_man_id: string | null;
  bukku_contact_id: number | null;
  bukku_sync_status: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  middle_man?: Pick<Customer, "id" | "name"> | null;
}

export interface Product {
  id: string;
  name: string;
  unit: string | null;
  default_price: number | null;
  sst_rate: number | null;
  bukku_product_id: number | null;
  classification_code: string | null;
  is_active: boolean;
}

export interface Driver {
  id: string;
  auth_user_id: string | null;
  name: string;
  ic_number: string | null;
  phone: string | null;
  email: string | null;
  role: "admin" | "manager" | "office" | "driver";
  assigned_vehicle_id: string | null;
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  type: string | null;
  capacity_liters: number | null;
  owner: string | null;
  is_active: boolean;
}

export interface Order {
  id: string;
  order_date: string;
  customer_id: string;
  destination: string | null;
  product_id: string | null;
  quantity_liters: number | null;
  unit_price: number | null;
  total_sale: number | null;
  sst_amount: number | null;
  cost_price: number | null;
  load_from: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  dn_number: string | null;
  invoice_number: string | null;
  status: "pending" | "approved" | "rejected" | "delivered" | "cancelled";
  acceptance: string | null;
  order_type: "own" | "agent" | null;
  middle_man_id: string | null;
  commission_rate: number | null;
  remark: string | null;
  created_by: string | null;
  approved_by: string | null;
  bukku_invoice_id: number | null;
  bukku_sync_status: "pending" | "synced" | "error" | "skipped" | null;
  bukku_payment_status: "paid" | "partial" | "unpaid" | "overdue" | null;
  stock_sync_status: "pending" | "synced" | null;
  smart_do_number: string | null;
  references_number: string | null;
  document_number: string | null;
  wages: number | null;
  allowance: number | null;
  transport: number | null;
  r95_liters: number | null;
  ado_liters: number | null;
  created_at: string;
  updated_at: string;
  // joined
  customer?: Pick<Customer, "id" | "name" | "short_name"> | null;
  product?: Pick<Product, "id" | "name" | "unit"> | null;
  driver?: Pick<Driver, "id" | "name"> | null;
  vehicle?: Pick<Vehicle, "id" | "plate_number"> | null;
  creator?: Pick<Driver, "id" | "name"> | null;
  approver?: Pick<Driver, "id" | "name"> | null;
}

export interface RecurringRule {
  id: string;
  customer_id: string;
  destination: string | null;
  quantity_liters: number | null;
  remark: string | null;
  trigger_day: string;
  day_offset: number;
  is_active: boolean;
  created_at: string;
  // joined
  customer?: Pick<Customer, "id" | "name"> | null;
}

export interface StockLocation {
  id: string;
  code: string;
  name: string | null;
  type: string | null;
  capacity_liters: number | null;
  initial_balance: number | null;
  current_balance: number | null;
  low_threshold: number | null;
  owner: string | null;
}

export interface StockTransaction {
  id: string;
  transaction_date: string;
  type: "purchase" | "sale" | "transfer" | "adjustment";
  source_location_id: string | null;
  dest_location_id: string | null;
  quantity_liters: number | null;
  price_per_liter: number | null;
  order_id: string | null;
  customer_name: string | null;
  reference: string | null;
  owner: string | null;
  notes: string | null;
  created_by: string | null;
  running_total_qty: number | null;
  running_total_value: number | null;
  running_avg_cost: number | null;
  created_at: string;
  // joined
  source_location?: Pick<StockLocation, "id" | "code" | "name"> | null;
  dest_location?: Pick<StockLocation, "id" | "code" | "name"> | null;
}

export interface StockHistory {
  id: string;
  date: string;
  location_id: string;
  closing_balance: number | null;
  company_qty: number | null;
  company_value: number | null;
  partner_qty: number | null;
  partner_value: number | null;
  created_at: string;
  // joined
  location?: Pick<StockLocation, "id" | "code" | "name"> | null;
}

export interface StockTake {
  id: string;
  date: string;
  location_id: string;
  measured_liters: number | null;
  system_liters: number | null;
  variance: number | null;
  photo_url: string | null;
  taken_by: string | null;
  notes: string | null;
  created_at: string;
  // joined
  location?: Pick<StockLocation, "id" | "code" | "name"> | null;
  taker?: Pick<Driver, "id" | "name"> | null;
}

export interface FleetDocument {
  id: string;
  vehicle_id: string;
  doc_type: string;
  expiry_date: string | null;
  days_remaining: number | null;
  status: "valid" | "expiring_soon" | "expired" | null;
  document_url: string | null;
  alert_sent: boolean;
  last_alert_date: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  vehicle?: Pick<Vehicle, "id" | "plate_number" | "type"> | null;
}

export interface MaintenanceLog {
  id: string;
  vehicle_id: string;
  service_date: string;
  odometer: number | null;
  service_type: string | null;
  next_service_odo: number | null;
  mechanic: string | null;
  cost: number | null;
  gps_location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // joined
  vehicle?: Pick<Vehicle, "id" | "plate_number"> | null;
}

export interface DriverChecklist {
  id: string;
  driver_id: string;
  vehicle_id: string;
  check_date: string;
  odometer: number | null;
  tyres_ok: boolean;
  brakes_ok: boolean;
  engine_oil_ok: boolean;
  coolant_ok: boolean;
  lights_ok: boolean;
  fire_extinguisher_ok: boolean;
  has_defect: boolean;
  defect_details: string | null;
  defect_photo_url: string | null;
  created_at: string;
  // joined
  driver?: Pick<Driver, "id" | "name"> | null;
  vehicle?: Pick<Vehicle, "id" | "plate_number"> | null;
}

export interface AppConfig {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}
