import { useEffect, useRef } from "react";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useExchangeTerminalStore } from "./useExchangeTerminalStore";

/**
 * Pipeline 8 client-side hook: subscribes to private user stream via WS
 * and feeds order/position/balance events into the terminal store.
 *
 * - Replace semantics for callbacks (no leak on re-render)
 * - Idempotent subscribe (MarketDataRouter deduplicates same params)
 * - Auto-resubscribe on WS reconnect handled by MarketDataRouter.onopen
 * - Cleanup on unmount or param change
 */
export function usePrivateStream(
  userId: string | null,
  exchangeAccountId: string | null,
  venue: string,
) {
  const mountedRef = useRef(true);
  const subRef = useRef<{ userId: string; accountId: string; venue: string } | null>(null);

  const { applyOrderUpdate, applyPositionUpdate, applyBalanceUpdate, setPrivateStreamStatus } =
    useExchangeTerminalStore();

  useEffect(() => {
    mountedRef.current = true;

    if (!userId || !exchangeAccountId) {
      // No account selected — unsubscribe if previously subscribed
      if (subRef.current) {
        MarketDataRouter.unsubscribePrivate();
        MarketDataRouter.clearPrivateStreamCallbacks();
        subRef.current = null;
        setPrivateStreamStatus("idle");
      }
      return;
    }

    // Register callbacks (replace semantics — safe on re-render)
    MarketDataRouter.setPrivateStreamCallbacks({
      onOrderUpdate: (event) => {
        if (!mountedRef.current) return;
        applyOrderUpdate(event);
      },
      onPositionUpdate: (event) => {
        if (!mountedRef.current) return;
        applyPositionUpdate(event);
      },
      onBalanceUpdate: (event) => {
        if (!mountedRef.current) return;
        applyBalanceUpdate(event);
      },
      onSubscribed: () => {
        if (!mountedRef.current) return;
        setPrivateStreamStatus("subscribed");
      },
      onError: () => {
        if (!mountedRef.current) return;
        setPrivateStreamStatus("error");
      },
    });

    // Subscribe (idempotent — MarketDataRouter skips if already subscribed with same params)
    setPrivateStreamStatus("subscribing");
    MarketDataRouter.subscribePrivate(userId, exchangeAccountId, venue);
    subRef.current = { userId, accountId: exchangeAccountId, venue };

    return () => {
      mountedRef.current = false;
      MarketDataRouter.unsubscribePrivate();
      MarketDataRouter.clearPrivateStreamCallbacks();
      subRef.current = null;
      setPrivateStreamStatus("disconnected");
    };
  }, [userId, exchangeAccountId, venue, applyOrderUpdate, applyPositionUpdate, applyBalanceUpdate, setPrivateStreamStatus]);
}
