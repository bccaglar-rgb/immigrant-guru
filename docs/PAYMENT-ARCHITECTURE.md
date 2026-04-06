# Bitrium Payment Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: CRITICAL -- handles real money (TRON USDT TRC-20)

---

## Table of Contents

1. [Current State and Risk Analysis](#current-state-and-risk-analysis)
2. [Invoice Lifecycle State Machine](#invoice-lifecycle-state-machine)
3. [Double-Entry Ledger Design](#double-entry-ledger-design)
4. [Database Schema](#database-schema)
5. [Idempotency](#idempotency)
6. [Webhook Hardening](#webhook-hardening)
7. [Expiry Handling](#expiry-handling)
8. [Under and Overpayment](#under-and-overpayment)
9. [Chain Reorg Risk](#chain-reorg-risk)
10. [Refund Flow](#refund-flow)
11. [Reconciliation](#reconciliation)
12. [Monitoring and Alerts](#monitoring-and-alerts)
13. [Multi-Chain Support Plan](#multi-chain-support-plan)

---

## 1. Current State and Risk Analysis

### Current Payment Flow

1. User selects subscription tier (Explorer $10 / Trader $20 / Titan $30)
2. System generates a TRON USDT TRC-20 payment address
3. User sends USDT to the address
4. System monitors the blockchain for incoming transactions
5. After confirmation, subscription is activated

### Risk Assessment

| Risk | Severity | Current Mitigation | Required Mitigation |
|------|----------|-------------------|---------------------|
| Double-spending (chain reorg) | HIGH | None | Wait for 20+ confirmations |
| Invoice expiry race condition | HIGH | Simple timeout | State machine with atomic transitions |
| Underpayment not handled | MEDIUM | Manual resolution | Automated partial credit or expiry |
| Overpayment not handled | MEDIUM | Manual resolution | Automated refund or credit |
| No idempotency on payment processing | HIGH | None | Idempotency keys on all operations |
| No double-entry accounting | HIGH | Single balance field | Full double-entry ledger |
| Payment wallet private key exposure | CRITICAL | .env file | Secrets manager (see SECURITY-HARDENING.md) |
| No reconciliation process | MEDIUM | Manual checks | Automated daily reconciliation |
| Single confirmation threshold | MEDIUM | Fixed count | Dynamic based on amount |

---

## 2. Invoice Lifecycle State Machine

### State Diagram

```
                    create invoice
                         |
                         v
                    +---------+
                    | PENDING |  (awaiting user action)
                    +----+----+
                         |
                    user views payment details
                         |
                         v
                +------------------+
                | AWAITING_PAYMENT |  (address generated, monitoring active)
                +--------+---------+
                         |
            +------------+------------+
            |            |            |
       tx detected   timer expires   user cancels
            |            |            |
            v            v            v
      +------------+ +--------+ +----------+
      | CONFIRMING | | EXPIRED| | CANCELLED|
      +-----+------+ +--------+ +----------+
            |
      +-----+--------+--------+
      |              |        |
  confirmed     underpaid   overpaid
  (exact)        detected    detected
      |              |        |
      v              v        v
  +------+   +----------+ +----------+
  | PAID |   | UNDERPAID| | OVERPAID |
  +------+   +----------+ +----------+
                  |              |
            user tops up    auto-refund
            or expires      excess
                  |              |
                  v              v
              +------+      +------+
              | PAID |      | PAID |
              +------+      +------+
```

### State Transition Rules

| From | To | Trigger | Side Effects |
|------|----|---------|-------------|
| PENDING | AWAITING_PAYMENT | User views invoice | Generate address, start monitoring, set expiry timer |
| PENDING | CANCELLED | User cancels or 1hr timeout | Release address |
| AWAITING_PAYMENT | CONFIRMING | Transaction detected on-chain | Record tx_hash, start confirmation counter |
| AWAITING_PAYMENT | EXPIRED | Expiry timer (30 min default) | Release address, notify user |
| CONFIRMING | PAID | Confirmations >= threshold AND amount matches | Activate subscription, ledger entry |
| CONFIRMING | UNDERPAID | Confirmations >= threshold AND amount < required | Notify user, offer top-up or cancel |
| CONFIRMING | OVERPAID | Confirmations >= threshold AND amount > required | Activate subscription, queue refund of excess |
| UNDERPAID | PAID | Top-up payment received and confirmed | Activate subscription |
| UNDERPAID | EXPIRED | Top-up window expires (24hr) | Ledger: hold underpaid amount as credit |
| OVERPAID | PAID | Excess refund sent | Subscription active, refund recorded |

### Atomic State Transitions

```javascript
async function transitionInvoiceState(invoiceId, expectedState, newState, metadata) {
  const result = await db.query(`
    UPDATE invoices
    SET status = $3,
        metadata = metadata || $4::jsonb,
        updated_at = NOW()
    WHERE id = $1 AND status = $2
    RETURNING *
  `, [invoiceId, expectedState, newState, JSON.stringify(metadata)]);

  if (result.rowCount === 0) {
    throw new ConflictError(`Invoice ${invoiceId} is not in state ${expectedState}`);
  }

  // Record state transition event
  await db.query(`
    INSERT INTO payment_events (invoice_id, event_type, metadata, created_at)
    VALUES ($1, 'state_transition', $2::jsonb, NOW())
  `, [invoiceId, JSON.stringify({ from: expectedState, to: newState, ...metadata })]);

  return result.rows[0];
}
```

---

## 3. Double-Entry Ledger Design

### Why Double-Entry

Every financial movement must have equal debits and credits. This ensures:

- No money appears or disappears
- Complete audit trail
- Easy reconciliation
- Regulatory compliance

### Account Structure

```
ASSETS
  assets:tron:hot_wallet         -- USDT in the platform hot wallet
  assets:tron:user_deposits      -- USDT received from users (pending)

LIABILITIES
  liabilities:user_balances      -- What we owe to users (credits, refunds)
  liabilities:subscriptions      -- Prepaid subscription revenue

REVENUE
  revenue:subscriptions          -- Earned subscription revenue

EXPENSES
  expenses:refunds               -- Refunds issued
  expenses:network_fees          -- TRON network fees
```

### Ledger Entry Examples

**User pays $20 for Trader subscription:**

| Debit | Credit | Amount | Description |
|-------|--------|--------|-------------|
| assets:tron:hot_wallet | -- | $20.00 | USDT received |
| -- | revenue:subscriptions | $20.00 | Subscription payment |

**User overpays by $5:**

| Debit | Credit | Amount | Description |
|-------|--------|--------|-------------|
| assets:tron:hot_wallet | -- | $25.00 | USDT received |
| -- | revenue:subscriptions | $20.00 | Subscription payment |
| -- | liabilities:user_balances | $5.00 | Overpayment credit |

**Refund of $5 overpayment:**

| Debit | Credit | Amount | Description |
|-------|--------|--------|-------------|
| liabilities:user_balances | -- | $5.00 | Clear user credit |
| -- | assets:tron:hot_wallet | $5.00 | USDT sent to user |
| expenses:network_fees | -- | $1.00 | TRC-20 transfer fee |
| -- | assets:tron:hot_wallet | $1.00 | Fee deducted |

---

## 4. Database Schema

### Invoices Table

```sql
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             INTEGER NOT NULL REFERENCES users(id),
    invoice_number      TEXT UNIQUE NOT NULL,        -- human-readable: INV-2026-001234
    tier                TEXT NOT NULL,                -- explorer, trader, titan
    amount_required     NUMERIC(20,6) NOT NULL,      -- USDT amount
    currency            TEXT NOT NULL DEFAULT 'USDT',
    network             TEXT NOT NULL DEFAULT 'TRC20',
    wallet_address      TEXT,                         -- generated payment address
    status              TEXT NOT NULL DEFAULT 'pending',
    expires_at          TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'awaiting_payment', 'confirming',
        'paid', 'expired', 'cancelled', 'underpaid', 'overpaid'
    ))
);

CREATE INDEX idx_invoices_user ON invoices (user_id, created_at DESC);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_wallet ON invoices (wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX idx_invoices_expires ON invoices (expires_at)
    WHERE status IN ('pending', 'awaiting_payment');
```

### Payment Events Table

```sql
CREATE TABLE payment_events (
    id              BIGSERIAL,
    invoice_id      UUID NOT NULL REFERENCES invoices(id),
    event_type      TEXT NOT NULL,
    tx_hash         TEXT,
    from_address    TEXT,
    amount          NUMERIC(20,6),
    confirmations   INTEGER DEFAULT 0,
    block_number    BIGINT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_pe_invoice ON payment_events (invoice_id);
CREATE INDEX idx_pe_tx_hash ON payment_events (tx_hash) WHERE tx_hash IS NOT NULL;
```

### Ledger Entries Table

```sql
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      UUID REFERENCES invoices(id),
    entry_group     UUID NOT NULL,               -- groups related debit/credit
    account         TEXT NOT NULL,
    debit           NUMERIC(20,6) DEFAULT 0,
    credit          NUMERIC(20,6) DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'USDT',
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT debit_or_credit CHECK (
        (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
    )
);

CREATE INDEX idx_ledger_account ON ledger_entries (account, created_at DESC);
CREATE INDEX idx_ledger_invoice ON ledger_entries (invoice_id);
CREATE INDEX idx_ledger_group ON ledger_entries (entry_group);

-- Ensure every entry group balances (application-level check + periodic audit)
```

### Ledger Balance View

```sql
CREATE VIEW account_balances AS
SELECT
    account,
    currency,
    SUM(debit) - SUM(credit) AS balance
FROM ledger_entries
GROUP BY account, currency;
```

---

## 5. Idempotency

### Why It Matters

Network failures, retries, and duplicate webhooks can cause:
- Double subscription activation
- Duplicate ledger entries
- Repeated refund payouts

### Implementation

```sql
CREATE TABLE idempotency_keys (
    key             TEXT PRIMARY KEY,
    result          JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);
```

```javascript
async function withIdempotency(key, fn) {
  // Check if already processed
  const existing = await db.query(
    'SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
    [key]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].result; // Return cached result
  }

  // Execute the operation
  const result = await fn();

  // Store result for deduplication
  await db.query(
    'INSERT INTO idempotency_keys (key, result) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
    [key, JSON.stringify(result)]
  );

  return result;
}

// Usage: processing a blockchain transaction
await withIdempotency(`tx:${txHash}`, async () => {
  return processPaymentTransaction(txHash, invoiceId, amount);
});
```

---

## 6. Webhook Hardening

### Incoming Blockchain Events

For TRON blockchain monitoring, the system polls or receives webhooks:

```javascript
async function handleBlockchainEvent(event) {
  // 1. Validate event signature/source
  if (!validateEventSource(event)) {
    log.warn('Invalid blockchain event source', { event });
    return;
  }

  // 2. Idempotency check
  const idempotencyKey = `chain:${event.network}:${event.txHash}:${event.logIndex}`;

  // 3. Process with idempotency
  await withIdempotency(idempotencyKey, async () => {
    // 4. Find matching invoice
    const invoice = await db.query(
      'SELECT * FROM invoices WHERE wallet_address = $1 AND status = $2',
      [event.toAddress, 'awaiting_payment']
    );

    if (!invoice.rows.length) {
      log.warn('No matching invoice for payment', { address: event.toAddress });
      return { status: 'no_match' };
    }

    // 5. Record payment event
    await recordPaymentEvent(invoice.rows[0], event);

    // 6. Transition state
    await transitionInvoiceState(
      invoice.rows[0].id,
      'awaiting_payment',
      'confirming',
      { txHash: event.txHash, amount: event.amount }
    );
  });
}
```

### Outgoing Webhooks to Users (Future)

If user-facing webhooks are added:
- Sign all outgoing webhooks with HMAC-SHA256
- Include timestamp in signature to prevent replay
- Retry with exponential backoff (3 attempts)
- Dead letter queue for failed deliveries

---

## 7. Expiry Handling

### Timer-Based Expiry

```javascript
// On invoice creation
const EXPIRY_WINDOWS = {
  pending: 60 * 60 * 1000,          // 1 hour to view payment details
  awaiting_payment: 30 * 60 * 1000, // 30 minutes to send payment
  underpaid: 24 * 60 * 60 * 1000,   // 24 hours to top up
};

// Expiry checker (runs every minute via cron/setInterval)
async function checkExpiredInvoices() {
  const expired = await db.query(`
    UPDATE invoices
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('pending', 'awaiting_payment')
      AND expires_at < NOW()
    RETURNING id, user_id, status
  `);

  for (const invoice of expired.rows) {
    await recordPaymentEvent(invoice, { event_type: 'expired' });
    await notifyUser(invoice.user_id, 'invoice_expired', { invoiceId: invoice.id });
    await releaseWalletAddress(invoice.id);
  }
}
```

### Race Condition: Payment Arrives During Expiry

```javascript
// Use advisory locks to prevent simultaneous expiry and payment processing
async function processPaymentWithLock(invoiceId, txData) {
  const lockKey = hashToInt(invoiceId); // Convert UUID to integer for pg_advisory_lock

  await db.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

  // Re-check status after acquiring lock
  const invoice = await db.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);

  if (invoice.rows[0].status === 'expired') {
    // Payment arrived after expiry -- still process it
    // Transition: expired -> confirming (grace period)
    log.info('Payment received for expired invoice, processing anyway', { invoiceId });
  }

  // Continue processing...
}
```

---

## 8. Under and Overpayment

### Underpayment Handling

```
Required: 20.000000 USDT
Received: 18.500000 USDT
Shortfall: 1.500000 USDT

Tolerance: 0.5% ($0.10 for $20)
If shortfall <= tolerance: Accept as PAID (absorb minor rounding)
If shortfall > tolerance: Mark as UNDERPAID
```

```javascript
const UNDERPAYMENT_TOLERANCE_PCT = 0.005; // 0.5%

function evaluatePaymentAmount(required, received) {
  const tolerance = required * UNDERPAYMENT_TOLERANCE_PCT;

  if (received >= required) {
    return received > required + tolerance ? 'overpaid' : 'exact';
  }

  if (required - received <= tolerance) {
    return 'exact'; // Close enough
  }

  return 'underpaid';
}
```

### Underpaid Resolution Options

1. **Top-up:** User sends the remaining amount within 24 hours
2. **Credit:** Shortfall stored as credit for next payment
3. **Expire:** After 24 hours, underpaid amount held as credit

### Overpayment Handling

1. Activate subscription immediately
2. Calculate excess: `received - required`
3. If excess < $1: Store as user credit (refund cost exceeds value)
4. If excess >= $1: Initiate automated refund to sender address
5. Record in ledger

---

## 9. Chain Reorg Risk

### TRON Confirmation Requirements

| Payment Amount | Required Confirmations | Approx. Time |
|---------------|----------------------|---------------|
| < $50 | 20 confirmations | ~60 seconds |
| $50 - $200 | 30 confirmations | ~90 seconds |
| > $200 | 50 confirmations | ~150 seconds |

### Reorg Protection

```javascript
async function updateConfirmations(invoiceId, txHash) {
  const currentBlock = await tronWeb.trx.getCurrentBlock();
  const tx = await tronWeb.trx.getTransactionInfo(txHash);

  if (!tx || !tx.blockNumber) return;

  const confirmations = currentBlock.block_header.raw_data.number - tx.blockNumber;

  await db.query(`
    UPDATE payment_events
    SET confirmations = $3, metadata = metadata || $4::jsonb
    WHERE invoice_id = $1 AND tx_hash = $2
  `, [invoiceId, txHash, confirmations, JSON.stringify({
    currentBlock: currentBlock.block_header.raw_data.number,
    txBlock: tx.blockNumber,
    checkedAt: new Date().toISOString()
  })]);

  // Check if threshold met
  const invoice = await db.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  const threshold = getConfirmationThreshold(invoice.rows[0].amount_required);

  if (confirmations >= threshold && invoice.rows[0].status === 'confirming') {
    await finalizePayment(invoiceId);
  }
}
```

### Handling a Reorg

If a confirmed transaction disappears after a reorg:

1. Confirmation counter resets to 0
2. Invoice status reverts to `awaiting_payment`
3. Alert team immediately (P1 incident)
4. Do NOT deactivate subscription immediately (grace period of 1 hour)
5. Re-scan blockchain for replacement transaction

---

## 10. Refund Flow

### Refund State Machine

```
REFUND_REQUESTED -> REFUND_APPROVED -> REFUND_PROCESSING -> REFUND_SENT -> REFUND_CONFIRMED
                                                              |
                                                        REFUND_FAILED
```

### Automated Refund Rules

| Scenario | Auto-Refund? | Approval Required? |
|----------|-------------|-------------------|
| Overpayment > $1 | Yes | No |
| User requests within 24hr (unused) | Yes | Admin approval |
| User requests after 24hr | No | Admin approval |
| Duplicate payment detected | Yes | No |
| System error | Yes | Admin approval |

### Refund Execution

```javascript
async function executeRefund(refundId) {
  const refund = await db.query('SELECT * FROM refunds WHERE id = $1', [refundId]);

  // Verify balance in hot wallet
  const balance = await tronWeb.trx.getBalance(HOT_WALLET_ADDRESS);
  if (balance < refund.amount + ESTIMATED_FEE) {
    await markRefundFailed(refundId, 'Insufficient hot wallet balance');
    await alertTeam('refund_insufficient_balance', refund);
    return;
  }

  // Execute TRC-20 transfer with idempotency
  await withIdempotency(`refund:${refundId}`, async () => {
    const tx = await tronWeb.transactionBuilder.triggerSmartContract(
      USDT_CONTRACT,
      'transfer(address,uint256)',
      {},
      [{ type: 'address', value: refund.to_address },
       { type: 'uint256', value: toSunAmount(refund.amount) }]
    );

    const signedTx = await tronWeb.trx.sign(tx.transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    await db.query(
      'UPDATE refunds SET status = $2, tx_hash = $3 WHERE id = $1',
      [refundId, 'refund_sent', result.txid]
    );

    // Ledger entries for refund
    await createLedgerEntry(refund.invoice_id, [
      { account: 'liabilities:user_balances', debit: refund.amount },
      { account: 'assets:tron:hot_wallet', credit: refund.amount },
      { account: 'expenses:network_fees', debit: ESTIMATED_FEE },
      { account: 'assets:tron:hot_wallet', credit: ESTIMATED_FEE },
    ]);
  });
}
```

---

## 11. Reconciliation

### Daily Reconciliation Process

```javascript
async function dailyReconciliation() {
  const report = {
    date: new Date().toISOString().split('T')[0],
    checks: [],
    discrepancies: []
  };

  // 1. Ledger balance check: total debits must equal total credits
  const balanceCheck = await db.query(`
    SELECT
      SUM(debit) as total_debit,
      SUM(credit) as total_credit,
      SUM(debit) - SUM(credit) as imbalance
    FROM ledger_entries
  `);

  if (balanceCheck.rows[0].imbalance !== 0) {
    report.discrepancies.push({
      type: 'ledger_imbalance',
      severity: 'CRITICAL',
      amount: balanceCheck.rows[0].imbalance
    });
  }

  // 2. Hot wallet balance vs ledger asset balance
  const chainBalance = await getUSDTBalance(HOT_WALLET_ADDRESS);
  const ledgerBalance = await db.query(`
    SELECT SUM(debit) - SUM(credit) as balance
    FROM ledger_entries WHERE account = 'assets:tron:hot_wallet'
  `);

  const walletDiff = Math.abs(chainBalance - ledgerBalance.rows[0].balance);
  if (walletDiff > 0.01) { // Allow 1 cent tolerance for rounding
    report.discrepancies.push({
      type: 'wallet_ledger_mismatch',
      severity: 'HIGH',
      chainBalance,
      ledgerBalance: ledgerBalance.rows[0].balance,
      difference: walletDiff
    });
  }

  // 3. Paid invoices vs active subscriptions
  const paidNotActive = await db.query(`
    SELECT i.id, i.user_id, i.paid_at
    FROM invoices i
    LEFT JOIN subscriptions s ON s.user_id = i.user_id AND s.status = 'active'
    WHERE i.status = 'paid' AND i.paid_at > NOW() - INTERVAL '30 days'
      AND s.id IS NULL
  `);

  if (paidNotActive.rows.length > 0) {
    report.discrepancies.push({
      type: 'paid_without_subscription',
      severity: 'HIGH',
      count: paidNotActive.rows.length,
      invoices: paidNotActive.rows.map(r => r.id)
    });
  }

  // 4. Stuck invoices (in confirming for > 1 hour)
  const stuckInvoices = await db.query(`
    SELECT id, updated_at FROM invoices
    WHERE status = 'confirming' AND updated_at < NOW() - INTERVAL '1 hour'
  `);

  if (stuckInvoices.rows.length > 0) {
    report.discrepancies.push({
      type: 'stuck_confirming',
      severity: 'MEDIUM',
      count: stuckInvoices.rows.length
    });
  }

  // 5. Store report and alert on discrepancies
  await storeReconciliationReport(report);
  if (report.discrepancies.length > 0) {
    await alertTeam('reconciliation_discrepancy', report);
  }

  return report;
}
```

---

## 12. Monitoring and Alerts

### Prometheus Metrics

```
# Payment flow metrics
payment_invoices_created_total{tier="explorer|trader|titan"}
payment_invoices_paid_total{tier="explorer|trader|titan"}
payment_invoices_expired_total
payment_invoices_underpaid_total
payment_invoices_overpaid_total

# Timing metrics
payment_confirmation_duration_seconds{quantile="0.5|0.9|0.99"}
payment_time_to_pay_seconds{quantile="0.5|0.9|0.99"}

# Financial metrics
payment_revenue_total_usdt{tier="explorer|trader|titan"}
payment_refunds_total_usdt
payment_hot_wallet_balance_usdt

# Health metrics
payment_stuck_confirming_count
payment_pending_refunds_count
payment_reconciliation_discrepancies
```

### Critical Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Hot wallet balance low | balance < $500 | P1 |
| Reconciliation discrepancy | any critical discrepancy | P1 |
| Stuck confirming invoice | confirming > 1 hour | P2 |
| High expiry rate | expired/created > 50% in 1hr | P2 |
| Refund failed | any refund in failed state | P2 |
| Chain monitoring gap | no new blocks processed in 5min | P1 |
| Ledger imbalance | debits != credits | P1 |

---

## 13. Multi-Chain Support Plan

### Phase 1: Current (TRON TRC-20 Only)

- USDT on TRON
- Lowest fees (~$1)
- Fast confirmations (~60s for 20 blocks)

### Phase 2: Add Ethereum ERC-20

```javascript
const CHAIN_CONFIG = {
  tron: {
    network: 'TRC20',
    confirmations: { low: 20, medium: 30, high: 50 },
    estimatedFee: 1.0,
    blockTime: 3,
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
  },
  ethereum: {
    network: 'ERC20',
    confirmations: { low: 12, medium: 20, high: 30 },
    estimatedFee: 5.0,
    blockTime: 12,
    usdtContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  }
};
```

### Phase 3: Add Solana SPL

- Near-instant finality
- Sub-cent fees
- Growing user base

### Abstraction Layer

```javascript
class PaymentProcessor {
  constructor(chain) {
    this.provider = ChainProviderFactory.create(chain);
  }

  async generateAddress(invoiceId) { return this.provider.generateAddress(invoiceId); }
  async getBalance(address) { return this.provider.getBalance(address); }
  async getConfirmations(txHash) { return this.provider.getConfirmations(txHash); }
  async sendRefund(toAddress, amount) { return this.provider.sendRefund(toAddress, amount); }
}

class ChainProviderFactory {
  static create(chain) {
    switch (chain) {
      case 'tron': return new TronProvider();
      case 'ethereum': return new EthereumProvider();
      case 'solana': return new SolanaProvider();
      default: throw new Error(`Unsupported chain: ${chain}`);
    }
  }
}
```

---

## Appendix: Payment Testing Checklist

```
Happy Path:
[ ] Create invoice -> PENDING
[ ] View payment details -> AWAITING_PAYMENT
[ ] Send exact amount -> CONFIRMING -> PAID
[ ] Subscription activated

Edge Cases:
[ ] Invoice expires before payment
[ ] Payment arrives 1 second before expiry
[ ] Underpayment within tolerance -> PAID
[ ] Underpayment outside tolerance -> UNDERPAID
[ ] Overpayment -> OVERPAID -> refund
[ ] Duplicate transaction (same tx_hash) -> idempotent
[ ] User cancels invoice
[ ] Payment to wrong address
[ ] Network congestion (slow confirmations)
[ ] Chain reorg after 10 confirmations
[ ] Concurrent invoice creation for same user
[ ] Refund to invalid address
```
