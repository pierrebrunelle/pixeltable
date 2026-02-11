import type { Metadata } from 'next'
import './globals.css'
import { Navigation } from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'Creator Discovery - Powered by Pixeltable + Twelve Labs',
  description: 'AI-powered creator-brand matching platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="h-screen flex flex-col overflow-hidden">
          <Navigation />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  )
}
