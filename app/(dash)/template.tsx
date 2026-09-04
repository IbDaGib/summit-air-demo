/**
 * Remounts on every route change under (dash), so each page fades in rather
 * than snapping. Opacity only: no transform, no layout shift, 200ms. The
 * sidebar, header and toaster live in layout.tsx and are untouched by this.
 */
export default function DashTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col animate-in fade-in-0 duration-200">{children}</div>;
}
