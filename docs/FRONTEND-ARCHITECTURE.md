# Bitrium Frontend Architecture

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: Medium-High -- user experience is the product

---

## Table of Contents

1. [Current State and Weaknesses](#current-state-and-weaknesses)
2. [Folder and Module Structure](#folder-and-module-structure)
3. [State Management](#state-management)
4. [Routing and Access Control](#routing-and-access-control)
5. [Real-Time Data Handling](#real-time-data-handling)
6. [Chart Rendering Optimization](#chart-rendering-optimization)
7. [Code Splitting and Lazy Loading](#code-splitting-and-lazy-loading)
8. [Error Boundaries](#error-boundaries)
9. [Design System](#design-system)
10. [Authentication Persistence](#authentication-persistence)
11. [API Client](#api-client)
12. [Form Architecture](#form-architecture)
13. [Admin Isolation](#admin-isolation)
14. [Performance Profiling](#performance-profiling)
15. [Frontend Observability](#frontend-observability)

---

## 1. Current State and Weaknesses

### Current Stack

- React 18 with Vite bundler
- TailwindCSS for styling
- Zustand for state management
- React Router v6 for routing
- WebSocket for real-time market data

### Weakness Assessment

| Weakness | Impact | Priority |
|----------|--------|----------|
| No data fetching layer (no TanStack Query) | Duplicate fetching, stale data, no caching | High |
| No code splitting | Large initial bundle, slow first load | High |
| No error boundaries | Single error crashes entire app | High |
| No standardized API client | Inconsistent error handling | Medium |
| No design system / component library | Inconsistent UI, slow development | Medium |
| Charts re-render on every tick | CPU waste, jank on low-end devices | High |
| No form validation library | Ad-hoc validation, inconsistent UX | Medium |
| Admin routes in same bundle | Unnecessary code for regular users | Medium |
| No frontend observability | Blind to client-side errors | Medium |
| No offline/degraded mode handling | White screen on network issues | Low |

---

## 2. Folder and Module Structure

### Recommended Structure

```
src/
├── app/                          # App-level setup
│   ├── App.tsx                   # Root component
│   ├── router.tsx                # Route definitions
│   ├── providers.tsx             # Context providers wrapper
│   └── global.css                # Tailwind imports
│
├── modules/                      # Feature modules (domain-driven)
│   ├── auth/
│   │   ├── components/           # LoginForm, RegisterForm, TOTPSetup
│   │   ├── hooks/                # useAuth, useSession
│   │   ├── stores/               # authStore (Zustand)
│   │   ├── api/                  # auth API calls
│   │   ├── types.ts
│   │   └── index.ts              # Public exports
│   │
│   ├── market/
│   │   ├── components/           # PriceTable, CandlestickChart, OrderBook
│   │   ├── hooks/                # useMarketData, useTicker
│   │   ├── stores/               # marketStore
│   │   ├── api/
│   │   ├── utils/                # formatPrice, calculateChange
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── portfolio/
│   │   ├── components/           # PortfolioDashboard, AssetCard, PnLChart
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── api/
│   │   └── index.ts
│   │
│   ├── ai/
│   │   ├── components/           # AnalysisCard, ScreenerResults, AIChat
│   │   ├── hooks/                # useAnalysis, useScreener
│   │   ├── stores/
│   │   ├── api/
│   │   └── index.ts
│   │
│   ├── payment/
│   │   ├── components/           # PricingTable, InvoiceView, PaymentStatus
│   │   ├── hooks/
│   │   ├── api/
│   │   └── index.ts
│   │
│   ├── alerts/
│   │   ├── components/           # AlertList, AlertForm, AlertNotification
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── api/
│   │   └── index.ts
│   │
│   └── admin/                    # Lazy-loaded admin module
│       ├── components/
│       ├── hooks/
│       ├── api/
│       └── index.ts
│
├── shared/                       # Shared across modules
│   ├── components/               # Button, Modal, Table, Input, Card, etc.
│   │   ├── ui/                   # Base UI primitives
│   │   ├── layout/               # Header, Sidebar, PageContainer
│   │   └── feedback/             # Toast, Skeleton, ErrorFallback
│   ├── hooks/                    # useDebounce, useWebSocket, useMediaQuery
│   ├── lib/                      # API client, WS client, formatters
│   ├── stores/                   # Global stores (theme, notifications)
│   ├── types/                    # Shared TypeScript types
│   └── constants/                # App-wide constants
│
├── assets/                       # Static assets
│   ├── icons/
│   └── images/
│
└── test/                         # Test utilities and setup
    ├── setup.ts
    ├── mocks/
    └── factories/
```

### Module Rules

1. Modules can import from `shared/` but not from other modules
2. Cross-module communication goes through Zustand stores or URL params
3. Each module exports only what other modules need via `index.ts`
4. API calls are always co-located with the module that uses them

---

## 3. State Management

### State Split: Zustand + TanStack Query

| State Type | Tool | Examples |
|-----------|------|---------|
| Server state (API data) | TanStack Query | User profile, invoices, AI results |
| Client state (UI) | Zustand | Theme, sidebar open, active tab |
| Real-time state (WS) | Zustand | Live prices, order book, alerts |
| Form state | React Hook Form | Login form, alert creation |
| URL state | React Router | Current page, filters, search params |

### Zustand Store Pattern

```typescript
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

interface MarketStore {
  tickers: Record<string, TickerData>;
  selectedSymbol: string | null;

  // Actions
  updateTicker: (symbol: string, data: TickerData) => void;
  setSelectedSymbol: (symbol: string) => void;
}

export const useMarketStore = create<MarketStore>()(
  devtools(
    subscribeWithSelector((set) => ({
      tickers: {},
      selectedSymbol: null,

      updateTicker: (symbol, data) =>
        set((state) => ({
          tickers: { ...state.tickers, [symbol]: data }
        }), false, 'updateTicker'),

      setSelectedSymbol: (symbol) =>
        set({ selectedSymbol: symbol }, false, 'setSelectedSymbol'),
    })),
    { name: 'MarketStore' }
  )
);
```

### TanStack Query Setup

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min: data considered fresh
      gcTime: 10 * 60 * 1000,           // 10 min: cache garbage collection
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Query key factory pattern
export const queryKeys = {
  user: {
    profile: () => ['user', 'profile'] as const,
    subscription: () => ['user', 'subscription'] as const,
  },
  invoices: {
    list: (params?: InvoiceParams) => ['invoices', 'list', params] as const,
    detail: (id: string) => ['invoices', 'detail', id] as const,
  },
  ai: {
    analysis: (symbol: string) => ['ai', 'analysis', symbol] as const,
    screening: (params: ScreenParams) => ['ai', 'screening', params] as const,
  },
};

// Example query hook
function useUserProfile() {
  return useQuery({
    queryKey: queryKeys.user.profile(),
    queryFn: () => apiClient.get('/api/v1/user/profile'),
    staleTime: 10 * 60 * 1000,
  });
}
```

---

## 4. Routing and Access Control

### Route Structure

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <GlobalErrorBoundary />,
    children: [
      // Public routes
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },

      // Protected routes
      {
        element: <AuthGuard />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'market', element: <MarketPage /> },
          { path: 'market/:symbol', element: <MarketDetailPage /> },
          { path: 'portfolio', element: <PortfolioPage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'settings', element: <SettingsPage /> },

          // Tier-gated routes
          {
            element: <TierGuard requiredTier="trader" />,
            children: [
              { path: 'ai/analysis', element: <AIAnalysisPage /> },
            ],
          },
          {
            element: <TierGuard requiredTier="titan" />,
            children: [
              { path: 'ai/screener', element: <AIScreenerPage /> },
            ],
          },

          // Payment routes
          { path: 'pricing', element: <PricingPage /> },
          { path: 'payment/:invoiceId', element: <PaymentPage /> },
        ],
      },

      // Admin routes (lazy loaded)
      {
        path: 'admin',
        element: <AdminGuard />,
        lazy: () => import('./modules/admin/routes'),
      },

      // 404
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
```

### Auth Guard

```typescript
function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

### Tier Guard

```typescript
function TierGuard({ requiredTier }: { requiredTier: string }) {
  const { subscription } = useSubscription();
  const tierLevel = { explorer: 1, trader: 2, titan: 3 };

  if (tierLevel[subscription.tier] < tierLevel[requiredTier]) {
    return <UpgradePrompt requiredTier={requiredTier} />;
  }

  return <Outlet />;
}
```

---

## 5. Real-Time Data Handling

### WebSocket Client

```typescript
class WSClient {
  private ws: WebSocket | null = null;
  private reconnect: ReconnectManager;
  private subscriptions = new Map<string, Set<(data: any) => void>>();
  private messageBuffer: any[] = [];

  async connect() {
    const ticket = await apiClient.post('/api/v1/auth/ws-ticket');

    this.ws = new WebSocket(`${WS_URL}/ws/v1?ticket=${ticket.data.ticket}`);

    this.ws.onopen = () => {
      this.reconnect.reset();
      this.resubscribeAll();
      this.flushBuffer();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = (event) => {
      if (event.code !== 4010) { // Not session revoked
        this.reconnect.schedule(() => this.connect());
      }
    };
  }

  subscribe(channel: string, callback: (data: any) => void) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.send({ op: 'subscribe', d: { channels: [channel] } });
    }
    this.subscriptions.get(channel)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(channel);
      subs?.delete(callback);
      if (subs?.size === 0) {
        this.subscriptions.delete(channel);
        this.send({ op: 'unsubscribe', d: { channels: [channel] } });
      }
    };
  }

  private handleMessage(msg: any) {
    if (msg.op === 'data' && msg.ch) {
      const callbacks = this.subscriptions.get(msg.ch);
      callbacks?.forEach(cb => cb(msg.d));
    }
  }
}

export const wsClient = new WSClient();
```

### React Hook for Market Data

```typescript
function useMarketTicker(exchange: string, symbol: string) {
  const updateTicker = useMarketStore(state => state.updateTicker);
  const ticker = useMarketStore(state => state.tickers[`${exchange}:${symbol}`]);

  useEffect(() => {
    const channel = `market:${exchange}:${symbol}:ticker`;
    const unsubscribe = wsClient.subscribe(channel, (data) => {
      updateTicker(`${exchange}:${symbol}`, data);
    });

    return unsubscribe;
  }, [exchange, symbol, updateTicker]);

  return ticker;
}
```

### Data Flow Architecture

```
Exchange WS -> market-hub -> Redis Pub/Sub -> WS Gateway -> Browser WS
                                                               |
                                                          WSClient
                                                               |
                                                    handleMessage()
                                                               |
                                               Zustand store update
                                                               |
                                          React component re-render
                                          (via selector subscription)
```

---

## 6. Chart Rendering Optimization

### Problems with Naive Approach

- Market data updates every 100-500ms
- Re-rendering a full candlestick chart on every tick is expensive
- Multiple charts on screen compound the problem
- Low-end devices experience visible jank

### Solutions

#### 1. Throttle Updates

```typescript
function useThrottledTicker(exchange: string, symbol: string, intervalMs = 500) {
  const [throttled, setThrottled] = useState<TickerData | null>(null);
  const latestRef = useRef<TickerData | null>(null);

  useEffect(() => {
    const channel = `market:${exchange}:${symbol}:ticker`;
    const unsubscribe = wsClient.subscribe(channel, (data) => {
      latestRef.current = data;
    });

    const timer = setInterval(() => {
      if (latestRef.current) {
        setThrottled(latestRef.current);
        latestRef.current = null;
      }
    }, intervalMs);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [exchange, symbol, intervalMs]);

  return throttled;
}
```

#### 2. Canvas-Based Charts

Use lightweight-charts (from TradingView) instead of DOM-based charting:

```typescript
import { createChart, IChartApi } from 'lightweight-charts';

function CandlestickChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: { background: { color: '#1a1a2e' }, textColor: '#e0e0e0' },
      grid: { vertLines: { color: '#2a2a4a' }, horzLines: { color: '#2a2a4a' } },
    });

    seriesRef.current = chartRef.current.addCandlestickSeries();

    return () => chartRef.current?.remove();
  }, []);

  // Update data without re-creating chart
  const ticker = useThrottledTicker('binance', symbol, 1000);

  useEffect(() => {
    if (ticker && seriesRef.current) {
      seriesRef.current.update({
        time: ticker.timestamp / 1000,
        open: ticker.open,
        high: ticker.high,
        low: ticker.low,
        close: ticker.close,
      });
    }
  }, [ticker]);

  return <div ref={containerRef} />;
}
```

#### 3. Virtualize Long Lists

For market tables with 100+ rows:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function MarketTable({ tickers }: { tickers: TickerData[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tickers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height
    overscan: 10,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <TickerRow
            key={tickers[virtualRow.index].symbol}
            data={tickers[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Code Splitting and Lazy Loading

### Route-Level Splitting

```typescript
// Lazy load pages
const DashboardPage = lazy(() => import('./modules/market/pages/DashboardPage'));
const AIAnalysisPage = lazy(() => import('./modules/ai/pages/AIAnalysisPage'));
const AdminRoutes = lazy(() => import('./modules/admin/routes'));

// Wrap in Suspense
function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
```

### Component-Level Splitting

```typescript
// Heavy components loaded on demand
const CandlestickChart = lazy(() => import('./modules/market/components/CandlestickChart'));
const AIAnalysisResult = lazy(() => import('./modules/ai/components/AIAnalysisResult'));

// Usage with inline fallback
function MarketDetail() {
  return (
    <div>
      <Suspense fallback={<ChartSkeleton />}>
        <CandlestickChart symbol={symbol} />
      </Suspense>
    </div>
  );
}
```

### Vite Chunk Strategy

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['lightweight-charts'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 500, // KB
  },
});
```

### Target Bundle Sizes

| Chunk | Max Size | Contents |
|-------|----------|----------|
| Initial (vendor-react) | 150KB gzip | React, Router |
| App shell | 50KB gzip | Layout, auth, routing |
| Market module | 100KB gzip | Price tables, basic charts |
| Charts (vendor-charts) | 80KB gzip | lightweight-charts |
| AI module | 40KB gzip | Analysis components |
| Admin module | 60KB gzip | Admin panels (lazy) |
| Total initial load | < 200KB gzip | Only what's needed for first render |

---

## 8. Error Boundaries

### Global Error Boundary

```typescript
class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return <FullPageError error={this.state.error} onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
```

### Module-Level Error Boundaries

```typescript
// Wrap each module's content in its own boundary
function MarketModule() {
  return (
    <ModuleErrorBoundary module="market">
      <MarketRoutes />
    </ModuleErrorBoundary>
  );
}

function ModuleErrorBoundary({ module, children }: { module: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-500">Something went wrong</h2>
          <p className="mt-2 text-gray-400">The {module} module encountered an error.</p>
          <button
            onClick={resetErrorBoundary}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Try Again
          </button>
        </div>
      )}
      onError={(error) => {
        Sentry.captureException(error, { tags: { module } });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### Component-Level Recovery

```typescript
// For non-critical components, show a placeholder instead of crashing
function SafeWidget({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <ErrorBoundary fallback={fallback || <WidgetPlaceholder />}>
      {children}
    </ErrorBoundary>
  );
}

// Usage
<SafeWidget fallback={<div className="text-gray-500">Chart unavailable</div>}>
  <CandlestickChart symbol={symbol} />
</SafeWidget>
```

---

## 9. Design System

### Component Library (Tailwind-Based)

```typescript
// shared/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-300',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export function Button({ variant = 'primary', size = 'md', loading, children, ...props }: ButtonProps) {
  return (
    <button
      className={`${variants[variant]} ${sizes[size]} rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
```

### Design Tokens

```css
/* tailwind.config.js -- extend theme */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f4fd',
          500: '#2196f3',
          600: '#1976d2',
          700: '#1565c0',
        },
        surface: {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#21262d',
          border: '#30363d',
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
        },
        success: '#3fb950',
        warning: '#d29922',
        error: '#f85149',
      },
    },
  },
};
```

---

## 10. Authentication Persistence

### Token Storage Strategy

```typescript
class AuthManager {
  private accessToken: string | null = null;
  // Refresh token is in HttpOnly cookie (not accessible from JS)

  setAccessToken(token: string) {
    this.accessToken = token;
    // Do NOT store in localStorage (XSS risk)
  }

  getAccessToken() {
    return this.accessToken;
  }

  clearTokens() {
    this.accessToken = null;
    // Call logout endpoint to clear cookie server-side
  }

  // On page load, try to refresh the access token
  async initialize() {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include', // sends HttpOnly cookie
      });

      if (response.ok) {
        const { accessToken } = await response.json();
        this.setAccessToken(accessToken);
        return true;
      }
    } catch (e) {
      // Not authenticated
    }
    return false;
  }
}
```

### Auth Flow on Page Load

```
1. App mounts
2. AuthManager.initialize() -- POST /auth/refresh (cookie)
3. If success: store access token in memory, render app
4. If failure: redirect to /login
5. On 401 response: try refresh once, if fails -> logout
```

---

## 11. API Client

### Axios Instance with Interceptors

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // for refresh token cookie
});

// Request interceptor: attach access token
apiClient.interceptors.request.use((config) => {
  const token = authManager.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add request ID for correlation
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// Response interceptor: handle 401, transform errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 401: try refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshed = await authManager.initialize();
      if (refreshed) {
        return apiClient(originalRequest);
      }
      // Refresh failed, logout
      authManager.clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Transform error for consistent handling
    const apiError = {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      code: error.response?.data?.code,
      requestId: error.config?.headers?.['X-Request-ID'],
    };

    return Promise.reject(apiError);
  }
);
```

---

## 12. Form Architecture

### React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const alertSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  condition: z.enum(['above', 'below', 'crosses']),
  price: z.number().positive('Price must be positive'),
  notifyVia: z.array(z.enum(['email', 'push', 'ws'])).min(1, 'Select at least one'),
});

type AlertFormData = z.infer<typeof alertSchema>;

function AlertForm({ onSubmit }: { onSubmit: (data: AlertFormData) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AlertFormData>({
    resolver: zodResolver(alertSchema),
    defaultValues: { condition: 'above', notifyVia: ['ws'] },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormField label="Symbol" error={errors.symbol?.message}>
        <Input {...register('symbol')} placeholder="BTCUSDT" />
      </FormField>
      {/* ... more fields ... */}
      <Button type="submit" loading={isSubmitting}>Create Alert</Button>
    </form>
  );
}
```

---

## 13. Admin Isolation

### Lazy-Loaded Admin Module

```typescript
// src/modules/admin/routes.tsx
export const Component = function AdminLayout() {
  return (
    <AdminSidebar>
      <Outlet />
    </AdminSidebar>
  );
};

export const children = [
  { index: true, element: <AdminDashboard /> },
  { path: 'users', element: <UserManagement /> },
  { path: 'users/:id', element: <UserDetail /> },
  { path: 'payments', element: <PaymentManagement /> },
  { path: 'system', element: <SystemConfig /> },
  { path: 'audit', element: <AuditLogViewer /> },
];
```

The admin module is:
- In a separate route tree (lazy loaded)
- Not included in the main bundle
- Only loaded when an admin navigates to /admin
- Protected by AdminGuard (role check + 2FA verification)

---

## 14. Performance Profiling

### Vite Bundle Analysis

```bash
# Generate bundle visualization
npx vite-bundle-visualizer

# Check for common issues
npx depcheck  # Find unused dependencies
```

### React Profiler

```typescript
// Enable in development
function ProfiledMarketTable(props: MarketTableProps) {
  return (
    <Profiler id="MarketTable" onRender={(id, phase, actualDuration) => {
      if (actualDuration > 16) { // > 1 frame at 60fps
        console.warn(`Slow render: ${id} took ${actualDuration.toFixed(1)}ms`);
      }
    }}>
      <MarketTable {...props} />
    </Profiler>
  );
}
```

### Performance Budget

| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint | < 1.5s | Lighthouse |
| Largest Contentful Paint | < 2.5s | Lighthouse |
| Time to Interactive | < 3.5s | Lighthouse |
| Total Blocking Time | < 200ms | Lighthouse |
| Bundle size (initial) | < 200KB gzip | Vite |
| Bundle size (total) | < 500KB gzip | Vite |

---

## 15. Frontend Observability

### Sentry Browser SDK

```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5,  // Capture replay on 50% of errors
});
```

### Web Vitals Tracking

```typescript
import { onCLS, onFID, onLCP, onFCP, onTTFB } from 'web-vitals';

function reportWebVital(metric: any) {
  // Send to analytics or Prometheus pushgateway
  fetch('/api/v1/metrics/web-vitals', {
    method: 'POST',
    body: JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      page: window.location.pathname,
    }),
  }).catch(() => {}); // Fire and forget
}

onCLS(reportWebVital);
onFID(reportWebVital);
onLCP(reportWebVital);
onFCP(reportWebVital);
onTTFB(reportWebVital);
```

### Frontend Error Tracking

```typescript
// Global unhandled promise rejection
window.addEventListener('unhandledrejection', (event) => {
  Sentry.captureException(event.reason);
});

// WebSocket errors
wsClient.onError((error) => {
  Sentry.captureException(new Error(`WebSocket error: ${error.message}`), {
    tags: { component: 'websocket' },
  });
});

// API errors (non-4xx)
apiClient.interceptors.response.use(null, (error) => {
  if (!error.response || error.response.status >= 500) {
    Sentry.captureException(error, {
      tags: { component: 'api-client' },
      extra: { url: error.config?.url, method: error.config?.method },
    });
  }
  return Promise.reject(error);
});
```
