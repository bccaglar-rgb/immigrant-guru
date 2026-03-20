/**
 * Egress Failover Module — Public API
 *
 * Usage:
 *   import { initEgressController, getEgressController } from "./egress/index.ts";
 *
 *   // At startup:
 *   initEgressController();
 *
 *   // In exchangeFetch:
 *   const ctrl = getEgressController();
 *   const resolved = ctrl?.resolveUrl("binance", originalUrl);
 */

export { initEgressController, getEgressController } from "./egressController.ts";
export { getWsSwitchoverManager } from "./wsSwitchover.ts";
export type {
  EgressPath,
  EgressPathRole,
  EgressPathState,
  EgressConfig,
  EgressHealthSnapshot,
  FailoverEvent,
  FailoverTrigger,
  IEgressController,
} from "./types.ts";
