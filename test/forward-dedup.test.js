import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadNode } from '../src/node.js';
import { baseState } from './helpers.js';

test('跟随者转发请求时保留原请求序号', () => {
  const follower = new ReadNode('c');
  const res = follower.handle(baseState(), { seq: 99, readIndex: 42 }, 150);
  assert.deepEqual(res, { seq: 99, status: 'forward', to: 'a', forwardedSeq: 99 });
});

test('转发到 leader 后同一序号可正常评估', () => {
  const follower = new ReadNode('c');
  const leader = new ReadNode('a');
  const req = { seq: 7, readIndex: 42 };

  const fwd = follower.handle(baseState(), req, 150);
  assert.equal(fwd.status, 'forward');

  const res = leader.handle(baseState(), { seq: fwd.forwardedSeq, readIndex: req.readIndex }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.seq, 7);
});

test('重复请求（同一 seq）返回首次结果且标记 duplicate', () => {
  const leader = new ReadNode('a');
  const first = leader.handle(baseState(), { seq: 5, readIndex: 42 }, 150);
  assert.equal(first.status, 'ok');

  // 状态已变化（例如 commitIndex 前进），重复请求仍返回缓存结果。
  const again = leader.handle(baseState({ commitIndex: 80, appliedIndex: 80 }), { seq: 5, readIndex: 42 }, 160);
  assert.equal(again.duplicate, true);
  assert.equal(again.servableIndex, first.servableIndex);
  assert.equal(again.seq, 5);
});

test('不同 seq 的请求互不影响', () => {
  const leader = new ReadNode('a');
  const r1 = leader.handle(baseState(), { seq: 1, readIndex: 42 }, 150);
  const r2 = leader.handle(baseState(), { seq: 2, readIndex: 42 }, 150);
  assert.equal(r1.duplicate, undefined);
  assert.equal(r2.duplicate, undefined);
  assert.notEqual(r1.seq, r2.seq);
});
