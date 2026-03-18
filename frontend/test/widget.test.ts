import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import * as fs from 'fs'
import * as path from 'path'

const widgetSource = fs.readFileSync(
  path.resolve(__dirname, '../public/widget.js'),
  'utf-8'
)

function setupWidgetEnv(options: { showMode?: string; tokenKey?: string } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  })

  const { window } = dom
  const { document } = window

  // Setup localStorage with token
  const tokenKey = options.tokenKey || 'prengine_token'
  window.localStorage.setItem(tokenKey, 'test-token-123')

  // Add script tag with data attributes
  const scriptTag = document.createElement('script')
  scriptTag.setAttribute('data-project', 'test-project')
  scriptTag.setAttribute('data-show', options.showMode || 'always')
  scriptTag.setAttribute('src', 'http://localhost/widget.js')
  document.body.appendChild(scriptTag)

  // Execute the widget code
  window.eval(widgetSource)

  return { dom, window, document }
}

describe('widget.js', () => {
  describe('recording state prevents modal close', () => {
    it('should close modal on overlay click when not recording', () => {
      const { document, window } = setupWidgetEnv()

      // Open modal by clicking widget button
      const btn = document.getElementById('prengine-widget-btn')
      expect(btn).toBeTruthy()
      btn!.click()

      const overlay = document.getElementById('prengine-widget-overlay')
      expect(overlay).toBeTruthy()

      // Click on overlay background (not recording)
      const clickEvent = new window.MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: overlay })
      overlay!.dispatchEvent(clickEvent)

      // Modal should be closed
      expect(document.getElementById('prengine-widget-overlay')).toBeNull()
    })

    it('should NOT close modal on overlay click when recording is active', () => {
      const { document, window } = setupWidgetEnv()

      // Open modal
      const btn = document.getElementById('prengine-widget-btn')
      btn!.click()

      const overlay = document.getElementById('prengine-widget-overlay')
      expect(overlay).toBeTruthy()

      // Simulate recording state message from iframe
      const recordingMsg = new window.MessageEvent('message', {
        data: { type: 'PRENGINE_RECORDING_STATE', recording: true },
      })
      window.dispatchEvent(recordingMsg)

      // Click on overlay background while recording
      const clickEvent = new window.MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: overlay })
      overlay!.dispatchEvent(clickEvent)

      // Modal should still be open
      expect(document.getElementById('prengine-widget-overlay')).toBeTruthy()
    })

    it('should close modal on overlay click after recording stops', () => {
      const { document, window } = setupWidgetEnv()

      // Open modal
      const btn = document.getElementById('prengine-widget-btn')
      btn!.click()

      const overlay = document.getElementById('prengine-widget-overlay')
      expect(overlay).toBeTruthy()

      // Start recording
      window.dispatchEvent(new window.MessageEvent('message', {
        data: { type: 'PRENGINE_RECORDING_STATE', recording: true },
      }))

      // Stop recording
      window.dispatchEvent(new window.MessageEvent('message', {
        data: { type: 'PRENGINE_RECORDING_STATE', recording: false },
      }))

      // Click overlay - should close now
      const clickEvent = new window.MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: overlay })
      overlay!.dispatchEvent(clickEvent)

      expect(document.getElementById('prengine-widget-overlay')).toBeNull()
    })

    it('should NOT close modal via close button when recording is active', () => {
      const { document, window } = setupWidgetEnv()

      // Open modal
      const btn = document.getElementById('prengine-widget-btn')
      btn!.click()

      const overlay = document.getElementById('prengine-widget-overlay')
      expect(overlay).toBeTruthy()

      // Start recording
      window.dispatchEvent(new window.MessageEvent('message', {
        data: { type: 'PRENGINE_RECORDING_STATE', recording: true },
      }))

      // Find the close button (× button inside the container)
      const closeBtn = overlay!.querySelector('button[aria-label="Close"]') as HTMLElement
      expect(closeBtn).toBeTruthy()
      closeBtn.click()

      // Modal should still be open
      expect(document.getElementById('prengine-widget-overlay')).toBeTruthy()
    })
  })
})
