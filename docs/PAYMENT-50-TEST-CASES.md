# Bitrium — TRON USDT Payment: 50 Critical Test Cases

> Status: QA Execution Ready
> Last Updated: 2026-04-05

## Test Case Matrix

| # | Category | Test Case | Severity | Automation |
|---|----------|-----------|----------|------------|
| 1 | Invoice | Plan selection creates correct invoice | Critical | Yes |
| 2 | Invoice | Unique TRON address per invoice | Critical | Yes |
| 3 | Invoice | Same invoice returns same address | High | Yes |
| 4 | Invoice | Amount matches plan price | Critical | Yes |
| 5 | Invoice | Expiry correctly assigned | High | Yes |
| 6 | Invoice | No partial record on DB error | Critical | Yes |
| 7 | Address | Valid TRON address format | Critical | Yes |
| 8 | Chain | Wrong chain payment rejected | Critical | Manual |
| 9 | Token | Wrong token transfer rejected | Critical | Manual |
| 10 | Token | Contract address validated | Critical | Yes |
| 11 | Amount | Exact amount accepted | Critical | Yes |
| 12 | Amount | Within tolerance accepted | High | Yes |
| 13 | Amount | Underpayment rejected | Critical | Yes |
| 14 | Amount | Overpayment handled safely | Critical | Yes |
| 15 | Amount | No decimal/rounding bugs | Critical | Yes |
| 16 | Amount | Tolerance abuse prevented | Critical | Yes |
| 17 | Expiry | Pre-expiry payment works | Critical | Yes |
| 18 | Expiry | Post-expiry payment handled | Critical | Manual |
| 19 | Expiry | Expired shown correctly in UI | High | Yes |
| 20 | Expiry | Expired invoice not reusable | High | Yes |
| 21 | Webhook | Valid webhook processed | Critical | Yes |
| 22 | Webhook | Invalid HMAC rejected | Critical | Yes |
| 23 | Webhook | Missing signature rejected | Critical | Yes |
| 24 | Webhook | Malformed JSON handled | High | Yes |
| 25 | Webhook | Missing fields rejected | High | Yes |
| 26 | Webhook | Replay duplicate prevented | Critical | Yes |
| 27 | Webhook | Same tx hash different invoice blocked | Critical | Yes |
| 28 | Webhook | Out-of-order events handled | High | Yes |
| 29 | Confirm | No activation below threshold | Critical | Yes |
| 30 | Confirm | Activation at threshold | Critical | Yes |
| 31 | Confirm | Duplicate confirm idempotent | Critical | Yes |
| 32 | Confirm | Pending confirmations shown in UI | High | Yes |
| 33 | Confirm | Provider delay doesn't cause false fail | High | Manual |
| 34 | Concurrency | Dual worker single subscription | Critical | Yes |
| 35 | Concurrency | Webhook + poll no duplicate | Critical | Yes |
| 36 | Concurrency | Retry storm no double credit | Critical | Yes |
| 37 | Concurrency | Finalize error recovery | Critical | Manual |
| 38 | Activation | Correct plan activated | Critical | Yes |
| 39 | Activation | No duplicate subscription | Critical | Yes |
| 40 | Activation | Stacking works correctly | Critical | Yes |
| 41 | Activation | Upgrade vs extension correct | Critical | Manual |
| 42 | Activation | Invoice + subscription state consistent | Critical | Yes |
| 43 | Activation | Paid invoice always has subscription | Critical | Yes |
| 44 | Activation | Tier access immediate after activation | Critical | Yes |
| 45 | Activation | UI cache doesn't block access | High | Yes |
| 46 | Reconciliation | Every paid invoice has chain proof | Critical | Yes |
| 47 | Reconciliation | No orphan payments | Critical | Yes |
| 48 | Reconciliation | Ghost payment detection | Critical | Yes |
| 49 | Reconciliation | Double-credit detection | Critical | Yes |
| 50 | Reconciliation | Admin sees correct payment history | High | Yes |

## Release Blockers

Any of these failing = **BLOCK RELEASE**:

- [ ] #26: Webhook replay creates duplicate credit
- [ ] #27: Same tx hash credits different invoice
- [ ] #9: Wrong token accepted as USDT
- [ ] #13: Underpayment activates subscription
- [ ] #29: No-confirmation access granted
- [ ] #34: Dual worker creates 2 subscriptions
- [ ] #42: Invoice paid but subscription missing
- [ ] #43: Subscription exists but invoice still pending
- [ ] #47: On-chain payment not captured
- [ ] #49: Double credit undetected

## Required Log Fields

Every payment event MUST log:
- `invoice_id`, `user_id`, `plan_id`
- `wallet_address`, `expected_amount`, `received_amount`
- `token`, `network`, `tx_hash`
- `confirmation_count`, `payment_status`
- `webhook_event_id`, `correlation_id`
- `processing_stage`, `idempotency_key`
- `final_decision`, `reason_code`
