import { evaluateReadRequest } from './read-index.js';

// 单个节点的请求入口：按请求序号去重。
// 重复请求（同一 seq，例如客户端重试或转发回环）直接返回首次结果，
// 保证幂等，不会重复评估。
export class ReadNode {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.seen = new Map(); // seq -> result
  }

  handle(state, request, now) {
    if (this.seen.has(request.seq)) {
      return { ...this.seen.get(request.seq), duplicate: true };
    }
    const result = evaluateReadRequest({ ...state, nodeId: this.nodeId }, request, now);
    this.seen.set(request.seq, result);
    return result;
  }
}
