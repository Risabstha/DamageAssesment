import type { ReactNode } from 'react'

export default function SideNav({ children }: { children: ReactNode }) {
  return (
    <aside className="w-[410px] flex-[0_0_410px] overflow-y-auto border-r border-[#dce5e8] bg-[#f7fafb] [@media_screen_and_(max-width:700px)]:w-full [@media_screen_and_(max-width:700px)]:flex-auto [@media_screen_and_(max-width:700px)]:overflow-visible print:w-full print:overflow-visible">
      <header className="border-b border-[#dce5e8] bg-[#103c47] px-6 py-[22px] text-white">
        <span className="text-[.7rem] font-bold tracking-[.16em] text-[#83d2cb]">Antarikchya Disaster Protocol</span>
        <h1 className="my-2 text-[1.65rem] font-bold">Damage Assessment</h1>
        <p className="mt-2 mb-3 text-[.87rem] leading-[1.5] text-[#c6dce0]">Explore population, land cover, buildings and administrative units.</p>
      </header>
      {children}
    </aside>
  )
}
