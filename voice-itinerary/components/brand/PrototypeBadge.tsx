export function PrototypeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/50 bg-gold/10 px-2 py-[3px] text-[10.5px] font-semibold tracking-[0.02em] sm:px-2.5 sm:text-[10px] sm:uppercase sm:tracking-[0.14em] text-gold-ink ${className}`}
      title="This is an illustrative prototype, not an official service."
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
      Illustrative prototype
    </span>
  );
}
