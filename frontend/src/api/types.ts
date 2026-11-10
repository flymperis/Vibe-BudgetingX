/**
 * Shortcuts into the generated OpenAPI types. Use these instead of writing
 * response types by hand:
 *
 *   import type { Schema } from '@/api/types'
 *   type Expense = Schema<'ExpenseOut'>
 */
import type { components } from './schema'

export type Schemas = components['schemas']
export type Schema<N extends keyof Schemas> = Schemas[N]
