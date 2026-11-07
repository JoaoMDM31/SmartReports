// BASE_URL is "/" at the domain root and "/SmartReports/" on GitHub Pages (always ends with "/").
const BASE_URL = import.meta.env.BASE_URL;

export const BRAND_ASSETS = {
  horizontal: `${BASE_URL}assets/brand/smartreports-logo-horizontal.svg`,
  icon: `${BASE_URL}assets/brand/smartreports-icon.svg`,
};

export default function BrandLogo({ variant = "horizontal", compact = false }) {
  const src = variant === "icon" ? BRAND_ASSETS.icon : BRAND_ASSETS.horizontal;
  const className = compact ? "brand-logo compact" : "brand-logo";

  if (variant === "icon") {
    return <img className={className} src={src} alt="SmartReports" />;
  }

  return (
    <span className={className}>
      <img src={src} alt="SmartReports" />
    </span>
  );
}
