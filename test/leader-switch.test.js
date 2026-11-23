import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadRequest, RejectReason } from '../src/read-index.js';
import { baseState, validLease } from './helpers.js';

test('leader 切换后旧 leader（term 落后）拒绝并指向新 leader', () => {
  const state = baseState({ term: 3, leaderTerm: 4, leaderId: 'b' });
  const res = evaluateReadRequest({ ...state, nodeId: 'a' }, { seq: 1, readIndex: 42 }, 150);
  assert.deepEqual(res, {
    seq: 1,
    status: 'reject',
    reason: RejectReason.STALE_TERM,
    retryTarget: 'b',
  });
});

test('旧 leader 的租约不能在新 leader 上任后继续服务', () => {
  // a 在 term 3 持有的租约，term 4 中 b 成为 leader；a 已不再是 leader。
  const state = baseState({
    term: 4,
    leaderTerm: 4,
    leaderId: 'b',
    lease: validLease({ expiresAt: 500 }),
  });
  const res = evaluateReadRequest({ ...state, nodeId: 'a' }, { seq: 2, readIndex: 42 }, 150);
  assert.equal(res.status, 'forward');
  assert.equal(res.to, 'b');
  assert.equal(res.forwardedSeq, 2);
});

test('新 leader 未提交本任期条目前拒绝读请求', () => {
  const state = baseState({ term: 4, leaderTerm: 4, leaderId: 'b', committedTerm: 3 });
  const res = evaluateReadRequest({ ...state, nodeId: 'b' }, { seq: 3, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, RejectReason.TERM_NOT_COMMITTED);
  assert.equal(res.retryTarget, 'b');
});
