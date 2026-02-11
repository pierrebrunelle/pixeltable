'use client'

import Link from 'next/link'
import { Sparkles, Search, BarChart3, ArrowRight, Database, Zap, GitBranch } from 'lucide-react'

const features = [
  {
    href: '/creator-brand-match',
    title: 'Creator-Brand Match',
    desc: 'Find partnerships using multimodal embeddings and semantic similarity.',
    icon: Sparkles,
    tags: ['Embedding Index', 'Similarity Search', 'VideoSplitter'],
  },
  {
    href: '/semantic-search',
    title: 'Semantic Search',
    desc: 'Search video libraries with natural language or images via cross-modal embeddings.',
    icon: Search,
    tags: ['Text-to-Video', 'Image-to-Video', 'Cross-modal'],
  },
  {
    href: '/brand-mention-detection',
    title: 'Brand Mention Detection',
    desc: 'Detect and visualize brand appearances with interactive heatmaps.',
    icon: BarChart3,
    tags: ['FrameIterator', 'Custom UDFs', 'OpenAI Vision'],
  },
]

const infra = [
  { icon: Database, label: 'Declarative Tables & Views' },
  { icon: Zap, label: 'Automatic Embeddings' },
  { icon: GitBranch, label: 'Full Backend — No Pinecone' },
]

export default function HomePage() {
  return (
    <div className="h-full flex flex-col justify-center px-6 py-6 max-w-6xl mx-auto">
      {/* Hero — compact */}
      <div className="text-center mb-6 animate-fade-in">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-kblue/[0.06] text-kblue text-xs font-semibold mb-3 border border-kblue/10">
          <Sparkles className="w-3.5 h-3.5" />
          Powered by Pixeltable + Twelve Labs
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-kcta mb-2 tracking-tight">
          Creator Discovery
        </h1>
        <p className="text-sm text-ktext max-w-lg mx-auto leading-relaxed">
          Match brands with creators, search video content semantically, and detect
          brand mentions — built on Pixeltable&apos;s declarative data infrastructure.
        </p>
      </div>

      {/* Feature cards — 3 columns, compact */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {features.map((f, i) => {
          const Icon = f.icon
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`animate-fade-in-delay-${i + 1} group bg-white rounded-xl border border-kbeige-border p-5 transition-all duration-200 hover:shadow-lg hover:shadow-kblue/[0.06] hover:-translate-y-0.5 hover:border-kblue/20`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-kblue flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-kcta tracking-tight leading-tight">
                    {f.title}
                  </h2>
                  <p className="text-xs text-ktext mt-1 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {f.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-px text-[10px] rounded bg-kbeige-card text-ktext/70 border border-kbeige-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-semibold text-kblue flex items-center gap-0.5 group-hover:gap-1.5 transition-all">
                  Try it <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Infrastructure strip — single row, compact */}
      <div className="bg-white rounded-xl border border-kbeige-border px-5 py-4 animate-fade-in-delay-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-kcta tracking-tight">
            How Pixeltable Powers This App
          </p>
          <div className="flex items-center gap-5">
            {infra.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-kblue" />
                  <span className="text-[11px] text-ktext font-medium">{item.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
