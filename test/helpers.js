export function baseState(overrides = {}) {
  return {
    nodeId: 'a',
    term: 3,
    leaderTerm: 3,
    leaderId: 'a',
    commitIndex: 50,
    appliedIndex: 50,
    committedTerm: 3,
    config: { index: 10, old: ['a', 'b', 'c'], new: null },
    lease: null,
    acks: { a: 50, b: 50, c: 50 },
    ...overrides,
  };
}

export function validLease(overrides = {}) {
  return {
    grantedAt: 100,
    expiresAt: 200,
    configIndex: 10,
    quorum: ['a', 'b', 'c'],
    ...overrides,
  };
}
