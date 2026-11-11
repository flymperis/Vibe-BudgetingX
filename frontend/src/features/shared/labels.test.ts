import { translate, type TFunction } from '@/i18n'
import { addedByText, effectText, memberNames, methodLabel, paymentNames, personName } from './labels'

const t: TFunction = (key, params) => translate(key, params, 'el')

describe('shared labels', () => {
  it('localises the viewer instead of the core English "You"', () => {
    expect(personName('You', true, t)).toBe('Εσύ')
    expect(personName('Anna', false, t)).toBe('Anna')
    expect(memberNames(['You', 'Anna', 'You'], t)).toEqual(['Εσύ', 'Anna', 'You'])
    expect(addedByText('you', t)).toBe('εσύ')
    expect(addedByText('anna', t)).toBe('anna')
  })

  it('builds the effect text from the raw fields', () => {
    expect(effectText({ effect: 67.5, i_paid: true }, t)).toBe('δάνεισες 67,50 €')
    expect(effectText({ effect: 0, i_paid: true }, t)).toBe('πλήρωσες μόνο το μερίδιό σου')
    expect(effectText({ effect: -20, i_paid: false }, t)).toBe('δανείστηκες 20,00 €')
    expect(effectText({ effect: 0, i_paid: false }, t)).toBe('δεν συμμετέχεις')
  })

  it('method labels and payment names', () => {
    expect(methodLabel('percent', t)).toBe('Ποσοστά')
    expect(methodLabel('weird', t)).toBe('weird')
    expect(paymentNames({ from_name: 'You', to_name: 'Anna', i_paid: true, involved: true }, t)).toEqual({
      from: 'Εσύ',
      to: 'Anna',
    })
    expect(paymentNames({ from_name: 'Anna', to_name: 'You', i_paid: false, involved: true }, t)).toEqual({
      from: 'Anna',
      to: 'Εσύ',
    })
  })
})
