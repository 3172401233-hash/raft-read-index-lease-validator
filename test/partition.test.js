import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadRequest } from '../src/read-index.js';
import { baseState, validLease } from './helpers.js';

test('网络分区下 leader 拿不到 quorum ACK，拒绝读请求', () => {
  // a 与 b、c 分区，只剩自己的 ACK。
  const state = baseState({ acks: { a: 50 } });
  const res = evaluateReadRequest(state, { seq: 1, readIndex: 42 }, 150);
  assert.deepEqual(res, {
    seq: 1,
    status: 'reject',
    reason: 'no-quorum',
    retryTarget: 'a',
  });
});

test('分区前授予的租约过期后拒绝，原因为 lease-expired', () => {
  const state = baseState({
    lease: validLease({ expiresAt: 120 }),
    acks: { a: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 2, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, 'lease-expired');
  assert.equal(res.retryTarget, 'a');
});

test('分区前授予且未过期的租约仍可服务（租约语义内允许）', () => {
  const state = baseState({
    lease: validLease({ expiresAt: 500 }),
    acks: { a: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 3, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.via, 'lease');
});

test('ACK 未达到 readIndex 的节点不计入 quorum', () => {
  const state = baseState({ acks: { a: 50, b: 30, c: 10 } });
  const res = evaluateReadRequest(state, { seq: 4, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, 'no-quorum');
});
