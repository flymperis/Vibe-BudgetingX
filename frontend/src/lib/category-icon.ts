/**
 * Picks an icon and a pastel tone for a category from its name. Users name
 * their own categories in Greek or English, so common words map to sensible
 * icons; anything else gets a stable icon and tone from a hash of the name.
 * The same name always gives the same result.
 */
import {
  Award,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Lightbulb,
  type LucideIcon,
  Package,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shapes,
  Shirt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Undo2,
  UtensilsCrossed,
  Wallet,
  Wine,
  Wrench,
} from 'lucide-react'

export type Tone =
  | 'green'
  | 'orange'
  | 'amber'
  | 'blue'
  | 'indigo'
  | 'pink'
  | 'violet'
  | 'teal'
  | 'rose'
  | 'sky'
  | 'lime'
  | 'slate'

/** Tile classes per tone; light pastel background, readable icon colour, dark-mode variants. */
export const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  lime: 'bg-lime-100 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300',
  slate: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300',
}

const TONES = Object.keys(TONE_CLASSES) as Tone[]

interface Rule {
  /** Lower-case stems (accents are ignored); a category matches when one of its words starts with a stem. */
  words: string[]
  icon: LucideIcon
  tone: Tone
}

// Order matters: the first rule with a matching stem wins.
const RULES: Rule[] = [
  {
    words: ['super', 'σουπερ', 'μαρκετ', 'market', 'grocer', 'τροφιμ', 'λαικη', 'μαναβ', 'φουρν', 'bakery'],
    icon: ShoppingCart,
    tone: 'green',
  },
  { words: ['καφε', 'coffee', 'cafe', 'καφεδ'], icon: Coffee, tone: 'amber' },
  {
    words: [
      'φαγητ',
      'food',
      'εστιατ',
      'restaurant',
      'delivery',
      'efood',
      'wolt',
      'ταβερν',
      'πιτσ',
      'pizza',
      'σουβλ',
      'dining',
      'lunch',
      'dinner',
      'γευμα',
    ],
    icon: UtensilsCrossed,
    tone: 'orange',
  },
  {
    words: ['ομορφ', 'beauty', 'κομμωτ', 'hair', 'κουρε', 'barber', 'καλλυντ', 'cosmetic', 'περιποιησ'],
    icon: Scissors,
    tone: 'pink',
  },
  {
    words: ['ποτα', 'ποτο', 'μπαρ', 'bar', 'drinks', 'αλκοολ', 'κρασ', 'wine', 'μπυρ', 'beer'],
    icon: Wine,
    tone: 'rose',
  },
  { words: ['βενζιν', 'καυσιμ', 'fuel', 'gas station', 'petrol', 'diesel'], icon: Fuel, tone: 'blue' },
  {
    words: [
      'μετακιν',
      'συγκοιν',
      'transport',
      'μετρο',
      'metro',
      'λεωφορ',
      'bus',
      'ταξι',
      'taxi',
      'uber',
      'εισιτηρ',
      'commute',
    ],
    icon: Bus,
    tone: 'blue',
  },
  {
    words: ['αυτοκιν', 'car', 'οχημα', 'μηχανη', 'παρκινγκ', 'parking', 'διοδι', 'toll', 'service'],
    icon: Car,
    tone: 'sky',
  },
  {
    words: [
      'λογαριασμ',
      'bill',
      'utilit',
      'ρευμα',
      'δεη',
      'ηλεκτρ',
      'electric',
      'νερο',
      'water',
      'ευδαπ',
      'αεριο',
      'θερμανσ',
      'heating',
    ],
    icon: Lightbulb,
    tone: 'indigo',
  },
  {
    words: ['ενοικ', 'rent', 'σπιτ', 'κατοικ', 'home', 'house', 'στεγ', 'mortgage', 'δανει', 'κοινοχρ'],
    icon: Home,
    tone: 'teal',
  },
  {
    words: ['συνδρομ', 'subscri', 'spotify', 'netflix', 'youtube', 'disney', 'icloud', 'streaming'],
    icon: Repeat,
    tone: 'violet',
  },
  {
    words: ['τηλεφ', 'phone', 'κινητ', 'mobile', 'internet', 'ιντερνετ', 'cosmote', 'vodafone', 'nova'],
    icon: Smartphone,
    tone: 'sky',
  },
  {
    words: [
      'διασκεδ',
      'fun',
      'entertain',
      'σινεμα',
      'cinema',
      'movie',
      'θεατρ',
      'theat',
      'συναυλ',
      'concert',
      'outing',
    ],
    icon: Clapperboard,
    tone: 'pink',
  },
  { words: ['παιχνιδ', 'game', 'gaming', 'steam', 'playstation', 'xbox'], icon: Gamepad2, tone: 'violet' },
  {
    words: [
      'ταξιδ',
      'travel',
      'διακοπ',
      'holiday',
      'vacation',
      'trip',
      'ξενοδοχ',
      'hotel',
      'airbnb',
      'πτησ',
      'flight',
      'αεροπορ',
    ],
    icon: Plane,
    tone: 'sky',
  },
  { words: ['φαρμακ', 'pharma', 'medicine', 'φαρμακο'], icon: Pill, tone: 'rose' },
  {
    words: ['υγει', 'health', 'γιατρ', 'doctor', 'ιατρ', 'medical', 'οδοντ', 'dentist', 'νοσοκ', 'hospital'],
    icon: HeartPulse,
    tone: 'rose',
  },
  { words: ['γυμναστ', 'gym', 'fitness', 'sport', 'αθλη', 'yoga', 'pilates'], icon: Dumbbell, tone: 'lime' },
  { words: ['ρουχ', 'cloth', 'ενδυσ', 'fashion', 'παπουτσ', 'shoes', 'apparel'], icon: Shirt, tone: 'pink' },
  {
    words: ['ψωνι', 'shopping', 'αγορ', 'amazon', 'skroutz', 'ηλεκτρονικ', 'electronics'],
    icon: ShoppingBag,
    tone: 'violet',
  },
  { words: ['δωρ', 'gift', 'present', 'γιορτ', 'γενεθλ', 'birthday'], icon: Gift, tone: 'rose' },
  {
    words: [
      'εκπαιδ',
      'education',
      'σχολ',
      'school',
      'φροντιστ',
      'tuition',
      'μαθημ',
      'course',
      'πανεπιστ',
      'universit',
    ],
    icon: GraduationCap,
    tone: 'indigo',
  },
  { words: ['βιβλι', 'book'], icon: BookOpen, tone: 'amber' },
  { words: ['παιδ', 'kid', 'child', 'baby', 'μωρ'], icon: Baby, tone: 'sky' },
  {
    words: ['κατοικιδ', 'pet', 'σκυλ', 'dog', 'γατ', 'cat', 'κτηνιατρ', 'vet'],
    icon: PawPrint,
    tone: 'amber',
  },
  { words: ['ασφαλ', 'insurance'], icon: ShieldCheck, tone: 'teal' },
  { words: ['φορο', 'φορολ', 'tax', 'εφορ', 'ενφια', 'τελη'], icon: Landmark, tone: 'slate' },
  { words: ['επισκευ', 'repair', 'μαστορ', 'maintenance', 'εργαλ', 'tools'], icon: Wrench, tone: 'slate' },
  {
    words: ['μισθ', 'salary', 'payroll', 'wage', 'αποδοχ', 'εργασια', 'δουλει', 'work', 'job'],
    icon: Briefcase,
    tone: 'green',
  },
  { words: ['bonus', 'μπονους', 'επιδομ', 'allowance'], icon: Award, tone: 'amber' },
  { words: ['επιστροφ', 'refund', 'cashback', 'reimburs'], icon: Undo2, tone: 'teal' },
  { words: ['τοκ', 'interest', 'μερισμ', 'dividend', 'αποταμιευσ', 'saving'], icon: PiggyBank, tone: 'lime' },
  {
    words: ['επενδ', 'invest', 'crypto', 'κρυπτο', 'stock', 'μετοχ', 'etf'],
    icon: TrendingUp,
    tone: 'green',
  },
  { words: ['freelance', 'πωλησ', 'sales', 'εσοδ', 'income', 'ενοικιο εισ'], icon: HandCoins, tone: 'green' },
  { words: ['μετρητ', 'cash', 'atm', 'αναληψ'], icon: Banknote, tone: 'lime' },
  { words: ['προμηθει', 'fee', 'χρεωσ', 'charge', 'τραπεζ', 'bank'], icon: Receipt, tone: 'slate' },
  {
    words: ['αλλα', 'αλλο', 'other', 'λοιπ', 'misc', 'διαφορ', 'γενικ', 'general'],
    icon: Shapes,
    tone: 'slate',
  },
]

