'use client'

import { useState, useRef } from 'react'
import { Upload, RefreshCw, X } from 'lucide-react'
import { uploadVideo } from '@/lib/api'
import type { VideoSource } from '@/lib/types'

interface VideoUploadProps {
  onUploaded: () => void
}

export function VideoUpload({ onUploaded }: VideoUploadProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState<VideoSource>('brand')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setTitle('')
    setCategory('')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!file || !title.trim()) return
    setIsUploading(true)
    setError(null)
    try {
      await uploadVideo(file, title.trim(), category.trim(), source)
      reset()
      setIsOpen(false)
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-kblue text-white hover:bg-kblue-hover transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Upload Video
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-kbeige-border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-kcta">Upload Video</h3>
        <button onClick={() => { reset(); setIsOpen(false) }} className="p-1 rounded hover:bg-kbeige-hover">
          <X className="w-4 h-4 text-ktext" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-ktext mb-1">Video file</label>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-ktext file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-kbeige-card file:text-ktext"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ktext mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video title"
            className="w-full px-2.5 py-1.5 border border-kbeige-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-kblue/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ktext mb-1">Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Travel & Lifestyle"
            className="w-full px-2.5 py-1.5 border border-kbeige-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-kblue/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ktext mb-1">Library</label>
          <div className="flex gap-1">
            {(['brand', 'creator'] as VideoSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  source === s ? 'bg-kcta text-white' : 'bg-kbeige-card text-ktext border border-kbeige-border'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-kred mb-2">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!file || !title.trim() || isUploading}
        className="flex items-center gap-1.5 px-4 py-2 bg-kcta text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isUploading ? (
          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading & indexing…</>
        ) : (
          <><Upload className="w-3.5 h-3.5" /> Upload</>
        )}
      </button>
    </div>
  )
}
