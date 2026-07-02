import LoadingSpinner from './LoadingSpinner';

interface PageLoaderProps {
  /** Optional text shown under the spinner. Pass "" to hide it entirely. */
  label?: string;
  /**
   * Center over the full viewport height (use for routes rendered outside the
   * app layout, e.g. the auth gate). Defaults to filling the content area.
   */
  fullScreen?: boolean;
  /** Diameter of the spinner in pixels (forwarded to LoadingSpinner). */
  size?: number;
}

/**
 * Standard page-level loading indicator. Centers the shared LoadingSpinner
 * and exposes an accessible status region so screen readers announce loading.
 * Use this everywhere a page is waiting on its initial data fetch.
 */
export default function PageLoader({ label = 'Loading…', fullScreen = false, size }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center gap-4 ${fullScreen ? 'h-screen' : 'min-h-[60vh]'}`}
    >
      <LoadingSpinner size={size} />
      {label !== '' && <p className="text-sm text-gray-500">{label}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );
}
