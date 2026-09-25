import { syncLegalUpdates } from '../services/legalUpdateService';

async function main() {
  const result = await syncLegalUpdates();
  console.log(JSON.stringify({
    runId: result.runId,
    found: result.found,
    errors: result.errors,
    candidates: result.candidates.map((candidate) => ({ id: candidate.id, code: candidate.documentCode, status: candidate.status }))
  }, null, 2));
  if (result.errors.length > 0 && result.found === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
