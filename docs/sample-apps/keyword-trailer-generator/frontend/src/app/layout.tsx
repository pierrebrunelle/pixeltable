import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Keyword Trailer Generator',
  description: 'Search video scenes by keyword and generate on-demand trailers with Pixeltable',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
