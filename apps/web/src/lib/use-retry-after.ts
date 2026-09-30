import { useEffect, useRef, useState } from 'react'

/**
 * A 429's wait, counted down a second at a time, and one retry when it runs
 * out (`found-30-sep/public-pages-read-429-as-gone`). A public page refused for
 * too many requests says when it will try again and then does, rather than
 * saying its link is gone.
 *
 * `seconds` is the wait the refusal asked for, or null when there is nothing
 * to wait for; `since` tells one refusal from the next (the query's
 * `errorUpdatedAt`), so a second refusal with the same wait starts a fresh
 * count. Answers the seconds left, or null.
 */
export function useRetryAfter(seconds: number | null, since: number, retry: () => void): number | null {
  const [left, setLeft] = useState<number | null>(seconds)
  const retryRef = useRef(retry)
  retryRef.current = retry

  useEffect(() => {
    setLeft(seconds)
  }, [seconds, since])

  useEffect(() => {
    if (left === null) return
    if (left <= 0) {
      retryRef.current()
      return
    }
    const tick = setTimeout(() => setLeft((s) => (s === null ? null : s - 1)), 1000)
    return () => clearTimeout(tick)
  }, [left])

  return left
}
