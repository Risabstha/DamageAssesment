import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../api/Api'
import { getRiverBuffer } from '../api/RiverStreamsApi'
import type { RiverBuffer } from '../api/RiverStreamsApi'

type Result = { key: string; streamId: number; buffer: RiverBuffer | null; error: string }

export function useRiverBuffer(streamId: number | null, distance: number | null) {
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = streamId === null || distance === null ? null : `${streamId}:${distance}:${attempt}`

  useEffect(() => {
    if (streamId === null || distance === null) return
    const requestKey = `${streamId}:${distance}:${attempt}`
    const controller = new AbortController()
    const timer = setTimeout(() => {
      getRiverBuffer(streamId, distance, controller.signal)
        .then(buffer => setResult({ key: requestKey, streamId, buffer, error: '' }))
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({ key: requestKey, streamId, buffer: null, error: errorMessage(error, 'Could not create buffer.') })
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [streamId, distance, attempt])

  const current = result?.key === key ? result : null
  return {
    buffer: current?.buffer ?? null,
    // Keep showing the previous buffer for the same stream while a new distance loads.
    preview: key === null ? null : current?.buffer ?? (result?.streamId === streamId ? result?.buffer ?? null : null),
    error: current?.error ?? '',
    loading: key !== null && !current,
    retry: useCallback(() => setAttempt(value => value + 1), []),
  }
}
