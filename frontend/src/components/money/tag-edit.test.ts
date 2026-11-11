import { describe, expect, it } from 'vitest'
import { completeTag, removeTag, tagSuggestions, tagsIn, toggleTag, typedTag } from './tag-edit'

describe('tag chips', () => {
  it('finds folded tags in the notes', () => {
    expect([...tagsIn('καφές #Διακοπές #trip-2026')]).toEqual(['διακοπες', 'trip-2026'])
  })

  it('toggles a tag on and off, accent and case insensitive', () => {
    expect(toggleTag('καφές', 'Λονδίνο')).toBe('καφές #Λονδίνο')
    expect(toggleTag('', 'x')).toBe('#x')
    expect(toggleTag('καφές #λονδινο, μετά', 'Λονδίνο')).toBe('καφές μετά')
  })

  it('removeTag keeps other words and collapses spaces', () => {
    expect(removeTag('a #b c #d', 'B')).toBe('a c #d')
  })

  it('detects the tag being typed before the caret', () => {
    expect(typedTag('καφές #Λον')).toEqual({ text: 'Λον', start: 6, end: 10 })
    expect(typedTag('καφές#Λον')).toBeNull()
    expect(typedTag('#ab cd', 3)).toEqual({ text: 'ab', start: 0, end: 3 })
    expect(typedTag('καφές')).toBeNull()
  })

  it('suggests matching tags, not exact or present ones, max 6', () => {
    const all = ['Λονδίνο2026', 'λονδινο', 'Λόφος', 'Παρίσι', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
    expect(tagSuggestions('x #λον', 6, all)).toEqual(['Λονδίνο2026', 'λονδινο'])
    expect(tagSuggestions('x #λονδινο', 10, all)).toEqual(['Λονδίνο2026'])
    expect(tagSuggestions('x #λο', 5, all)).toEqual(['Λονδίνο2026', 'λονδινο', 'Λόφος'])
    expect(tagSuggestions('#Λόφος #λο', 10, all)).toEqual(['Λονδίνο2026', 'λονδινο'])
    expect(tagSuggestions('#a', 2, all)).toHaveLength(6)
    expect(tagSuggestions('no tag', 6, all)).toEqual([])
  })

  it('completes the typed word and moves the caret after it', () => {
    expect(completeTag('καφές #λον', 10, 'Λονδίνο2026')).toEqual({ value: 'καφές #Λονδίνο2026 ', caret: 19 })
    expect(completeTag('#λο μετά', 3, 'Λόφος')).toEqual({ value: '#Λόφος μετά', caret: 7 })
    expect(completeTag('καφές', 5, 'x')).toEqual({ value: 'καφές #x', caret: 8 })
  })
})
