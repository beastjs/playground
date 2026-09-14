'use client'

import { ReactNode, useMemo, useState } from 'react'

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { [key: string]: JsonValue }
type JsonArray = JsonValue[]

interface JsonViewerProps {
  data: unknown
  maxHeight?: string
  withToolbar?: boolean
  children?: ReactNode
}

type ViewMode = 'tree' | 'raw'

export const JsonViewer = ({ data, maxHeight = 'max-h-96', withToolbar = false, children }: JsonViewerProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  // Expand root level by default
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']))

  const jsonData = useMemo(() => {
    if (data === null || data === undefined) {
      return null
    }
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return parsed
      } catch {
        // If it's not valid JSON, return as string
        return data
      }
    }
    return data
  }, [data])

  const isValidJson = useMemo(() => {
    if (jsonData === null || jsonData === undefined) {
      return false
    }
    if (typeof jsonData === 'string') {
      return false
    }
    return typeof jsonData === 'object' || Array.isArray(jsonData)
  }, [jsonData])

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const isExpanded = (path: string) => expandedPaths.has(path)

  const isExpandable = (value: JsonValue): boolean => {
    return (
      (Array.isArray(value) && value.length > 0) ||
      (typeof value === 'object' && value !== null && Object.keys(value).length > 0)
    )
  }

  const renderValue = (
    value: JsonValue,
    path: string = '',
    depth: number = 0,
    isChild: boolean = false
  ): React.ReactNode => {
    if (value === null) {
      return <span className='font-mono text-zinc-500 dark:text-rose-300 italic'>null</span>
    }

    if (typeof value === 'number') {
      return <span className='font-mono text-sky-600 dark:text-sky-300'>{String(value)}</span>
    }

    if (typeof value === 'boolean') {
      return <span className='font-mono text-indigo-600 dark:text-indigo-400'>{String(value)}</span>
    }

    if (typeof value === 'string') {
      const displayValue = value.length > 100 ? `${value.substring(0, 100)}...` : value
      return (
        <span className='text-orange-500 dark:text-orange-300'>
          &quot;<span className='wrap-break-words'>{displayValue}</span>&quot;
        </span>
      )
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className='text-zinc-500 dark:text-zinc-400'>[]</span>
      }

      const expanded = isExpanded(path)

      // If this is a nested value, don't show button here - parent key handles it
      if (isChild) {
        if (!expanded) {
          return (
            <span className='text-zinc-400 dark:text-zinc-500'>
              [
              <span className='text-zinc-600 dark:text-zinc-400'>
                {value.length} item{value.length !== 1 ? 's' : ''}
              </span>
              ]
            </span>
          )
        }
        return (
          <div className='mt-0.5'>
            <div className='space-y-1.5'>
              {value.map((item, index) => (
                <div key={index} className='flex items-start justify-start gap-2'>
                  <span className='text-zinc-500 dark:text-zinc-500 text-xs shrink-0 mt-0.5'>{index}</span>
                  <div className='flex-1 min-w-0'>{renderValue(item, `${path}[${index}]`, depth + 1)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      return (
        <div>
          <button
            onClick={() => togglePath(path)}
            className='flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group'>
            <span className='text-zinc-400 dark:text-zinc-600 select-none text-[8px] w-3 flex items-center justify-center group-hover:text-zinc-600 dark:group-hover:text-zinc-400'>
              {expanded ? '▼' : '▶'}
            </span>
            <span className='text-zinc-400 dark:text-zinc-500'>[</span>
            <span className='text-zinc-600 dark:text-zinc-400 font-medium'>
              {value.length} item{value.length !== 1 ? 's' : ''}
            </span>
            <span className='text-zinc-400 dark:text-zinc-500'>]</span>
          </button>
          {expanded && (
            <div className='mt-1.5 space-y-1.5'>
              {value.map((item, index) => (
                <div key={index} className='flex items-center gap-1'>
                  <span className='text-zinc-500 dark:text-zinc-500 text-[8px] shrink-0 mt-0.5'>{index}</span>
                  <div className='flex-1 min-w-0'>{renderValue(item, `${path}[${index}]`, depth + 1)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (typeof value === 'object') {
      const obj = value as JsonObject
      const keys = Object.keys(obj)

      if (keys.length === 0) {
        return <span className='text-zinc-500 dark:text-zinc-400'>{'()'}</span>
      }

      const expanded = isExpanded(path)

      // If this is a nested value, don't show button here - parent key handles it
      if (isChild) {
        if (!expanded) {
          return (
            <span className='text-zinc-400 dark:text-zinc-500'>
              {'('}
              <span className='text-zinc-600 dark:text-zinc-400'>
                {keys.length} key{keys.length !== 1 ? 's' : ''}
              </span>
              {')'}
            </span>
          )
        }
        return (
          <div className='mt-0.5'>
            <div className='space-y-1.5'>
              {keys.map((key) => {
                const keyPath = path ? `${path}.${key}` : key
                const childValue = obj[key]
                const childExpandable = isExpandable(childValue)
                const childExpanded = isExpanded(keyPath)

                return (
                  <div key={key} className='flex items-start gap-2'>
                    {childExpandable ? (
                      <button
                        onClick={() => togglePath(keyPath)}
                        className='flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group shrink-0'>
                        <span className='text-zinc-400 dark:text-zinc-600 select-none text-[8px] w-3 flex items-center justify-center group-hover:text-zinc-600 dark:group-hover:text-zinc-400'>
                          {childExpanded ? '▼' : '▶'}
                        </span>
                        <span className='font-medium'>{key}:</span>
                      </button>
                    ) : (
                      <span className='text-zinc-700 dark:text-zinc-300 font-medium shrink-0'>{key}:</span>
                    )}
                    <div className='flex-1 min-w-0'>{renderValue(childValue, keyPath, depth + 1)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }

      return (
        <div>
          <button
            onClick={() => togglePath(path)}
            className='flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group'>
            <span className='text-zinc-400 dark:text-zinc-600 select-none text-[10px] w-3 flex items-center justify-center group-hover:text-zinc-600 dark:group-hover:text-zinc-400'>
              {expanded ? '▼' : '▶'}
            </span>
            <span className='text-zinc-400 dark:text-zinc-500'>{'{'}</span>
            <span className='text-zinc-600 dark:text-zinc-400 font-medium'>
              {keys.length} key{keys.length !== 1 ? 's' : ''}
            </span>
            <span className='text-zinc-400 dark:text-zinc-500'>{'}'}</span>
          </button>
          {expanded && (
            <div className='mt-1.5 space-y-1.5'>
              {keys.map((key) => {
                const keyPath = path ? `${path}.${key}` : key
                const childValue = obj[key]
                const childExpandable = isExpandable(childValue)
                const childExpanded = isExpanded(keyPath)

                return (
                  <div key={key} className='flex items-start gap-2'>
                    {childExpandable ? (
                      <button
                        onClick={() => togglePath(keyPath)}
                        className='flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group shrink-0'>
                        <span className='text-zinc-400 dark:text-zinc-600 select-none text-[10px] w-3 flex items-center justify-center group-hover:text-zinc-600 dark:group-hover:text-zinc-400'>
                          {childExpanded ? '▼' : '▶'}
                        </span>
                        <span className='font-medium'>{key}:</span>
                      </button>
                    ) : (
                      <span className='text-zinc-700 dark:text-zinc-300 font-medium shrink-0'>{key}:</span>
                    )}
                    <div className='flex-1 min-w-0'>{renderValue(childValue, keyPath, depth + 1)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return <span className='text-zinc-600 dark:text-zinc-400'>{String(value)}</span>
  }

  const formattedJson = useMemo(() => {
    if (jsonData === null || jsonData === undefined) {
      return 'null'
    }
    if (typeof jsonData === 'string') {
      return jsonData
    }
    try {
      return JSON.stringify(jsonData, null, 2)
    } catch {
      return String(jsonData)
    }
  }, [jsonData])

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson)
    // You could add a toast notification here
  }

  if (jsonData === null || jsonData === undefined) {
    return (
      <div className='p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded'>
        <span className='text-xs text-zinc-500 dark:text-zinc-400 italic'>No data</span>
      </div>
    )
  }

  // If it's a plain string (not JSON), just show it
  if (typeof jsonData === 'string') {
    return (
      <div className='space-y-2'>
        <div className='flex items-center justify-end'>
          <button
            onClick={handleCopy}
            className='font-mono text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors'>
            copy
          </button>
        </div>
        <div
          className={`p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded overflow-auto ${maxHeight}`}>
          <pre className='text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap wrap-break-word'>
            {jsonData}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {/* Toolbar */}
      <div className='flex items-center space-x-2 h-10 px-1'>
        {children}
        {withToolbar && (
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1'>
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1 text-xs font-mono rounded transition-all ${
                  viewMode === 'tree'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}>
                tree
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 text-xs font-mono rounded transition-all ${
                  viewMode === 'raw'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}>
                raw
              </button>
            </div>
            <button
              onClick={handleCopy}
              className='font-mono text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors'>
              copy
            </button>
          </div>
        )}
      </div>
      {/* Content */}
      <div
        className={`p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded overflow-auto ${maxHeight}`}>
        {viewMode === 'tree' && isValidJson ? (
          <div className='font-mono text-xs leading-relaxed'>{renderValue(jsonData as JsonValue)}</div>
        ) : (
          <pre className='text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap wrap-break-word'>
            {formattedJson}
          </pre>
        )}
      </div>
    </div>
  )
}
