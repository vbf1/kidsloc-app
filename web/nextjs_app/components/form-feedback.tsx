import type { ReactNode } from 'react';

type FeedbackVariant = 'error' | 'success' | 'info';

const variantClasses: Record<FeedbackVariant, string> = {
  error: 'border border-red-200 bg-red-50 text-red-800',
  success: 'border border-green-200 bg-green-50 text-green-800',
  info: 'border border-purple-200 bg-purple-50 text-purple-800',
};

export function FormFeedback({
  children,
  variant = 'error',
}: {
  children: ReactNode;
  variant?: FeedbackVariant;
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`rounded-xl border p-3 text-sm leading-5 ${variantClasses[variant]}`}
    >
      {children}
    </div>
  );
}

export function FieldFeedback({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs leading-5 text-red-700" aria-live="polite">
      {children}
    </p>
  );
}
