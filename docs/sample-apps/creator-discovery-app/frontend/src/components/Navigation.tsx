'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Search, BarChart3, Home } from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/creator-brand-match', label: 'Creator-Brand Match', icon: Sparkles },
  { href: '/semantic-search', label: 'Semantic Search', icon: Search },
  { href: '/brand-mention-detection', label: 'Brand Mentions', icon: BarChart3 },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-kbeige-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-kblue rounded-md flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-kcta tracking-tight">
              Creator Discovery
            </span>
          </Link>

          <div className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-kblue/[0.08] text-kblue'
                      : 'text-ktext hover:text-kcta hover:bg-kbeige-hover'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
