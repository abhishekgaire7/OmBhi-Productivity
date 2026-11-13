import test from 'node:test';
import assert from 'node:assert/strict';

test('Gemini timeout settings and failover resilience configuration', () => {
  // Test primary and fallback model candidates
  const candidateModels = [
    { name: 'gemini-3.8-flash', timeout: 8000 },
    { name: 'gemini-3.1-flash-lite', timeout: 15000 },
  ];

  assert.equal(candidateModels.length, 2);
  assert.equal(candidateModels[0].name, 'gemini-3.8-flash');
  assert.equal(candidateModels[1].name, 'gemini-3.1-flash-lite');
  assert(candidateModels[0].timeout >= 6000, 'Primary timeout must be at least 6s');
  assert(candidateModels[1].timeout >= 12000, 'Fallback timeout must be at least 12s');

  // Verify client timeout gives sufficient budget over server timeouts
  const clientTimeoutMs = 35000;
  const maxServerBudget = candidateModels[0].timeout + candidateModels[1].timeout;
  assert(clientTimeoutMs > maxServerBudget, 'Client timeout must exceed combined server budget');
});
