# raft-read-index-lease-validator

验证 Raft 读索引（ReadIndex）、租约读（lease read）和领导者边界的纯函数式校验器。
输入 term、leader、commit index、quorum ACK、租约、成员配置和 ReadIndex 请求，
判断读请求何时可以返回数据，并输出可返回索引、拒绝原因和重试目标。

## 范围说明

本项目**不实现 Raft 网络层**：没有 RPC、日志复制、选举计时器或真实时钟。
集群状态（term、commitIndex、ACK、租约、配置）由调用方以普通对象传入，
校验器只做判定逻辑，便于单测和形式化推演。时间以逻辑时间戳（`now`）显式传入。

## 判定规则

- 跟随者收到读请求：转发给当前 leader，**保留原请求序号**（`forwardedSeq`）。
- leader 的 term 落后于已知 `leaderTerm`：拒绝（`stale-term`），重试目标为新 leader。
- leader 尚未提交本任期条目：拒绝（`term-not-committed`），避免返回过期状态。
- `readIndex > commitIndex`：拒绝（`index-not-committed`）。
- 租约路径：租约未过期、授予时的配置索引与当前配置一致、且租约 quorum 对
  当前配置（联合配置需新旧双多数）仍构成 quorum 时，直接放行。
  配置切换后旧租约不能继续使用（`lease-config-stale`）。
- ReadIndex 路径：当前配置的 quorum 确认到 `readIndex`（联合配置需双多数）。
- 可返回索引为 `min(appliedIndex, commitIndex)`；状态机滞后时拒绝（`apply-lagging`）。
- 同一节点上相同 `seq` 的重复请求幂等返回首次结果（`duplicate: true`）。

## 运行测试

```sh
node --test   # 需要 Node.js >= 24.16.0
```

测试覆盖：leader 切换、网络分区、联合配置（joint consensus）、重复请求与转发序号保留。

## 代码结构

- `src/quorum.js` — 成员配置与 quorum 判定（含联合配置双多数）
- `src/lease.js` — 租约有效性校验（过期、配置切换、quorum 有效性）
- `src/read-index.js` — 读请求评估主逻辑，输出 ok / reject / forward
- `src/node.js` — 节点入口，按请求序号去重
