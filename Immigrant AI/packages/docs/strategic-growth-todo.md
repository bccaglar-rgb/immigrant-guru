# Immigrant AI Strategic Growth TODO

This document translates the next product level into an execution backlog.
It is not a brainstorm list. It is an implementation-oriented roadmap for
turning the current product into a durable, learnable, monetizable platform.

## Operating Goal

Move from:

- a strong feature foundation

To:

- a defensible immigration operating system
- a system that learns from outcomes
- a system that monetizes predictably
- a system that supports expert escalation and internal operations

## Delivery Principles

- Keep deterministic product logic separate from AI explanation layers.
- Prefer explicit tables over overloading JSON for core business signals.
- Ship systems that create reusable data assets, not only user-facing UI.
- Every new subsystem must answer:
  - what user problem it solves
  - what product signal it generates
  - what monetization or moat value it creates
  - how it is measured

## Execution Order

### Wave 1: Data and Learning Moat

1. Case outcome tracking
  - Backend foundation implemented
2. AI feedback loop
  - Backend foundation implemented

### Wave 2: Monetization Foundation

3. Subscription and entitlement model
4. Feature gating and paywall surfaces

### Wave 3: Distribution and Growth

5. Shareable score pages
6. Referral and attribution system

### Wave 4: Marketplace and Expert Layer

7. Lawyer marketplace foundation
8. Consultation and offer workflows

### Wave 5: Intelligence Core Upgrade

9. Decision graph
10. Automation engine
11. Advanced analytics and admin product instrumentation

## 1. Case Outcome Tracking

### Product Goal

Capture the real-world result of immigration cases so the system can learn from
actual outcomes instead of only deterministic heuristics.

### Core User/Business Value

- Creates the long-term data moat.
- Enables pathway-specific outcome insights.
- Makes probability and guidance materially better over time.
- Supports expert review and internal decision quality.

### Database Work

Create `case_outcomes`:

- `id`
- `case_id`
- `outcome`
  - `approved`
  - `rejected`
  - `withdrawn`
  - `pending`
- `duration_months`
- `final_pathway`
- `decision_date`
- `notes`
- `recorded_by_user_id`
- `recorded_at`
- `created_at`
- `updated_at`

Recommended constraints:

- `case_id` unique if only one terminal outcome per case is allowed
- `duration_months >= 0`
- `final_pathway` nullable until finalization

### Backend TODO

- Add model: `CaseOutcome`
- Add enums for `CaseOutcomeStatus`
- Add schemas:
  - `CaseOutcomeCreate`
  - `CaseOutcomeUpdate`
  - `CaseOutcomeRead`
  - `CaseOutcomeSummary`
- Add service:
  - `CaseOutcomeService`
- Add routes:
  - `POST /cases/{id}/outcome`
  - `GET /cases/{id}/outcome`
  - `PUT /cases/{id}/outcome`
- Add admin/internal aggregate endpoint:
  - `GET /admin/outcomes/summary`
- Add audit events:
  - `CASE_OUTCOME_RECORDED`
  - `CASE_OUTCOME_UPDATED`

### Frontend TODO

- Add outcome section to case workspace for authorized users/admins
- Add outcome badge and summary in case overview
- Add internal admin reporting page:
  - approval rate
  - rejection rate
  - average duration by pathway

### Analytics / Measurement

- percentage of cases with recorded outcomes
- pathway coverage by outcomes
- approval/rejection rates by pathway, profile cluster, country

### Definition of Done

- outcomes persist reliably
- outcome recording is audit-logged
- internal reporting can query outcomes by pathway/country
- probability engine can read aggregated outcome data later

## 2. AI Feedback Loop

### Product Goal

Collect explicit quality signals on AI outputs so prompts, ranking, and UX can
improve based on user reactions instead of guesswork.

### Database Work

Create `ai_feedback`:

- `id`
- `user_id`
- `case_id`
- `feature`
  - `strategy`
  - `copilot`
  - `document_analysis`
  - `comparison`
- `target_id`
  - optional strategy run id / copilot message id / document id
- `rating`
  - `positive`
  - `negative`
- `comment`
- `created_at`

### Backend TODO

- Add model: `AIFeedback`
- Add schemas:
  - `AIFeedbackCreate`
  - `AIFeedbackRead`
- Add service:
  - `AIFeedbackService`
- Add routes:
  - `POST /ai/feedback`
  - `GET /admin/ai/feedback`
- Add aggregation helpers:
  - feedback by feature
  - feedback by model
  - feedback by prompt version

### Frontend TODO

- Add thumbs up/down on:
  - AI strategy
  - copilot answers
  - document intelligence cards
