import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReadRequest } from '../src/read-index.js';
import { baseState, validLease } from './helpers.js';

const jointConfig = { index: 20, old: ['a', 'b', 'c'], new: ['a', 'b', 'd', 'e'] };

test('联合配置下仅旧配置多数不够，需要新旧双多数', () => {
  const state = baseState({
    config: jointConfig,
    acks: { a: 50, b: 50, c: 50 }, // 旧配置全到，新配置只有 a、b（未达 3/4）
  });
  const res = evaluateReadRequest(state, { seq: 1, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, 'no-quorum');
});

test('联合配置下新旧双多数达成后可服务', () => {
  const state = baseState({
    config: jointConfig,
    acks: { a: 50, b: 50, c: 50, d: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 2, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.via, 'read-index');
});

test('配置切换后旧租约不能继续使用', () => {
  const state = baseState({
    config: jointConfig, // 配置在索引 20 生效
    lease: validLease({ configIndex: 10, expiresAt: 500 }), // 租约授予于旧配置
    acks: { a: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 3, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, 'lease-config-stale');
  assert.equal(res.retryTarget, 'a');
});

test('联合配置下租约 quorum 必须同时覆盖新旧配置', () => {
  const state = baseState({
    config: jointConfig,
    lease: validLease({ configIndex: 20, quorum: ['a', 'b', 'c'], expiresAt: 500 }),
    acks: { a: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 4, readIndex: 42 }, 150);
  assert.equal(res.status, 'reject');
  assert.equal(res.reason, 'lease-quorum-invalid');
});

test('联合配置下双多数租约有效', () => {
  const state = baseState({
    config: jointConfig,
    lease: validLease({ configIndex: 20, quorum: ['a', 'b', 'c', 'd'], expiresAt: 500 }),
    acks: { a: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 5, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
  assert.equal(res.via, 'lease');
});

test('配置切换完成后（new 为 null）按新配置单独计算 quorum', () => {
  const state = baseState({
    config: { index: 30, old: ['a', 'b', 'd', 'e'], new: null },
    acks: { a: 50, b: 50, d: 50 },
  });
  const res = evaluateReadRequest(state, { seq: 6, readIndex: 42 }, 150);
  assert.equal(res.status, 'ok');
});
