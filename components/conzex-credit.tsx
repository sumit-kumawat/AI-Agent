import { BRAND } from "@/lib/brand";

export function ConzexCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      A Product Of{" "}
      <a
        href={BRAND.companyUrl}
        target="_blank"
        rel="noopener"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {BRAND.company}
      </a>
    </p>
  );
}