const FALLBACK_ICONS: LucideIcon[] = [Tag, Package, Wallet, Star, Sparkles, Shapes]

/** Lower case, no accents, final sigma folded, single spaces. */
export function normalizeName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/ς/g, 'σ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** FNV-1a 32-bit; stable across sessions and browsers. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export interface CategoryVisual {
  icon: LucideIcon
  tone: Tone
  className: string
  /** true when a keyword matched, false for the hashed fallback */
  matched: boolean
}

const cache = new Map<string, CategoryVisual>()

export function categoryVisual(name: string): CategoryVisual {
  const key = normalizeName(name)
  const hit = cache.get(key)
  if (hit) return hit
  const words = key.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  let result: CategoryVisual | undefined
  for (const rule of RULES) {
    if (rule.words.some((w) => words.some((word) => word.startsWith(normalizeName(w))))) {
      result = { icon: rule.icon, tone: rule.tone, className: TONE_CLASSES[rule.tone], matched: true }
      break
    }
  }
  if (!result) {
    const h = hashString(key)
    const tone = TONES[h % TONES.length]
    result = {
      icon: FALLBACK_ICONS[(h >>> 8) % FALLBACK_ICONS.length],
      tone,
      className: TONE_CLASSES[tone],
      matched: false,
    }
  }
  cache.set(key, result)
  return result
}
