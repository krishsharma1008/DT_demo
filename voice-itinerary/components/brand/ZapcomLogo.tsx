/**
 * The ONE place the Zapcom logo is rendered. Swap the asset at
 * public/brand/zapcom-logo.svg (and LOGO_RATIO if its proportions differ).
 *
 * - mode="mono" (default): the SVG is used as a mask, so the logo takes the
 *   current text colour (var(--brand-zapcom) unless overridden) and adapts
 *   to light / dark themes automatically.
 * - mode="image": renders the file as-is — use this if the official asset is
 *   a full-colour logo.
 */
const LOGO_SRC = "/brand/zapcom-logo.svg";
const LOGO_RATIO = 132 / 32; // width / height of the asset's viewBox

export function ZapcomLogo({
  height = 14,
  mode = "mono",
  className = "",
}: {
  height?: number;
  mode?: "mono" | "image";
  className?: string;
}) {
  const width = Math.round(height * LOGO_RATIO);
  if (mode === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={LOGO_SRC} alt="Zapcom" width={width} height={height} className={className} />;
  }
  return (
    <span
      role="img"
      aria-label="Zapcom"
      className={`inline-block shrink-0 ${className}`}
      style={{
        width,
        height,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${LOGO_SRC})`,
        maskImage: `url(${LOGO_SRC})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}
