import { isQuorum } from './quorum.js';
import { validateLease, LeaseRejection } from './lease.js';

export const RejectReason = Object.freeze({
  NOT_LEADER: 'not-leader',
  STALE_TERM: 'stale-term',
  TERM_NOT_COMMITTED: 'term-not-committed',
  INDEX_NOT_COMMITTED: 'index-not-committed',
  NO_QUORUM: 'no-quorum',
  APPLY_LAGGING: 'apply-lagging',
});

// node 视角的集群状态:
// {
//   nodeId, term, leaderId,
//   commitIndex, appliedIndex,
//   committedTerm,        // commitIndex 处日志条目的 term（确认本任期已提交条目）
//   config,               // 见 quorum.js
//   lease,                // 见 lease.js，可为 null
//   acks,                 // { followerId: ackIndex } 心跳/ReadIndex 确认，含 leader 自身
// }
// request 形如: { seq: 7, readIndex: 42 }
//
// 返回值三选一:
//   { seq, status: 'ok',     servableIndex, via: 'lease' | 'read-index' }
//   { seq, status: 'reject', reason, retryTarget }
//   { seq, status: 'forward', to, forwardedSeq }   跟随者转发，保留原请求序号
export function evaluateReadRequest(node, request, now) {
  const { seq, readIndex } = request;

  if (node.term < node.leaderTerm) {
    return reject(seq, RejectReason.STALE_TERM, node.leaderId);
  }

  // 跟随者：转发给 leader，保留原请求序号，客户端据此去重。
  if (node.nodeId !== node.leaderId) {
    return { seq, status: 'forward', to: node.leaderId, forwardedSeq: seq };
  }

  // leader 必须已提交一条本任期的条目，否则可能读到过期状态。
  if (node.committedTerm < node.term) {
    return reject(seq, RejectReason.TERM_NOT_COMMITTED, node.leaderId);
  }

  if (readIndex > node.commitIndex) {
    return reject(seq, RejectReason.INDEX_NOT_COMMITTED, node.leaderId);
  }

  // 路径一：有效租约直接放行。
  const lease = validateLease(node.lease, node.config, now);
  if (lease.ok) {
    return serve(node, request, 'lease');
  }

  // 路径二：ReadIndex，需要当前配置的 quorum 确认到 readIndex。
  const acked = quorumAckedAt(node.acks, readIndex);
  if (!isQuorum(acked, node.config)) {
    // 租约存在但失效（过期/配置切换/quorum 无效）时返回具体原因；
    // 本来就没有租约时报告 quorum 不足。
    const reason =
      lease.reason && lease.reason !== LeaseRejection.LEASE_MISSING
        ? lease.reason
        : RejectReason.NO_QUORUM;
    return reject(seq, reason, node.leaderId);
  }

  return serve(node, request, 'read-index');
}

function serve(node, request, via) {
  const servableIndex = Math.min(node.appliedIndex, node.commitIndex);
  if (servableIndex < request.readIndex) {
    return reject(request.seq, RejectReason.APPLY_LAGGING, node.leaderId);
  }
  return { seq: request.seq, status: 'ok', servableIndex, via };
}

function reject(seq, reason, retryTarget) {
  return { seq, status: 'reject', reason, retryTarget };
}

// 选出所有 ackIndex >= readIndex 的节点集合。
function quorumAckedAt(acks, readIndex) {
  const acked = new Set();
  for (const [nodeId, ackIndex] of Object.entries(acks)) {
    if (ackIndex >= readIndex) acked.add(nodeId);
  }
  return acked;
}
