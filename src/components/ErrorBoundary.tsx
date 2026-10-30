import { Component, type ReactNode } from 'react';
import { EmptyState } from './EmptyState';

/** 화면 코드가 멈추면 흰 화면 대신 안내 + 새로고침 (관제·제보 화면 공통) */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(e: unknown) {
    console.error('화면 오류', e);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash">
        <h1 className="vh">화면 오류</h1>
        <EmptyState kind="broken" title="화면을 표시하는 중 문제가 생겼습니다" desc="새로고침하면 대부분 해결됩니다. 계속되면 담당자에게 알려 주세요."
          action={{ label: '새로고침', onClick: () => location.reload() }} />
      </main>
    );
  }
}
