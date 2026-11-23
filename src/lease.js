import { isQuorum } from './quorum.js';

export const LeaseRejection = Object.freeze({
  LEASE_MISSING: 'lease-missing',
  LEASE_EXPIRED: 'lease-expired',
  LEASE_CONFIG_STALE: 'lease-config-stale',
  LEASE_QUORUM_INVALID: 'lease-quorum-invalid',
});

// lease 形如:
//   { grantedAt: 100, expiresAt: 200, configIndex: 12, quorum: ['a','b','c'] }
// 租约必须建立在“当前配置”的有效 quorum 之上：
//  - 未过期 (now < expiresAt)
//  - 租约授予时的配置索引与当前配置一致（配置切换后旧租约不能继续使用）
//  - 租约所记录的 quorum 对当前配置（含联合配置的双多数）仍然构成 quorum
export function validateLease(lease, config, now) {
  if (!lease) {
    return { ok: false, reason: LeaseRejection.LEASE_MISSING };
  }
  if (now >= lease.expiresAt) {
    return { ok: false, reason: LeaseRejection.LEASE_EXPIRED };
  }
  if (lease.configIndex !== config.index) {
    return { ok: false, reason: LeaseRejection.LEASE_CONFIG_STALE };
  }
  if (!isQuorum(lease.quorum, config)) {
    return { ok: false, reason: LeaseRejection.LEASE_QUORUM_INVALID };
  }
  return { ok: true };
}
