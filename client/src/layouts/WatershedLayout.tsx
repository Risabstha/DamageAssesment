import type { ReactNode } from "react";
import SideNav from "./SideNav";

export default function WatershedLayout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen font-[system-ui,sans-serif] leading-[normal] text-[#172e3b] [@media_screen_and_(max-width:700px)]:h-auto [@media_screen_and_(max-width:700px)]:flex-col-reverse print:block print:h-auto">
      <SideNav>{sidebar}</SideNav>
      {children}
    </div>
  );
}
