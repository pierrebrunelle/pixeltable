'use client'

import { useState, useRef } from 'react'
import { Search, Image as ImageIcon, Upload, X } from 'lucide-react'

interface SearchBarProps {
  onTextSearch: (query: string) => void
  onImageSearch: (file: File) => void
  isLoading: boolean
}

export function SearchBar({ onTextSearch, onImageSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'text' | 'image'>('text')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onTextSearch(query.trim())
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleImageSubmit = () => {
    if (selectedImage) {
      onImageSearch(selectedImage)
    }
  }

  const clearImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSearchMode('text')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            searchMode === 'text'
              ? 'bg-kcta text-white'
              : 'bg-kbeige-card text-ktext border border-kbeige-border hover:bg-kbeige-hover'
          }`}
        >
          <Search className="w-4 h-4" />
          Text Search
        </button>
        <button
          onClick={() => setSearchMode('image')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            searchMode === 'image'
              ? 'bg-kcta text-white'
              : 'bg-kbeige-card text-ktext border border-kbeige-border hover:bg-kbeige-hover'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Image Search
        </button>
      </div>

      {/* Text search input */}
      {searchMode === 'text' && (
        <form onSubmit={handleTextSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search videos by description... (e.g., 'luxury travel experience')"
            className="flex-1 px-4 py-2.5 border border-kbeige-border rounded-xl text-sm text-kcta placeholder:text-ktext/50 focus:outline-none focus:ring-2 focus:ring-kblue/30 focus:border-kblue/40"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-5 py-2.5 bg-kcta text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>
      )}

      {/* Image search input */}
      {searchMode === 'image' && (
        <div className="space-y-3">
          {!imagePreview ? (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-kbeige-border rounded-xl cursor-pointer hover:border-kblue/30 transition-colors">
              <Upload className="w-8 h-8 text-kbeige-border mb-2" />
              <span className="text-sm text-ktext">
                Click to upload an image for visual search
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-kbeige-border">
                <img
                  src={imagePreview}
                  alt="Search query"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={clearImage}
                  className="absolute top-1 right-1 p-0.5 bg-black/50 rounded-full"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
              <button
                onClick={handleImageSubmit}
                disabled={isLoading}
                className="px-5 py-2.5 bg-kcta text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? 'Searching...' : 'Search by Image'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