- Optional comment box after negative rating
- Show “thanks, this improves future guidance” micro-confirmation

### Internal Use

- weekly prompt quality review
- identify low-quality pathways/countries/features
- connect feedback with confidence labels

### Definition of Done

- every major AI surface supports feedback
- negative feedback can include comments
- admin can inspect feedback by feature and trend

## 3. Subscription and Entitlement System

### Product Goal

Create a durable monetization foundation without hardcoding plan logic in UI.

### Database Work

Create `subscriptions`:

- `id`
- `user_id`
- `plan`
  - `free`
  - `pro`
  - `premium`
- `status`
  - `active`
  - `trialing`
  - `past_due`
  - `canceled`
  - `expired`
- `provider`
  - `manual`
  - `stripe`
- `provider_subscription_id`
- `starts_at`
- `expires_at`
- `created_at`
- `updated_at`

Create `feature_usage_counters`:

- `id`
- `user_id`
- `feature_key`
- `period_start`
- `period_end`
- `usage_count`
- `created_at`
- `updated_at`

### Backend TODO

- Extend user/account read model with current plan summary
- Add service:
  - `SubscriptionService`
  - `EntitlementService`
  - `UsageMeteringService`
- Add feature gates for:
  - AI strategy generations
  - copilot usage
  - active case count
  - document upload count
  - advanced comparison/reporting
- Add routes:
  - `GET /billing/subscription`
  - `GET /billing/entitlements`
- Add Stripe integration placeholder later, but keep domain model internal now

### Frontend TODO

- Plan badge in dashboard/account area
- Locked-feature states with contextual upgrade CTA
- Usage meter for capped actions
- Pricing/upgrade surfaces tied to actual entitlements

### Definition of Done

- backend decides access
- frontend renders gated states consistently
- usage counters increment on real actions

## 4. Paywall and Upgrade UX

### Product Goal

Convert product value into revenue without making the app feel cheap or spammy.

### Frontend TODO

- Add reusable `UpgradePromptCard`
- Add contextual CTAs after:
  - strategy limit reached
  - copilot limit reached
  - case limit reached
  - premium document intelligence features locked
- Add comparison table for plan benefits
- Add “why this is gated” copy grounded in value, not pressure

### Backend TODO

- Return machine-readable entitlement errors:
  - `code`
  - `feature_key`
  - `current_plan`
  - `required_plan`
- Standardize paywall error response mapping

### Definition of Done

- locked actions fail gracefully
- frontend shows precise upgrade context
- no silent 403s on gated flows

## 5. Shareable Immigration Score

### Product Goal

Turn the score into a growth loop and credibility surface.

### Database Work

Create `public_score_profiles`:

- `id`
- `user_id`
- `slug`
- `is_public`
- `headline`
- `summary`
- `score_snapshot_json`
- `created_at`
- `updated_at`

### Backend TODO

- Add service:
  - `PublicScoreService`
- Add routes:
  - `POST /score/public`
  - `GET /score/public/{slug}`
  - `DELETE /score/public/{slug}`
- Add sanitization:
  - no sensitive personal details
  - no internal reasoning leakage

### Frontend TODO

- Public share card
- Share button
- Copy link
- Open Graph preview support
- Optional “share on LinkedIn” CTA

### Growth Tracking

- share creation rate
- public link visits
- signups from public score pages

## 6. Referral System

### Product Goal

Capture growth attribution and incentivize sharing.

### Database Work

Create `referrals`:

- `id`
- `referrer_user_id`
- `referred_user_id`
- `code`
- `status`
  - `clicked`
  - `signed_up`
  - `activated`
- `created_at`
- `updated_at`

### Backend TODO

- referral code generation
- referral attribution on signup
- referral status progression

### Frontend TODO

- referral panel in settings/dashboard
- invite link copy
- referral status list

## 7. Lawyer Marketplace Foundation

### Product Goal

Create the highest-value monetization layer through expert escalation.

### Database Work

Create `lawyers`:

- `id`
- `full_name`
- `firm_name`
- `countries`
- `pathway_specialties`
- `bio`
- `languages`
- `status`
- `created_at`
- `updated_at`

Create `consultation_requests`:

- `id`
- `user_id`
- `case_id`
- `status`
  - `open`
  - `matched`
  - `closed`
- `notes`
- `created_at`
- `updated_at`

Create `consultation_offers`:

- `id`
- `consultation_request_id`
- `lawyer_id`
- `message`
- `price_quote`
- `currency`
- `status`
  - `sent`
  - `accepted`
  - `declined`
- `created_at`
- `updated_at`

### Backend TODO

