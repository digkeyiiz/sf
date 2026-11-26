import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  componentDidCatch(error: Error) {
    console.error('App ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090C12] text-slate-200 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#101522] border border-white/15 rounded-xl p-6 space-y-4 text-center">
            <h2 className="font-display text-xl font-bold text-amber-400">
              เกิดข้อผิดพลาดในการแสดงผล
            </h2>
            <p className="text-xs text-slate-400 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-[#090C12] font-display font-bold text-sm rounded-md cursor-pointer transition-colors"
            >
              โหลดหน้าเกมใหม่
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
