# Polivo Market System

## Overview

Polivo Market System is a multi-tenant, offline-first vegetable market management system for wholesale market stall owners and their staff. It manages farmer and buyer records, package weights, sales, commissions, billing, payments, balances, and reports. Staff use an installable desktop application with fast keyboard-based workflows, while a local stall service manages one shared operational database per stall. Transaction data is retained locally and synchronized to the cloud for remote reporting through a web dashboard. The system reduces duplicate entry, calculation errors, and paperwork while allowing billing to continue during internet outages.

## Goals

1. Support fast keyboard-based billing, targeting approximately five bill creation or update operations per minute during representative staff workflow testing.
2. Support 300–500 independent stalls with tenant-isolated data, users, permissions, and reporting.
3. Allow multiple computers within a stall to access the same operational records over the local network, including during internet outages.
4. Record each sale once and automatically update its buyer records, farmer allocations, commissions, and balances.
5. Synchronize locally committed transactions to the cloud without duplicate financial records or loss of acknowledged transactions.
6. Provide reliable installation, printing, backup, recovery, and application update workflows.

## Core User Flow

1. The stall owner creates an account, registers their stall, and configures authorized staff and devices.
2. The stall installs its desktop application and local stall service. Additional computers connect to the same service over the local network.
3. Authorized staff access the stall and register or find farmers, buyers, and vegetables using searchable short codes.
4. Staff start a buyer bill and enter the farmer, vegetable, individual package weights, and selling price per kilogram for each sale entry.
5. The application displays calculated weights, sale amounts, and applicable commissions using the stall’s configured and confirmed business rules.
6. Staff review and finalize the bill. The stall service saves the transaction and its related farmer allocations and financial records together in the local database.
7. Staff print the buyer bill. Farmer sales records update automatically, allowing farmer bills or settlement statements to be generated without re-entering sales.
8. Staff record buyer receipts and farmer payments, allocate payments to bills, and view remaining balances.
9. The stall service synchronizes committed records to the cloud in the background when internet access is available, retaining the local records.
10. Authorized users review local operational reports or access synchronized reports through the web dashboard.

## Features

### Stall and User Management

- Separate accounts, operational data, and configuration for each stall.
- Stall owner and staff access with role-based permissions.
- Authorized device registration and connection to the appropriate stall.
- Audit records for significant financial and administrative actions.

### Farmer and Buyer Management

- Register farmers and buyers with unique short codes within each stall.
- Search and select parties quickly during billing.
- Maintain contact details, transaction histories, and outstanding balances.
- Track amounts payable to farmers and amounts receivable from buyers.

### Vegetable and Package Management

- Maintain vegetable records and searchable codes.
- Record individual package weights and calculate total weight.
- Support multiple vegetables and multiple packages within a bill.
- Preserve the farmer ownership associated with each sale entry.

### Sales and Commission Management

- Keyboard-first entry designed for high-volume market operations.
- Buyer bills containing purchases from multiple farmers.
- Automatic farmer sales allocations from the same underlying sale records.
- Configurable commission rules, including vegetable-specific rules where required.
- Centralized validation and financial calculations in the stall service.
- Explicit confirmation of unresolved commission units, price boundaries, and deduction rules before implementation.

### Billing and Printing

- Generate buyer bills and farmer bills or settlement statements.
- Include bill identifiers, dates, party details, vegetables, package weights, prices, and totals.
- Support configured bill printers and authorized reprinting.
- Preserve traceability between sale entries, buyer bills, and farmer records.
- Keep print retries separate from transaction creation to prevent duplicate sales.

### Payments and Balances

- Record cash, bank transfer, and cheque payments.
- Allocate payments to bills and retain allocation history.
- Track unpaid, partially paid, and paid amounts.
- Maintain buyer receivables and farmer payables.
- Define cheque clearance, reversals, and allocation rules before implementing their financial effects.

### Local Operations and Cloud Synchronization

- One authoritative local operational database per stall, owned by its stall service.
- Multiple desktop computers accessing that service through the local network.
- Continued local billing during internet outages while the stall service and local network remain available.
- Background synchronization with durable queues, retries, and duplicate prevention.
- Visible synchronization status and actionable connection errors.
- Local data retention after successful cloud synchronization.

### Web Dashboard and Reports

- Online stall account administration and authorized remote access.
- Read-only financial reporting from synchronized cloud records in the initial release.
- Daily sales, farmer activity, buyer activity, commission, outstanding balance, and bill history reports.
- Filters for relevant dates, parties, vegetables, and bill identifiers.
- Clear indication of synchronization freshness so users can distinguish current and delayed reports.

### Installation, Maintenance, and Recovery

- Desktop application distribution and stall setup.
- Configuration of the local service, connected terminals, and printers.
- Controlled application updates and database migrations.
- Local database backup and tested restoration procedures.
- Recovery guidance for service interruption and host-computer failure.

## Scope

### In Scope

- A shared Polivo platform serving multiple independent market stalls.
- A web portal and dashboard, an installable desktop application, a local stall service, and cloud backend functionality.
- Farmer, buyer, vegetable, package, sales, commission, billing, payment, balance, and reporting modules.
- Fast keyboard-based workflows and bill printing.
- Shared local operations across multiple computers within one stall.
- Offline billing with background cloud synchronization.
- Tenant isolation, permissions, auditability, backups, recovery, and controlled updates.
- Documentation of unresolved business rules before they become implementation assumptions.

### Out of Scope

- Public farmer-to-buyer marketplace features such as harvest listings, bidding, buying requests, and loyalty rewards in the initial ERP release.
- Separate independently writable operational databases on every terminal within the same stall.
- Direct access to a shared SQLite database file through a network folder.
- Direct web-dashboard editing of operational financial records in the initial release.
- Continued billing on dependent terminals when their authoritative stall service is unavailable.
- Payroll, full general-ledger accounting, tax filing, and other enterprise modules beyond the defined stall operations.
- Digital-scale integration until the hardware, connection method, and weighing rules are confirmed.
- Automatic resolution of ambiguous financial conflicts or implementation of unconfirmed business rules.

## Success Criteria

1. An authorized staff member can complete a buyer sale containing multiple farmers, vegetables, and package weights without entering the same sale again for farmer records.
2. Representative trained-user testing demonstrates approximately five bill creation or update operations per minute for agreed bill sizes and hardware.
3. Multiple terminals in one stall can view committed transactions and work against the same local records without duplicate bill identifiers.
4. Billing, local payment recording, and printing continue during an internet outage while the stall service and local network remain operational.
5. After connectivity returns, queued transactions synchronize successfully, and repeated delivery does not create duplicate financial records.
6. Finalized sales and their associated financial records are committed together, with no partially saved transaction after an interrupted operation.
7. Buyer and farmer balances reconcile with recorded sales, payments, allocations, and authorized adjustments.
8. A user from one stall cannot access another stall’s protected records through the application or its APIs.
9. Remote reports accurately represent synchronized records and display their synchronization freshness.
10. Backup restoration and application update procedures pass documented recovery tests before production rollout.
11. Load testing validates the cloud services against an agreed workload representing 300–500 stalls without placing cloud availability on the local billing path.