- lawyer CRUD/admin management
- consultation request create/list/update
- consultation offers create/respond
- entitlement hooks for premium users

### Frontend TODO

- “Get expert help” CTA in workspace and strategy panels
- request form
- offer list
- lawyer profile cards

### Operational TODO

- admin lawyer verification workflow
- manual offer moderation

## 8. Decision Graph

### Product Goal

Replace linear heuristics with a transparent decision-graph engine that can
power score, probability, risks, and explainability consistently.

### Engine Design

Represent rules as nodes/edges:

- profile signals
- case signals
- document signals
- pathway enablement signals
- risk penalties
- confidence modifiers

### Backend TODO

- Create `decision_graph_service.py`
- Define typed rule inputs and outputs
- Move pathway-fit heuristics and score adjustments into graph rules
- Expose explanation payloads that reference graph signals, not raw LLM text

### Data/Model TODO

- optional `decision_rules` registry table later
- start with code-first rules, not DB-first rule builder

### Definition of Done

- probability, risk, and next-best-action all consume the same signal graph
- explanations reference deterministic rules

## 9. Advanced Analytics and Admin BI

### Product Goal

Give the company an operating console, not just a user product.

### Admin Metrics to Track

- total users
- activated users
- onboarding completion rate
- first-case creation rate
- strategy generation rate
- copilot usage rate
- document upload rate
- premium conversion rate
- drop-off by funnel stage
- most common pathways

### Backend TODO

- create analytics aggregation services
- create admin endpoints:
  - `GET /admin/metrics/overview`
  - `GET /admin/metrics/funnel`
  - `GET /admin/metrics/pathways`

### Frontend TODO

- admin analytics dashboard
- filters by date range / country / plan

## 10. Automation Engine

### Product Goal

Proactively move users forward instead of waiting for them to return.

### Trigger Examples

- profile incomplete
- missing critical information
- document processing failed
- no strategy generated after case creation
- consultation offer received
- subscription expiring

### Backend TODO

- create `automation_events`
- create `notification_jobs`
- create rules engine for trigger -> action mapping
- add worker queue for notifications/reminders

### Delivery Channels

- in-app alerts
- email
- future push/WhatsApp if needed

### Definition of Done

- event recorded
- rule matched
- notification generated and traceable

## 11. API Productization

### Product Goal

Turn core decision systems into B2B-ready APIs.

### Candidate APIs

- score API
- probability API
- timeline API
- comparison API

### Backend TODO

- API key model
- API key auth middleware
- per-key rate limits
- usage metering
- org/team model later if needed

### Documentation TODO

- external API docs
- sample payloads
- pricing/limit model

## 12. Cross-Cutting Technical Requirements

### Data Governance

- track feature versions in output payloads
- add source/version metadata to outcome-based analytics
- avoid mixing training/feedback data with runtime JSON blobs only

### Audit and Compliance

- audit all admin writes
- audit subscription plan changes
- audit consultation request lifecycle

### Observability

- analytics event coverage for every new major flow
- admin metrics should reconcile against raw event tables

### Security

- marketplace/admin routes must be stricter than end-user routes
- public score pages must expose only whitelisted fields

## 13. Suggested Sprint Breakdown

### Sprint 1

- `case_outcomes`
- `ai_feedback`
- minimal admin reporting for both

### Sprint 2

- `subscriptions`
- `feature_usage_counters`
- entitlement middleware
- upgrade prompt UI

### Sprint 3

- public score pages
- share flow
- referral tracking

### Sprint 4

- lawyer marketplace base tables
- consultation request flow
- offer handling

### Sprint 5

- decision graph v1
- replace isolated pathway heuristics with graph signals

### Sprint 6

- automation engine
- admin analytics v1

## 14. Critical Dependencies

- Outcome tracking should land before serious adaptive probability work.
- AI feedback should land before major prompt iteration cycles.
- Subscriptions should land before broad premium feature rollout.
- Decision graph should land before advanced explainability promises.
- Automation engine should land after core event instrumentation exists.

## 15. What Not To Do

- Do not hide core monetization logic in frontend-only checks.
- Do not keep strategic business signals trapped inside JSON blobs forever.
- Do not mix lawyer marketplace logic directly into case CRUD routes.
- Do not make AI feedback anonymous to the feature/output it belongs to.
- Do not launch shareable score pages without explicit privacy controls.

## 16. Immediate Next Build Queue

### Must build first

- case outcome tracking
- AI feedback system

### Must build second

- subscriptions
- entitlement checks
- upgrade prompts

### Must build third

- shareable score
- referrals

### Then

- lawyer marketplace
- decision graph
- automation engine
- admin analytics
