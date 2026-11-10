-- Phase 21: party-role subledger, immutable postings/entries, opening drafts.
-- No chart of accounts. No editable current_balance on farmers/traders.
-- Party FKs use triggers because party_id targets farmers or traders by kind.
-- Migrations 001–007 remain unchanged.

CREATE TABLE party_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  party_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'LKR'),
  opening_status TEXT NOT NULL DEFAULT 'not_opened' CHECK (
    opening_status IN ('not_opened', 'opened', 'opened_zero')
  ),
  opening_cutoff_date TEXT,
  opening_completed_at TEXT,
  opening_completed_by_staff_id TEXT,
  opening_draft_id TEXT,
  opening_posting_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stall_id, party_kind, party_id),
  UNIQUE (id, stall_id),
  CHECK (
    (opening_status = 'not_opened' AND opening_cutoff_date IS NULL AND opening_completed_at IS NULL)
    OR (
      opening_status IN ('opened', 'opened_zero')
      AND opening_cutoff_date IS NOT NULL
      AND opening_completed_at IS NOT NULL
    )
  )
);

CREATE TRIGGER party_accounts_farmer_fk_insert
BEFORE INSERT ON party_accounts
WHEN NEW.party_kind = 'farmer'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM farmers WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'party_accounts farmer party_id must reference farmers')
  END;
END;

CREATE TRIGGER party_accounts_trader_fk_insert
BEFORE INSERT ON party_accounts
WHEN NEW.party_kind = 'trader'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM traders WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'party_accounts trader party_id must reference traders')
  END;
END;

CREATE UNIQUE INDEX idx_party_accounts_completed_opening
  ON party_accounts (stall_id, party_kind, party_id)
  WHERE opening_status IN ('opened', 'opened_zero');

CREATE TABLE ledger_postings (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  financial_event_type TEXT NOT NULL,
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  business_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  actor_staff_id TEXT,
  description TEXT,
  currency TEXT NOT NULL CHECK (currency = 'LKR'),
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, source_type, source_id, financial_event_type, event_sequence)
);

CREATE INDEX idx_ledger_postings_source
  ON ledger_postings (stall_id, source_type, source_id);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  posting_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  party_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor != 0),
  currency TEXT NOT NULL CHECK (currency = 'LKR'),
  posting_sequence INTEGER NOT NULL CHECK (posting_sequence >= 1),
  reverses_entry_id TEXT,
  UNIQUE (id, stall_id),
  UNIQUE (stall_id, posting_sequence),
  UNIQUE (reverses_entry_id),
  FOREIGN KEY (posting_id, stall_id) REFERENCES ledger_postings (id, stall_id) ON DELETE RESTRICT,
  FOREIGN KEY (reverses_entry_id, stall_id) REFERENCES ledger_entries (id, stall_id) ON DELETE RESTRICT
);

CREATE INDEX idx_ledger_entries_account_history
  ON ledger_entries (stall_id, party_kind, party_id, posting_sequence);

CREATE INDEX idx_ledger_entries_posting
  ON ledger_entries (stall_id, posting_id);

CREATE TRIGGER ledger_entries_farmer_fk_insert
BEFORE INSERT ON ledger_entries
WHEN NEW.party_kind = 'farmer'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM farmers WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'ledger_entries farmer party_id must reference farmers')
  END;
END;

CREATE TRIGGER ledger_entries_trader_fk_insert
BEFORE INSERT ON ledger_entries
WHEN NEW.party_kind = 'trader'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM traders WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'ledger_entries trader party_id must reference traders')
  END;
END;

CREATE TRIGGER ledger_postings_no_update
BEFORE UPDATE ON ledger_postings
BEGIN
  SELECT RAISE(ABORT, 'ledger_postings are immutable');
END;

CREATE TRIGGER ledger_postings_no_delete
BEFORE DELETE ON ledger_postings
BEGIN
  SELECT RAISE(ABORT, 'ledger_postings are immutable');
END;

CREATE TRIGGER ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries are immutable');
END;

CREATE TRIGGER ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries are immutable');
END;

CREATE TABLE opening_balance_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  stall_id TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK (party_kind IN ('farmer', 'trader')),
  party_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (
    direction IN (
      'stall_owes_farmer',
      'farmer_owes_stall',
      'buyer_owes_stall',
      'stall_owes_buyer'
    )
  ),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  signed_amount_minor INTEGER,
  cutoff_date TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'LKR'),
  reference TEXT,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'discarded')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_staff_id TEXT,
  posted_posting_id TEXT,
  UNIQUE (id, stall_id),
  CHECK (
    (amount_minor = 0 AND signed_amount_minor IS NULL)
    OR (amount_minor > 0 AND signed_amount_minor IS NOT NULL AND signed_amount_minor != 0)
  ),
  FOREIGN KEY (posted_posting_id, stall_id)
    REFERENCES ledger_postings (id, stall_id) ON DELETE RESTRICT
);

CREATE TRIGGER opening_drafts_farmer_fk_insert
BEFORE INSERT ON opening_balance_drafts
WHEN NEW.party_kind = 'farmer'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM farmers WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'opening_balance_drafts farmer party_id must reference farmers')
  END;
END;

CREATE TRIGGER opening_drafts_trader_fk_insert
BEFORE INSERT ON opening_balance_drafts
WHEN NEW.party_kind = 'trader'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM traders WHERE id = NEW.party_id AND stall_id = NEW.stall_id
    )
    THEN RAISE(ABORT, 'opening_balance_drafts trader party_id must reference traders')
  END;
END;

CREATE INDEX idx_opening_drafts_account
  ON opening_balance_drafts (stall_id, party_kind, party_id, status);

CREATE UNIQUE INDEX idx_opening_drafts_one_active_draft
  ON opening_balance_drafts (stall_id, party_kind, party_id)
  WHERE status = 'draft';
