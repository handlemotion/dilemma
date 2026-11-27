import { describe, expect, it } from 'vitest'
import { formatTimelineTime, parseTimelineTime } from './timeline-timecode.ts'

describe('timeline time input', () => {
  it('interprets a bare number as a frame at either frame rate', () => {
    expect(parseTimelineTime('24', 24)).toBe(24)
    expect(parseTimelineTime(' 24 ', 30)).toBe(24)
    expect(formatTimelineTime(24, 24)).toBe('00:01:00')
    expect(formatTimelineTime(24, 30)).toBe('00:00:24')
  })

  it('uses the clip frame rate for time input', () => {
    expect(parseTimelineTime('00:01:04', 24)).toBe(28)
    expect(parseTimelineTime('1s', 30)).toBe(30)
    expect(parseTimelineTime('1.5s', 24)).toBe(36)
    expect(parseTimelineTime('01:05', 24)).toBe(1560)
    expect(parseTimelineTime(formatTimelineTime(-2410, 24), 24)).toBe(-2410)
  })

  it('rejects incomplete input, invalid components and unsafe frame numbers', () => {
    for (const input of ['', '24.5', '1:', '00:60:12', '00:00:24', '9007199254740992']) {
      expect(parseTimelineTime(input, 24)).toBeUndefined()
    }
  })
})
