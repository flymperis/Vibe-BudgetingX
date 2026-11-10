import { findTags, splitTags, tagKey } from './tags'

// Cases ported from the old tests/test_tags.py
describe('tags', () => {
  it('finds tags in any script and compares without case or accents', () => {
    expect(findTags('καφές #Διακοπές2026 #trip-ny #διακοπες2026')).toEqual(['Διακοπές2026', 'trip-ny'])
    expect(tagKey('#Διακοπές2026')).toBe('διακοπες2026')
    expect(tagKey('διακοπες2026')).toBe('διακοπες2026')
  })

  it('ignores numbers, mid-word hashes and URL fragments', () => {
    expect(findTags('table #3, mail a#b, url x.com/#top')).toEqual([])
    expect(findTags('&#39; ##x')).toEqual([])
  })

  it('drops trailing hyphens and caps length at 50 word characters', () => {
    expect(findTags('#trip- end')).toEqual(['trip'])
    const long = 'a'.repeat(60)
    expect(findTags(`#${long}`)).toEqual(['a'.repeat(50)])
  })

  it('splits notes into text and tag parts', () => {
    expect(splitTags('Σινεμά #Νοέμβρης με #3 φίλους')).toEqual([
      { type: 'text', text: 'Σινεμά ' },
      { type: 'tag', tag: 'Νοέμβρης' },
      { type: 'text', text: ' με #3 φίλους' },
    ])
    expect(splitTags('')).toEqual([])
    expect(splitTags('#trip2026')).toEqual([{ type: 'tag', tag: 'trip2026' }])
  })
})
