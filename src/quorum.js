// 成员配置与 quorum 判定。
// config 形如:
//   { index: 12, old: ['a','b','c'], new: null }              普通配置
//   { index: 12, old: ['a','b','c'], new: ['a','b','d','e'] } 联合配置 (joint consensus)
// index 是该配置生效的日志索引，用于让配置切换前授予的租约失效。

export function majority(voters) {
  return Math.floor(voters.length / 2) + 1;
}

export function isMajority(acked, voters) {
  const set = acked instanceof Set ? acked : new Set(acked);
  let count = 0;
  for (const v of voters) {
    if (set.has(v)) count += 1;
  }
  return count >= majority(voters);
}

// 联合配置下必须同时在新旧两个配置中都达到多数。
export function isQuorum(acked, config) {
  if (!isMajority(acked, config.old)) return false;
  if (config.new && !isMajority(acked, config.new)) return false;
  return true;
}

export function isVoter(nodeId, config) {
  return config.old.includes(nodeId) || (config.new ?? []).includes(nodeId);
}
