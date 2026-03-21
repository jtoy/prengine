import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJobPolling } from '@/hooks/use-job-events'

describe('useJobPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls at idle rate (30s) by default', () => {
    const onUpdate = vi.fn()
    renderHook(() => useJobPolling(42, onUpdate))

    act(() => { vi.advanceTimersByTime(10000) })
    expect(onUpdate).toHaveBeenCalledTimes(0)

    act(() => { vi.advanceTimersByTime(20000) })
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('polls at active rate (5s) for processing statuses', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useJobPolling(42, onUpdate))

    act(() => { result.current.setLastStatus('running_agent') })

    act(() => { vi.advanceTimersByTime(5000) })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(5000) })
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('stops polling for terminal statuses', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useJobPolling(42, onUpdate))

    act(() => { result.current.setLastStatus('pr_merged') })

    act(() => { vi.advanceTimersByTime(60000) })
    expect(onUpdate).toHaveBeenCalledTimes(0)
  })

  it('cleans up on unmount', () => {
    const onUpdate = vi.fn()
    const { unmount } = renderHook(() => useJobPolling(42, onUpdate))
    unmount()

    act(() => { vi.advanceTimersByTime(60000) })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
