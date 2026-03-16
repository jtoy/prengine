import '@testing-library/jest-dom/vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock EventSource
class MockEventSource {
  url: string
  onmessage: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onopen: ((event: any) => void) | null = null
  readyState = 0
  close() { this.readyState = 2 }
  constructor(url: string) {
    this.url = url
    this.readyState = 1
  }
}
Object.defineProperty(globalThis, 'EventSource', { value: MockEventSource })
