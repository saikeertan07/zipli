-- Migration 0011: Double-Entry Balanced General Ledger
-- Requirement: F-051 / Prompt Pack Part 5 Section 4
-- Enforces:
-- 1. Standard chart of accounts for grocery quick-commerce
-- 2. Strict integer paise denomination
-- 3. Deferred constraint trigger enforcing SUM(debit) == SUM(credit) and line count >= 2
-- 4. Complete immutability: UPDATE and DELETE strictly blocked on ledger tables

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Chart of Accounts Table
CREATE TABLE IF NOT EXISTS ledger_accounts (
  code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance VARCHAR(16) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Standard Quick-Commerce Accounts
INSERT INTO ledger_accounts (code, name, type, normal_balance, description) VALUES
  ('gateway_clearing', 'Payment Gateway Clearing', 'ASSET', 'DEBIT', 'Settlement receivables from payment gateways (Razorpay/Stripe)'),
  ('cash_in_transit', 'Cash on Delivery in Transit', 'ASSET', 'DEBIT', 'Cash collected by delivery riders awaiting deposit'),
  ('customer_wallet', 'Customer Wallet Deposits', 'LIABILITY', 'CREDIT', 'Customer pre-funded wallet liability balances'),
  ('store_payable', 'Dark Store Merchant Payables', 'LIABILITY', 'CREDIT', 'Net procurement and item payouts owed to fulfillment dark stores'),
  ('rider_payable', 'Delivery Rider Wage Payables', 'LIABILITY', 'CREDIT', 'Base delivery fees and distance wages owed to delivery riders'),
  ('rider_tip_payable', 'Rider Tips Payable', 'LIABILITY', 'CREDIT', '100% of customer tips held for pass-through to delivery riders'),
  ('tax_payable', 'GST / Tax Collections Payable', 'LIABILITY', 'CREDIT', 'Goods and services tax collected on orders owed to government'),
  ('platform_revenue', 'Platform Commission Revenue', 'REVENUE', 'CREDIT', 'Zipli platform take-rate / commission on fulfilled orders'),
  ('delivery_fee_revenue', 'Customer Delivery Fee Revenue', 'REVENUE', 'CREDIT', 'Delivery fees charged to customers'),
  ('promotional_expense', 'Promotional & Coupon Subsidies', 'EXPENSE', 'DEBIT', 'Discounts and promotional vouchers subsidized by Zipli'),
  ('refund_expense', 'Customer Refund & Dispute Write-offs', 'EXPENSE', 'DEBIT', 'Disputed orders or damaged goods write-offs funded by platform')
ON CONFLICT (code) DO NOTHING;

-- 2. Journal Entries (Header)
CREATE TABLE IF NOT EXISTS ledger_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number BIGSERIAL UNIQUE,
  reference_type VARCHAR(64) NOT NULL,
  reference_id VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_ref ON ledger_journal_entries (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_posted ON ledger_journal_entries (posted_at);

-- 3. Journal Lines (Debits and Credits in integer paise)
CREATE TABLE IF NOT EXISTS ledger_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES ledger_journal_entries(id) ON DELETE RESTRICT,
  account_code VARCHAR(64) NOT NULL REFERENCES ledger_accounts(code) ON DELETE RESTRICT,
  debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
  credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_debit_xor_credit CHECK (
    (debit_paise > 0 AND credit_paise = 0) OR
    (credit_paise > 0 AND debit_paise = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_lines_entry ON ledger_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_lines_account ON ledger_lines (account_code);

-- 4. Deferred Constraint Trigger Function: Enforce Balanced Debits == Credits
CREATE OR REPLACE FUNCTION fn_verify_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_debit BIGINT;
  v_credit BIGINT;
  v_count INT;
  v_entry_id UUID;
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);

  SELECT
    COALESCE(SUM(debit_paise), 0),
    COALESCE(SUM(credit_paise), 0),
    COUNT(*)
  INTO v_debit, v_credit, v_count
  FROM ledger_lines
  WHERE entry_id = v_entry_id;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Ledger transaction rejected: Journal entry % must contain at least 2 lines, found %',
      v_entry_id, v_count;
  END IF;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Ledger transaction rejected: Journal entry % is unbalanced. Total Debits: % paise, Total Credits: % paise (Diff: % paise)',
      v_entry_id, v_debit, v_credit, (v_debit - v_credit);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_journal_balance ON ledger_lines;
CREATE CONSTRAINT TRIGGER trg_verify_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON ledger_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_verify_journal_balance();

-- 5. Immutability Trigger: Prohibit UPDATE and DELETE on committed ledger records
CREATE OR REPLACE FUNCTION fn_prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger records are immutable. Operation % on table % is strictly prohibited. Use reversing journal entries to record adjustments.',
    TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_journal_entries ON ledger_journal_entries;
CREATE TRIGGER trg_immutable_journal_entries
BEFORE UPDATE OR DELETE ON ledger_journal_entries
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_modification();

DROP TRIGGER IF EXISTS trg_immutable_ledger_lines ON ledger_lines;
CREATE TRIGGER trg_immutable_ledger_lines
BEFORE UPDATE OR DELETE ON ledger_lines
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_modification();
