export const BRAND_ASSETS = {
  horizontal: "/assets/brand/smartreports-logo-horizontal.svg",
  icon: "/assets/brand/smartreports-icon.svg",
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
