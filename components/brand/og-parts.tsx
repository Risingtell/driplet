// Shared pieces of the link-preview images (app/opengraph-image.tsx and
// app/watch/[slug]/opengraph-image.tsx). Plain inline styles only: these render
// through next/og, not the browser, so Tailwind classes don't apply.

export function DripletMark({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#081b1f" />
      <path d="M16 5c0 0-8 9.2-8 14.5a8 8 0 0 0 16 0C24 14.2 16 5 16 5z" fill="#2dd4bf" />
      <path
        d="M16 5c0 0-8 9.2-8 14.5a8 8 0 0 0 16 0C24 14.2 16 5 16 5z"
        fill="#5eead4"
        opacity="0.25"
      />
      <circle cx="13" cy="18.5" r="2.2" fill="#081b1f" opacity="0.35" />
    </svg>
  );
}

export const OG_BACKGROUND = "linear-gradient(135deg, #062027 0%, #041014 55%, #05262c 100%)";
