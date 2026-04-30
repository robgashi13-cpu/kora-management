import { Component, Fragment, ReactNode } from 'react';

type Props = { children: ReactNode };

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error', error, info?.componentStack);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  private handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-8 text-center text-slate-900">
          <div className="premium-card w-full max-w-md bg-white p-8">
            <h1 className="text-lg font-semibold">Something went wrong.</h1>
            <p className="mt-2 text-sm text-slate-600">
              We hit an unexpected error. Try again before refreshing the page.
            </p>

            {process.env.NODE_ENV !== 'production' && this.state.error ? (
              <p className="mt-3 break-words rounded-md bg-slate-100 px-3 py-2 text-left text-xs text-slate-700">
                {this.state.error.message}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={this.handleRefresh}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <Fragment>{this.props.children}</Fragment>;
  }
}
