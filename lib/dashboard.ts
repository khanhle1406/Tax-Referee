import { z } from 'zod';

const count = z.number().int().nonnegative();

/** Counts describe current invoice states in the whole request-scoped database. */
export const DashboardSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  scope: z.literal('CURRENT_DATABASE'),
  totalInvoices: count,
  statusCounts: z.record(count),
  approvals: z.object({
    total: count,
    automatic: count,
    human: count,
    unknown: count,
    byRole: z.object({CHIEF_ACCOUNTANT: count, CFO: count}),
    // Share of currently approved invoices, not a measure of model accuracy.
    automationRate: z.number().min(0).max(1).nullable()
  }),
  pending: z.object({
    total: count,
    chiefAccountant: count,
    cfo: count,
    onHold: count,
    evaluating: count,
    received: count,
    paused: count
  }),
  rejected: count,
  approvedDeductibleTax: z.number().finite(),
  taxHeld: count
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
