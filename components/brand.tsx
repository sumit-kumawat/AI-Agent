/** The xAI mark: a rounded tile with an "x". It takes the current text colour. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 10l12 12M22 10L10 22" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
