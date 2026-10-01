/**
 * Thin-line Dubai skyline: a dhow on the creek, Burj Al Arab's sail,
 * the Museum of the Future torus, Emirates-style towers, Burj Khalifa,
 * a mosque dome and minaret, and the Dubai Frame. Pure line-art, drawn in
 * currentColor so it follows the theme (defaults to --skyline-color).
 */
export function Skyline({
  className = "",
  animate = false,
  strokeWidth = 1.25,
  color = "var(--skyline-color)",
}: {
  className?: string;
  animate?: boolean;
  strokeWidth?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 1200 160"
      preserveAspectRatio="xMidYMax meet"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${animate ? "skyline-draw" : ""} ${className}`}
      style={{ color }}
    >
      <g className="skyline-night" stroke="none" fill="currentColor">
        <circle cx="180" cy="40" r="1.4" />
        <circle cx="330" cy="22" r="1" />
        <circle cx="440" cy="54" r="1.2" />
        <circle cx="600" cy="18" r="1" />
        <circle cx="700" cy="44" r="1.3" />
        <circle cx="860" cy="26" r="1" />
        <circle cx="930" cy="58" r="1.2" />
        <circle cx="1130" cy="36" r="1.4" />
        <path d="M1010 20a14 14 0 1 0 12 22a11 11 0 1 1 -12 -22z" opacity="0.9" />
      </g>
      <g vectorEffect="non-scaling-stroke">
        {/* waterline + gentle waves */}
        <path d="M0 150H1200" />
        <path d="M20 157q8 -4 16 0t16 0M190 157q8 -4 16 0t16 0M400 157q8 -4 16 0t16 0" opacity="0.6" />

        {/* dhow */}
        <path d="M58 136Q112 150 172 134L164 145Q114 156 68 146Z" />
        <path d="M112 140V80" />
        <path d="M86 92L156 70" />
        <path d="M90 92Q120 104 152 128L112 130" />
        <path d="M112 80l8 -4" />

        {/* Burj Al Arab */}
        <path d="M226 150H316" />
        <path d="M252 150V36" />
        <path d="M252 28V36" />
        <path d="M252 40Q312 66 302 150" />
        <path d="M252 64Q292 84 290 150" />
        <path d="M252 92Q276 106 278 150" />
        <path d="M296 112h16" />
        <circle cx="314" cy="112" r="5" />

        {/* tower cluster */}
        <path d="M336 150V94H354V150" />
        <path d="M360 150V70H374V150" />
        <path d="M367 70V60" />
        <path d="M382 150V86L394 72L406 86V150" />

        {/* Museum of the Future */}
        <path d="M444 150Q514 126 584 150" />
        <ellipse cx="514" cy="104" rx="40" ry="35" />
        <ellipse cx="518" cy="102" rx="19" ry="17" />
        <path d="M488 90q6 -6 12 0M528 124q8 -4 12 2M496 118q4 4 10 2" opacity="0.7" />

        {/* Emirates-style towers */}
        <path d="M604 150V60L616 42L628 60V150" />
        <path d="M636 150V76L646 62L656 76V150" />
        <path d="M676 150V104H694V150" />

        {/* Burj Khalifa */}
        <path d="M728 150V128H734V104H740V78H746V52H751V30H755V12L758 0L761 12V30H765V52H770V78H776V104H782V128H788V150" />
        <path d="M758 150V14" opacity="0.55" />

        {/* towers */}
        <path d="M806 150V88Q816 80 826 88V150" />
        <path d="M836 150V64H852V150" />
        <path d="M844 64V52" />
        <path d="M862 150V100H884V150" />
        <path d="M892 150V78Q900 70 908 78V150" />

        {/* mosque dome + minaret */}
        <path d="M940 150V128Q966 96 992 128V150" />
        <path d="M966 102V96" />
        <path d="M1004 150V88H1012V150" />
        <path d="M1004 88L1008 78L1012 88" />
        <path d="M1002 104H1014" />

        {/* Dubai Frame */}
        <path d="M1048 150V58H1104V150" />
        <path d="M1058 150V68H1094V150" />
        <path d="M1048 64H1104" opacity="0.6" />

        {/* far towers */}
        <path d="M1128 150V96H1144V150" />
        <path d="M1152 150V112H1170V150" />
        <path d="M1176 150V120H1190V150" />
      </g>
    </svg>
  );
}
