import { NextResponse } from 'next/server';
import { InvoiceInputSchema, RefereeDecisionSchema } from '@/lib/schemas';
import { evaluateInvoiceLocally } from '@/services/policyEngine';
import { getActivePolicy, getDatabase, getMacroState } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const activePolicy = getActivePolicy();
  const macroState = getMacroState();
  const rows = getDatabase().prepare(`
    SELECT id, payload_json
    FROM invoices
    ORDER BY datetime(updated_at) DESC
    LIMIT 200
  `).all() as Array<{ id: string; payload_json: string }>;

  const results = rows.map((row) => {
    const caseStartTime = Date.now();
    try {
      const invoice = InvoiceInputSchema.parse(JSON.parse(row.payload_json));
      const decision = evaluateInvoiceLocally(invoice, activePolicy.config, activePolicy.version, macroState);
      return {
        testId: row.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplierName,
        totalAmount: invoice.totalAmount,
        actualStatus: decision.status,
        riskGroup: decision.status === 'ESCALATED' ? decision.riskGroup : undefined,
        schemaValid: RefereeDecisionSchema.safeParse(decision).success,
        executionTimeMs: Date.now() - caseStartTime,
        actionableQuestion: decision.status === 'ESCALATED' ? decision.actionableQuestion : undefined,
        options: decision.status === 'ESCALATED' ? decision.options : undefined,
        plainExplanation: decision.plainExplanation
      };
    } catch (error) {
      return {
        testId: row.id,
        invoiceNumber: row.id,
        supplierName: 'Không đọc được hóa đơn',
        totalAmount: 0,
        actualStatus: 'ESCALATED' as const,
        riskGroup: 'UNCERTAIN_INFO' as const,
        schemaValid: false,
        executionTimeMs: Date.now() - caseStartTime,
        plainExplanation: error instanceof Error ? error.message : 'Dữ liệu hóa đơn không hợp lệ'
      };
    }
  });

  const totalTimeMs = Date.now() - startTime;
  const allSchemaValid = results.length > 0 && results.every(r => r.schemaValid);
  const routineCount = results.filter(r => r.actualStatus === 'ROUTINE').length;
  const escalatedCount = results.filter(r => r.actualStatus === 'ESCALATED').length;

  return NextResponse.json({
    summary: {
      totalCases: results.length,
      schemaValidCases: results.filter(r => r.schemaValid).length,
      routineCases: routineCount,
      escalatedCases: escalatedCount,
      allSchemaValid,
      verificationScope: 'SCHEMA_AND_PROVENANCE_ONLY',
      totalTimeMs,
      source: 'SQLite invoices uploaded or ingested by the application',
      timestamp: new Date().toISOString(),
      policyVersion: activePolicy.version
    },
    results
  });
}
