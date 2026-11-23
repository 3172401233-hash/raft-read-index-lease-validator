import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadRequest, RejectReason } from '../src/read-index.js';
import { baseState, validLease } from './helpers.js';

test('leader 通过 ReadIndex quorum 确认后返回可服务索引', () => {
  const res = evaluateReadRequest(baseState(), { seq: 1, readIndex: 42 }, 150);
  assert.deepEqual(res, { seq: 1, status: 'ok', servableIndex: 50, via: 'read-index' });
});

test('有效租约下无需逐次 quorum 确认即可返回', () => {
  const state = baseState({ lease: validLease(), acks: { a: 50 } });
  const res = evaluateReadRequest(state, { seq: 2, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.via, 'lease');
  assert.equal(res.servableIndex, 50);
});

test('可返回索引受 appliedIndex 限制', () => {
  const state = baseState({ appliedIndex: 45 });
  const res = evaluateReadRequest(state, { seq: 3, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.servableIndex, 45);
});

test('readIndex 超过 commitIndex 时拒绝并指向 leader 重试', () => {
  const res = evaluateReadRequest(baseState(), { seq: 4, readIndex: 60 }, 150);
  assert.deepEqual(res, {
    seq: 4,
    status: 'reject',
    reason: RejectReason.INDEX_NOT_COMMITTED,
    retryTarget: 'a',
  });
});

test('leader 未提交本任期条目时拒绝（可能读到过期状态）', () => {
  const state = baseState({ committedTerm: 2 });
  const res = evaluateReadRequest(state, { seq: 5, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, RejectReason.TERM_NOT_COMMITTED);
  assert.equal(res.retryTarget, 'a');
});

test('状态机应用滞后于 readIndex 时拒绝', () => {
  const state = baseState({ appliedIndex: 40 });
  const res = evaluateReadRequest(state, { seq: 6, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, RejectReason.APPLY_LAGGING);
});
