import { legacyTarget, reportSection } from './legacy'

const go = (qs: string) => legacyTarget(new URLSearchParams(qs))

describe('old app links', () => {
  it('ignores URLs without ?panel', () => {
    expect(go('')).toBeNull()
    expect(go('month=2026-01')).toBeNull()
  })

  it('maps every old panel', () => {
    expect(go('panel=home&month=2026-03')).toBe('/?month=2026-03')
    expect(go('panel=recurring')).toBe('/recurring')
    expect(go('panel=transfer&month=2026-03&pay_card=7')).toBe('/transfers?pay_card=7&month=2026-03')
    expect(go('panel=summary&cal_year=2025&cal_month=4')).toBe('/summary?month=2025-04')
    expect(go('panel=budget&month=2026-2')).toBe('/budget?month=2026-02')
    expect(go('panel=yearly&year=2024&month=2026-01')).toBe('/yearly?year=2024')
    expect(go('panel=shared')).toBe('/shared')
    expect(go('panel=shared&group=12')).toBe('/shared/groups/12')
    expect(go('panel=nope&month=2026-01')).toBe('/?month=2026-01')
    expect(go('panel=')).toBe('/')
  })

  it('keeps the expense / income list filters', () => {
    expect(go('panel=expenses&exp_month=2025-12&exp_category=4')).toBe('/expenses?month=2025-12&category=4')
    expect(go('panel=income&inc_cal_year=2025&inc_cal_month=1&month=2026-01')).toBe('/income?month=2025-01')
    expect(go('panel=expenses&month=2026-05&exp_category=x')).toBe('/expenses?month=2026-05')
  })

  it('maps report sections, including the legacy ones, year, account and tag', () => {
    expect(go('panel=reports')).toBe('/reports/overview')
    expect(go('panel=reports&reports_section=bank&report_year=2025&report_account=3')).toBe(
      '/reports/overview?year=2025&account=3',
    )
    expect(go('panel=reports&reports_section=crypto')).toBe('/reports/investments')
    expect(go('panel=reports&reports_section=spending&report_year=1999')).toBe('/reports/spending')
    expect(go('panel=reports&reports_section=tags&tag=trip2026')).toBe('/reports/tags?tag=trip2026')
    expect(go('panel=reports&tag=trip2026')).toBe('/reports/tags?tag=trip2026')
    expect(reportSection('STOCKS')).toBe('investments')
    expect(reportSection('junk')).toBe('overview')
  })

  it('maps investments and settings sections', () => {
    expect(go('panel=investments')).toBe('/investments/crypto')
    expect(go('panel=investments&investments_section=stocks')).toBe('/investments/stocks')
    expect(go('panel=settings')).toBe('/settings/general')
    expect(go('panel=settings&settings_section=banks')).toBe('/settings/accounts')
    expect(go('panel=settings&settings_section=expenses')).toBe('/settings/expense-categories')
    expect(go('panel=settings&settings_section=income')).toBe('/settings/income-categories')
    expect(go('panel=settings&settings_section=migration')).toBe('/settings/export')
    expect(go('panel=settings&settings_section=integrations')).toBe('/settings/integrations')
    expect(go('panel=export')).toBe('/settings/export')
    expect(go('panel=migration&month=2026-01')).toBe('/settings/export')
  })
})
