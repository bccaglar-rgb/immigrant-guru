import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  module?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.module ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center p-4 text-[11px] text-[#6B6F76] border border-white/[0.06] rounded-lg bg-white/[0.02]">
          <span>Something went wrong{this.props.module ? ` in ${this.props.module}` : ""}. </span>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="ml-2 text-[#F5C542] hover:underline">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
