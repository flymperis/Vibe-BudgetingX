import {
  amountToText,
  displayAmountText,
  keypadPress,
  parseAmountInput,
  sanitizeAmountTyping,
  type KeypadKey,
} from './amount'

describe('parseAmountInput', () => {
  it('accepts comma and dot decimals', () => {
    expect(parseAmountInput('12,50')).toBe(12.5)
    expect(parseAmountInput('12.50')).toBe(12.5)
    expect(parseAmountInput(' 7 ')).toBe(7)
    expect(parseAmountInput(',5')).toBe(0.5)
    expect(parseAmountInput('-3,2')).toBe(-3.2)
    expect(parseAmountInput(4)).toBe(4)
  })
  it('returns null for blank or junk', () => {
    for (const v of ['', '  ', null, undefined, 'abc', '1.234,50', '12e3', 'NaN', '1..2']) {
      expect(parseAmountInput(v)).toBeNull()
    }
  })
})

describe('keypadPress', () => {
  const type = (keys: KeypadKey[], start = '') => keys.reduce(keypadPress, start)
  it('builds amounts', () => {
    expect(type(['1', '2', 'decimal', '5'])).toBe('12.5')
    expect(type(['decimal', '5'])).toBe('0.5')
    expect(type(['0', '0', '7'])).toBe('7')
  })
  it('caps decimals at two and ignores a second decimal mark', () => {
    expect(type(['1', 'decimal', '2', '3', '4'])).toBe('1.23')
    expect(type(['1', 'decimal', 'decimal', '2'])).toBe('1.2')
  })
  it('backspaces', () => {
    expect(type(['1', '2', 'backspace'])).toBe('1')
    expect(type(['backspace'])).toBe('')
  })
  it('caps the integer part', () => {
    expect(type(Array<KeypadKey>(12).fill('9'))).toBe('999999999')
  })
})

describe('sanitizeAmountTyping / display', () => {
  it('normalises typing', () => {
    expect(sanitizeAmountTyping('12,505')).toBe('12.50')
    expect(sanitizeAmountTyping('a1b2.3.4')).toBe('12.34')
    expect(sanitizeAmountTyping('007')).toBe('7')
    expect(sanitizeAmountTyping(',')).toBe('0.')
  })
  it('displays with Greek separators', () => {
    expect(displayAmountText('')).toBe('0')
    expect(displayAmountText('1234.5')).toBe('1.234,5')
    expect(displayAmountText('12.')).toBe('12,')
  })
  it('converts numbers back for editing', () => {
    expect(amountToText(12.5)).toBe('12.5')
    expect(amountToText(-48.2)).toBe('48.2')
    expect(amountToText(10)).toBe('10')
    expect(amountToText(null)).toBe('')
  })
})
