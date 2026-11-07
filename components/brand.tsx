export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8 23.5V8.5h3.1l4.9 9.2V8.5H19v15h-3.1L11 14.2v9.3H8Zm13.2 0V8.5H24v15h-2.8Z"
        fill="white"
      />
    </svg>
  );
}
