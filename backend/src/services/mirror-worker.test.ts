import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuoteNotional,
  computePnlPercent,
  computePnlUsd,
} from './mirror-worker';
import { oracleAnswerToCents } from './mark-price';

describe('mirror-worker math', () => {
  it('computeQuoteNotional matches on-chain formula', () => {
    const maxPosition = 10_000_000_000_000_000_000n; // $10
    const sizeBps = 1500;
    const riskPct = 1000;
    const notional = computeQuoteNotional(maxPosition, sizeBps, riskPct);
    assert.equal(notional, 15_000_000_000_000_000_000n);
  });

  it('computePnlPercent long and short', () => {
    assert.equal(computePnlPercent(1, 100_000, 105_000), 5);
    assert.equal(computePnlPercent(-1, 100_000, 95_000), 5);
  });

  it('computePnlUsd scales with notional', () => {
    const size = 1_000_000_000_000_000_000n;
    const pnl = computePnlUsd(1, 100_000, 110_000, size);
    assert.equal(pnl, 0.1);
  });

  it('oracleAnswerToCents converts 8-decimal answer', () => {
    assert.equal(oracleAnswerToCents(350_000_000_000n), 350_000);
  });
});
