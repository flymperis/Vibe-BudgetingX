/**
 * Made-up data for the sample Home screen, the quick-add sample and the
 * /dev/components page. Never used for real figures.
 */
import { addDays, todayISO } from '@/lib/dates'

export interface SampleCategory {
  name: string
  budget: number
  spent: number
}

export const SAMPLE_CATEGORIES: SampleCategory[] = [
  { name: 'Σούπερ μάρκετ', budget: 320, spent: 251.6 },
  { name: 'Φαγητό έξω', budget: 180, spent: 128 },
  { name: 'Λογαριασμοί', budget: 250, spent: 125.59 },
  { name: 'Μετακίνηση', budget: 120, spent: 85 },
  { name: 'Καφές', budget: 60, spent: 50.5 },
  { name: 'Διασκέδαση', budget: 100, spent: 134 },
]

export const SAMPLE_ACCOUNTS = ['Alpha Visa', 'Revolut', 'Μετρητά', 'Ticket Restaurant']

export interface SampleTxn {
  id: number
  category: string
  notes: string
  account: string
  day: string
  amount: number
}

export function sampleTransactions(today: string = todayISO()): SampleTxn[] {
  const d = (n: number) => addDays(today, -n)
  return [
    { id: 1, category: 'Καφές', notes: 'Freddo espresso', account: 'Revolut', day: d(0), amount: -3.5 },
    {
      id: 2,
      category: 'Σούπερ μάρκετ',
      notes: 'Σκλαβενίτης',
      account: 'Alpha Visa',
      day: d(0),
      amount: -48.2,
    },
    {
      id: 3,
      category: 'Φαγητό έξω',
      notes: 'efood σουβλάκια',
      account: 'Ticket Restaurant',
      day: d(1),
      amount: -18,
    },
    { id: 4, category: 'Μετακίνηση', notes: 'Βενζίνη', account: 'Alpha Visa', day: d(1), amount: -45 },
    { id: 5, category: 'Διασκέδαση', notes: 'Σινεμά #Νοέμβρης', account: 'Revolut', day: d(2), amount: -22 },
    { id: 6, category: 'Λογαριασμοί', notes: 'ΔΕΗ', account: 'Alpha Visa', day: d(3), amount: -84.6 },
    { id: 7, category: 'Μισθός', notes: 'Μισθός Νοεμβρίου', account: 'Alpha Visa', day: d(4), amount: 1850 },
    { id: 8, category: 'Καφές', notes: 'Καφές με Άννα #φίλοι', account: 'Μετρητά', day: d(4), amount: -7 },
  ]
}

export const SAMPLE_TOTALS = {
  balance: 4218.4,
  income: 1850,
  expenses: -742.35,
  budget: 1200,
}
