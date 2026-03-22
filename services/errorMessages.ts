import { ApiError } from './api';

export type ErrorContext =
  | 'login'
  | 'register'
  | 'analytics'
  | 'news'
  | 'ai-picks'
  | 'backtest'
  | 'broker-connect'
  | 'generic';

const fallbackByContext: Record<ErrorContext, string> = {
  login: 'Login failed. Please check your credentials and try again.',
  register: 'Registration failed. Please review your details and try again.',
  analytics: 'Could not load analytics right now. Please retry.',
  news: 'Could not fetch news analysis right now. Please retry.',
  'ai-picks': 'Could not fetch AI picks right now. Please retry.',
  backtest: 'Backtest failed. Please retry with a different symbol or strategy.',
  'broker-connect': 'Could not connect to broker. Verify credentials and try again.',
  generic: 'Something went wrong. Please try again.'
};

export function getUserErrorMessage(err: unknown, context: ErrorContext = 'generic'): string {
  if (err instanceof ApiError) {
    const message = err.message?.trim();

    if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
      const seconds = err.retryAfterSeconds && err.retryAfterSeconds > 0 ? err.retryAfterSeconds : 60;
      return `Too many requests. Please wait ${seconds} seconds and try again.`;
    }

    if (err.status === 401) {
      if (context === 'login') return message || 'Invalid username or password.';
      return message || 'Session expired. Please login again.';
    }

    if (err.status === 400) {
      if (context === 'register') return message || 'Invalid registration details. Please review and retry.';
      return message || fallbackByContext[context];
    }

    if (err.status >= 500) {
      return 'Server error. Please try again in a moment.';
    }

    return message || fallbackByContext[context];
  }

  if (err instanceof Error && err.message?.trim()) {
    return err.message.trim();
  }

  return fallbackByContext[context];
}
