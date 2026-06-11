import { describe, it, expect } from 'vitest'
import { linkDisplayProps } from '../linkDisplay'

describe('linkDisplayProps', () => {
  describe('visibility by strength', () => {
    it('is visible at strength 1.0', () => {
      expect(linkDisplayProps(1.0, 'model-drawn').visible).toBe(true)
    })

    it('is visible at strength 0.5', () => {
      expect(linkDisplayProps(0.5, 'model-drawn').visible).toBe(true)
    })

    it('is not visible below 0.5', () => {
      expect(linkDisplayProps(0.49, 'model-drawn').visible).toBe(false)
    })

    it('is not visible at 0', () => {
      expect(linkDisplayProps(0, 'model-drawn').visible).toBe(false)
    })
  })

  describe('stroke weight and opacity at strength 1.0', () => {
    it('uses 2px stroke', () => {
      expect(linkDisplayProps(1.0, 'model-drawn').strokeWidth).toBe(2)
    })

    it('uses opacity 1.0', () => {
      expect(linkDisplayProps(1.0, 'model-drawn').opacity).toBe(1.0)
    })
  })

  describe('stroke weight and opacity at strength 0.5–0.99', () => {
    it('uses 1px stroke at 0.8', () => {
      expect(linkDisplayProps(0.8, 'model-drawn').strokeWidth).toBe(1)
    })

    it('uses opacity 0.6 at 0.8', () => {
      expect(linkDisplayProps(0.8, 'model-drawn').opacity).toBe(0.6)
    })

    it('uses 1px stroke at 0.5', () => {
      expect(linkDisplayProps(0.5, 'model-drawn').strokeWidth).toBe(1)
    })

    it('uses 1px stroke at 0.99', () => {
      expect(linkDisplayProps(0.99, 'model-drawn').strokeWidth).toBe(1)
    })
  })

  describe('dash style by provenance', () => {
    it('model-drawn links are dashed', () => {
      const props = linkDisplayProps(0.8, 'model-drawn')
      expect(props.strokeDasharray).toBeTruthy()
    })

    it('user-pinned links are solid (no dash)', () => {
      const props = linkDisplayProps(0.8, 'user-pinned')
      expect(props.strokeDasharray).toBe('none')
    })

    it('user-made links are solid (no dash)', () => {
      const props = linkDisplayProps(0.8, 'user-made')
      expect(props.strokeDasharray).toBe('none')
    })

    it('dismissed links are not visible', () => {
      expect(linkDisplayProps(0.9, 'dismissed').visible).toBe(false)
    })
  })
})
