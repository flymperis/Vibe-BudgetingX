/**
 * Greek strings: the source of truth for keys. `en.ts` must define every key.
 * Keys are `<area>.<name>`; feature-specific strings use the feature name as the
 * area (e.g. `expenses.addTitle`). Placeholders use {name}.
 */
export const el = {
  'app.name': 'Vibe Budgeting',
  'app.shortName': 'Vibe',

  // Navigation (titles of every section)
  'nav.home': 'Αρχική',
  'nav.expenses': 'Έξοδα',
  'nav.income': 'Έσοδα',
  'nav.recurring': 'Επαναλαμβανόμενα',
  'nav.transfers': 'Μεταφορές',
  'nav.budget': 'Budget',
  'nav.shared': 'Μοιρασμένα',
  'nav.reports': 'Αναφορές',
  'nav.investments': 'Επενδύσεις',
  'nav.yearly': 'Ετήσια',
  'nav.summary': 'Συγκεντρωτικά',
  'nav.settings': 'Ρυθμίσεις',
  'nav.more': 'Περισσότερα',
  'nav.add': 'Νέα καταχώριση',
  'nav.main': 'Κύρια πλοήγηση',
  'nav.components': 'Components (dev)',
  'nav.skip': 'Μετάβαση στο περιεχόμενο',
  'nav.loading': 'Φόρτωση σελίδας',

  'reports.overview': 'Επισκόπηση',
  'reports.spending': 'Έξοδα',
  'reports.tags': 'Tags',
  'reports.investments': 'Επενδύσεις',
  'reports.sections': 'Ενότητες αναφορών',

  'investments.crypto': 'Crypto',
  'investments.stocks': 'Μετοχές',
  'investments.sections': 'Είδη επενδύσεων',

  'settings.general': 'Γενικά',
  'settings.accounts': 'Τράπεζες & λογαριασμοί',
  'settings.expenseCategories': 'Κατηγορίες εξόδων',
  'settings.incomeCategories': 'Κατηγορίες εσόδων',
  'settings.exportImport': 'Εξαγωγή & εισαγωγή',
  'settings.integrations': 'Telegram & AI',
  'settings.appearance': 'Εμφάνιση',
  'settings.language': 'Γλώσσα',

  // Common words and actions
  'common.save': 'Αποθήκευση',
  'common.cancel': 'Ακύρωση',
  'common.delete': 'Διαγραφή',
  'common.edit': 'Επεξεργασία',
  'common.close': 'Κλείσιμο',
  'common.back': 'Πίσω',
  'common.retry': 'Δοκίμασε ξανά',
  'common.loading': 'Φόρτωση…',
  'common.seeAll': 'Όλα',
  'common.search': 'Αναζήτηση',
  'common.searchOrTag': 'Αναζήτηση ή #tag',
  'common.notes': 'Σημειώσεις',
  'common.category': 'Κατηγορία',
  'common.account': 'Λογαριασμός',
  'common.day': 'Ημέρα',
  'common.amount': 'Ποσό',
  'common.total': 'Σύνολο',
  'common.of': 'από',
  'common.comingSoon': 'Η οθόνη αυτή έρχεται σύντομα.',
  'common.sample': 'Δείγμα',
  'common.sampleData': 'Δείγμα με ψεύτικα δεδομένα, όχι τα δικά σου.',
  'common.noResults': 'Κανένα αποτέλεσμα',
  'common.confirm': 'Επιβεβαίωση',
  'common.areYouSure': 'Είσαι σίγουρος;',
  'common.cannotUndo': 'Αυτό δεν αναιρείται.',
  'common.notFound': 'Η σελίδα δεν βρέθηκε',
  'common.goHome': 'Πήγαινε στην αρχική',
  'common.saved': 'Αποθηκεύτηκε',
  'common.deleted': 'Διαγράφηκε',

  // Month switcher
  'month.previous': 'Προηγούμενος μήνας',
  'month.next': 'Επόμενος μήνας',
  'month.pick': 'Διάλεξε μήνα',
  'month.previousYear': 'Προηγούμενο έτος',
  'month.nextYear': 'Επόμενο έτος',
  'month.current': 'Τρέχων μήνας',

  // Days
  'date.today': 'Σήμερα',
  'date.yesterday': 'Χθες',

  // Amount entry
  'amount.keypad': 'Πληκτρολόγιο ποσού',
  'amount.backspace': 'Σβήσιμο',
  'amount.decimal': 'Υποδιαστολή',
  'amount.enter': 'Γράψε ποσό',

  // Budget / progress
  'progress.ok': 'Εντός ορίου',
  'progress.warn': 'Κοντά στο όριο',
  'progress.over': 'Πάνω από το όριο',
  'progress.label': '{spent} από {budget}',

  // Theme / appearance
  'theme.theme': 'Θέμα',
  'theme.zinc': 'Γκρι',
  'theme.blue': 'Μπλε',
  'theme.green': 'Πράσινο',
  'theme.violet': 'Μωβ',
  'theme.rose': 'Ροζ',
  'theme.mode': 'Φωτεινότητα',
  'theme.light': 'Φωτεινό',
  'theme.dark': 'Σκούρο',
  'theme.system': 'Αυτόματο',

  'language.el': 'Ελληνικά',
  'language.en': 'English',

  // Auth
  'auth.login': 'Σύνδεση',
  'auth.loginTitle': 'Καλώς ήρθες ξανά',
  'auth.loginSubtitle': 'Συνδέσου για να δεις τα οικονομικά σου.',
  'auth.register': 'Δημιουργία λογαριασμού',
  'auth.registerSubtitle': 'Λίγα δευτερόλεπτα και είσαι μέσα.',
  'auth.username': 'Όνομα χρήστη',
  'auth.password': 'Κωδικός',
  'auth.password2': 'Επανάληψη κωδικού',
  'auth.noAccount': 'Δεν έχεις λογαριασμό;',
  'auth.haveAccount': 'Έχεις ήδη λογαριασμό;',
  'auth.logout': 'Αποσύνδεση',
  'auth.loggedOut': 'Αποσυνδέθηκες',
  'auth.signingIn': 'Σύνδεση…',
  'auth.creating': 'Δημιουργία…',
  'auth.showPassword': 'Εμφάνιση κωδικού',
  'auth.hidePassword': 'Απόκρυψη κωδικού',
  'auth.hello': 'Γεια σου, {name}',
  'auth.registrationClosed': 'Οι εγγραφές είναι κλειστές.',

  // Errors
  'errors.network': 'Δεν υπάρχει σύνδεση με τον server.',
  'errors.generic': 'Κάτι πήγε στραβά.',
  'errors.loadFailed': 'Δεν φορτώθηκαν τα δεδομένα.',
  'errors.sessionExpired': 'Η σύνδεσή σου έληξε. Συνδέσου ξανά.',

  // Home (sample)
  'home.totalBalance': 'Σύνολο λογαριασμών',
  'home.monthIncome': 'Έσοδα μήνα',
  'home.monthExpenses': 'Έξοδα μήνα',
  'home.monthBudget': 'Budget του μήνα',
  'home.allCategories': 'Όλες',
  'home.sampleNotice': 'Δείγμα της αρχικής με ψεύτικα δεδομένα. Η πραγματική οθόνη έρχεται σύντομα.',
  'home.categories': 'Κατηγορίες',
  'home.recent': 'Πρόσφατα',

  // More page
  'more.subtitle': 'Όλες οι ενότητες',
  'more.recurringHint': 'Πάγια έξοδα και έσοδα',
  'more.sharedHint': 'Λογαριασμοί με φίλους',
  'more.transfersHint': 'Ανάμεσα στους λογαριασμούς σου',

  // Quick add (sample until the expenses feature replaces it)
  'quickAdd.newExpense': 'Νέο έξοδο',
  'quickAdd.notesPlaceholder': 'π.χ. καφές #Λονδίνο2026',
  'quickAdd.sampleSaved': 'Δείγμα: {amount} δεν αποθηκεύτηκε',

  // Dev components page
  'dev.title': 'Components',
  'dev.subtitle': 'Όλα τα δομικά στοιχεία με δείγμα δεδομένων.',
} as const

export type MessageKey = keyof typeof el
