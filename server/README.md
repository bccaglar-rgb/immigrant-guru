# Exchange Terminal Backend Scaffold

This folder contains a production-oriented scaffold for:
- `/api/connections` (CRUD + test connection)
- `/api/trade/place` and `/api/trade/cancel`
- WebSocket gateway for terminal realtime streams
- Exchange adapter interface + Binance/Bybit/OKX adapter skeletons

Notes:
- Secrets must be encrypted at rest (AES-GCM) on server only.
- Secrets are never returned to frontend.
- All trade actions are audited.
- Redis is intended as canonical realtime cache.
- Postgres is intended for configs + audit logs.

This scaffold is intentionally implementation-light and integration-ready.
