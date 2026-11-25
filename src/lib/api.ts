import {
  b64,
  b64url,
  bytesText,
  canonicalString,
  deriveSessionKeys,
  downAad,
  openResponseEnvelope,
  sealJson,
  signCanonical,
  sseAad,
  textBytes,
  unb64,
  unb64url,
  upAad,
  type ResponseEnvelope,
} from './e2ee';
import { errorMessage, isLanAddress } from './pairing';
import { openFileChunks } from './file-chunks';
import type {
  AgentPresetDetail,
  AgentPresetsResponse,
  ChannelItem,
  CommandsResponse,
  DirectoryListing,
  DirectoryRoot,
  FileReferenceItem,
  GitBranches,
  GitCommitDetail,
  GitLog,
  GitRepo,
  GitStatus,
  MessageContentPart,
  MessagesResponse,
  ModelCatalog,
  PairedHost,
  PluginEntry,
  ScheduleDeliveryRecord,
  ScheduleRecord,
  ScheduleTarget,
  ScheduleTiming,
  SessionReferenceItem,
  SessionSearchHit,
  SessionStatsResponse,
  SessionsResponse,
  StatsOverviewResponse,
  StatsRange,
  StepDetailResponse,
  SubagentsResponse,
  WorkspaceItem,
  WorkspacesResponse,
} from './types';

const API_ROOT = '/api/mobile/v1';

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') {
    super(message);
  }
}

type WireResponse = {
  ok?: boolean;
  error?: unknown;
  serverTime?: number;
  env?: ResponseEnvelope;
  v?: number;
  n?: string;
  c?: string;
  [key: string]: unknown;
};

export type FileDownload = {
  data: Uint8Array;
  mimeType: string;
  size: number;
  rangeStart?: number;
  rangeEnd?: number;
};

export class DshClient {
  private keys;
  private clockOffsetMs: number;
  private randomBytes: (size: number) => Uint8Array;

  constructor(
    public host: PairedHost,
    randomBytes: (size: number) => Uint8Array,
  ) {
    this.keys = deriveSessionKeys(unb64url(host.deviceKey));
    this.clockOffsetMs = host.clockOffsetMs || 0;
    this.randomBytes = randomBytes;
  }

  get<T>(route: string, query: Record<string, string | number | undefined> = {}) {
    return this.request<T>('GET', route, { query });
  }

  post<T>(route: string, body: unknown = {}) {
    return this.request<T>('POST', route, { body });
  }

  async download(
    route: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      offset?: number;
    } = {},
  ): Promise<FileDownload> {
    const method = options.method || 'POST';
    const offset = options.offset || 0;
    const errors: string[] = [];
    for (const address of this.candidateAddresses()) {
      const prepared = this.signedRequest(method, route, options, address);
      try {
        const response = await fetch(prepared.url, {
          method,
          headers: prepared.headers,
          ...(prepared.bodyText ? { body: prepared.bodyText } : {}),
        });
        if (!response.ok) {
          const text = await response.text();
          let message = text;
          let code = '';
          try {
            const parsed = JSON.parse(text) as { error?: unknown; code?: string };
            message = typeof parsed.error === 'string' ? parsed.error : text;
            code = parsed.code || '';
          } catch { /* plain HTTP error */ }
          throw new ApiError(message || `HTTP ${response.status}`, response.status, code);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const chunked = (response.headers.get('content-type') || '').includes('application/x-dsh-e2ee-chunks');
        const firstSeq = Math.floor(offset / 65536) + 1;
        this.host.activeAddress = address;
        return {
          data: chunked ? openFileChunks(bytes, this.keys.down, prepared.path, prepared.nonce, firstSeq) : bytes,
          mimeType: response.headers.get('x-dsh-content-type') || response.headers.get('content-type') || 'application/octet-stream',
          size: Number(response.headers.get('x-dsh-file-size') || bytes.length),
          rangeStart: Number(response.headers.get('x-dsh-range-start') || offset),
          rangeEnd: Number(response.headers.get('x-dsh-range-end') || offset + bytes.length),
        };
      } catch (cause) {
        if (cause instanceof ApiError) throw cause;
        errors.push(`${address}: ${errorMessage(cause)}`);
      }
    }
    throw new ApiError(errors.join('\n') || '没有可用的局域网地址');
  }

  candidateAddresses(): string[] {
    const allowed = this.host.localAddresses?.length ? new Set(this.host.localAddresses) : null;
    return [this.host.activeAddress, ...this.host.addresses]
      .filter((value, index, all) => value && all.indexOf(value) === index)
      .filter((value) => allowed ? allowed.has(value) : isLanAddress(value));
  }

  signedRequest(
    method: 'GET' | 'POST',
    route: string,
    options: { body?: unknown; query?: Record<string, string | number | undefined> },
    address: string,
  ) {
    const path = `${API_ROOT}${route}`;
    const queryEntries = Object.entries(options.query || {})
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined);
    const query = queryEntries.length
      ? `?${queryEntries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}`
      : '';
    const ts = Date.now() + this.clockOffsetMs;
    const nonceBytes = this.randomBytes(12);
    const nonce = b64url(nonceBytes);
    const bodyText = options.body === undefined ? '' : JSON.stringify({
      v: 2,
      c: sealJson(this.keys.up, options.body, upAad(method, path), nonceBytes),
    });
    const canonical = canonicalString({ method, path, query, ts, nonce, bodyBytes: textBytes(bodyText) });
    return {
      url: `${address}${path}${query}`,
      path,
      ts,
      nonce,
      bodyText,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.host.token}`,
        'x-dsh-device-credential': this.host.token,
        'x-dsh-proto': '2',
        'x-dsh-key-id': this.host.keyId,
        'x-dsh-instance': this.host.instanceId,
        'x-dsh-ts': String(ts),
        'x-dsh-nonce': nonce,
        'x-dsh-sig': signCanonical(this.keys.sig, canonical),
        ...(bodyText ? { 'content-type': 'application/json' } : {}),
      } as Record<string, string>,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    route: string,
    options: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const path = `${API_ROOT}${route}`;
    const addresses = this.candidateAddresses();
    const errors: string[] = [];

    for (const address of addresses) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const prepared = this.signedRequest(method, route, options, address);
        const response = await fetch(prepared.url, {
          method,
          headers: prepared.headers,
          body: prepared.bodyText || undefined,
          signal: controller.signal,
        });
        const wire = await response.json() as WireResponse;
        const data = this.decodeResponse(method, path, prepared.ts, prepared.nonce, wire);
        if (typeof data.serverTime === 'number' && data.error) {
          this.clockOffsetMs = Math.round(data.serverTime - Date.now());
          this.host.clockOffsetMs = this.clockOffsetMs;
        }
        if (!response.ok || data.ok === false || data.error) {
          const error = data.error as { code?: unknown } | undefined;
          throw new ApiError(
            errorMessage(data.error) || `请求失败（HTTP ${response.status}）`,
            response.status,
            typeof error?.code === 'string' ? error.code : '',
          );
        }
        this.host.activeAddress = address;
        return data as T;
      } catch (error) {
        // 已收到宿主的明确拒绝时换地址没有意义；网络错误才尝试其他候选。
        if (error instanceof ApiError) throw error;
        errors.push(`${address}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ApiError(`无法连接电脑：\n${errors.join('\n')}`);
  }

  decodeStreamFrame<T>(
    envelope: ResponseEnvelope,
    path: string,
    ts: number,
    nonce: string,
    seq: number,
  ): T {
    return openResponseEnvelope<T>(this.keys.down, envelope, sseAad(path, ts, nonce, seq));
  }

  private decodeResponse(
    method: string,
    path: string,
    ts: number,
    nonce: string,
    wire: WireResponse,
  ): WireResponse {
    const aad = downAad(method, path, ts, nonce);
    if (wire.env) {
      return { ...wire, ...openResponseEnvelope<WireResponse>(this.keys.down, wire.env, aad) };
    }
    if (wire.v === 2 && wire.n && wire.c) {
      return openResponseEnvelope<WireResponse>(
        this.keys.down,
        wire as unknown as ResponseEnvelope,
        aad,
      );
    }
    return wire;
  }

  listSessions() {
    return this.get<SessionsResponse>('/sessions', { fresh: 1 });
  }

  getSession(sessionId: string) {
    return this.get<{ ok: true; session: import('./types').SessionItem }>('/session', { sessionId });
  }

  listMessages(sessionId: string, options: {
    parentSessionId?: string;
    mode?: 'one-shot' | 'continuable';
    beforeSeq?: number;
    afterSeq?: number;
  } = {}) {
    return this.get<MessagesResponse>('/session/messages', { sessionId, limit: 200, ...options });
  }

  getSessionStats(sessionId: string) {
    return this.get<SessionStatsResponse>('/session/stats', { sessionId });
  }

  getStepDetail(params: {
    sessionId: string;
    kind: 'think' | 'tool';
    callId?: string;
    index?: number;
    seq?: number;
    resultSeq?: number;
    parentSessionId?: string;
    mode?: 'one-shot' | 'continuable';
  }) {
    return this.get<StepDetailResponse>('/session/step', params);
  }

  sendMessage(sessionId: string, text: string, clientMessageId: string, options: {
    content?: MessageContentPart[];
    mode?: 'queue' | 'steer';
    modelSelection?: { provider: string; model: string; reasoningEffort?: string };
  } = {}) {
    return this.post<{ ok: true; accepted: boolean }>('/session/send', {
      sessionId,
      ...(options.content ? { content: options.content } : { text }),
      clientMessageId,
      ...(options.mode ? { mode: options.mode } : {}),
      ...(options.modelSelection ? { modelSelection: options.modelSelection } : {}),
    });
  }

  stopSession(sessionId: string) {
    return this.post<{ ok: true }>('/session/stop', { sessionId });
  }

  respondApproval(input: { sessionId: string; rpcId: string; approvalId: string; outcome: 'allowed-once' | 'rejected'; reason?: string }) {
    return this.post<{ ok: true }>('/approval/respond', input);
  }

  respondQuestion(input: { sessionId: string; rpcId: string; answers: { id: string; selected: string[]; custom?: string }[] }) {
    return this.post<{ ok: true }>('/question/respond', input);
  }

  createSession(requestId: string, options: { workspaceId?: string; agentPreset?: string } = {}) {
    return this.post<{ ok: true; sessionId: string; cwd?: string }>('/session/new', { requestId, ...options });
  }

  renameSession(sessionId: string, title: string) {
    return this.post<{ ok: true }>('/session/rename', { sessionId, title });
  }

  forkSession(sessionId: string) {
    return this.post<{ ok: true; sessionId: string }>('/session/fork', { sessionId });
  }

  setSessionPinned(sessionId: string, pinned: boolean) {
    return this.post<{ ok: true }>(`/workspace/${pinned ? 'pin' : 'unpin'}-session`, { sessionId });
  }

  setSessionArchived(sessionId: string, archived: boolean, stopActivity = false) {
    return this.post<{ ok: true }>(`/workspace/${archived ? 'archive' : 'unarchive'}-session`, {
      sessionId,
      ...(archived && stopActivity ? { stopActivity: true } : {}),
    });
  }

  listWorkspaces() {
    return this.get<WorkspacesResponse>('/workspaces', { fresh: 1 });
  }

  listAgentPresets() {
    return this.get<AgentPresetsResponse>('/agent-presets');
  }

  getModels(sessionId: string) {
    return this.get<ModelCatalog>('/session/models', { sessionId });
  }

  selectModel(sessionId: string, selection: { provider: string; model: string; reasoningEffort?: string }) {
    return this.post<{ ok: true; applied?: boolean }>('/session/select-model', { sessionId, ...selection });
  }

  listSubagents(sessionId: string) {
    return this.get<SubagentsResponse>('/subagents', { sessionId });
  }

  promptSubagent(parentSessionId: string, childSessionId: string, text: string, clientMessageId: string) {
    return this.post<{ ok: true }>('/subagents/prompt', { parentSessionId, childSessionId, text, clientMessageId });
  }

  interruptSubagent(parentSessionId: string, childSessionId: string) {
    return this.post<{ ok: true }>('/subagents/interrupt', { parentSessionId, childSessionId });
  }

  listDirectory(path?: string) {
    return this.get<DirectoryListing>('/directory/listing', { path });
  }

  getGitRepo(workspaceId: string) {
    return this.get<GitRepo>('/git/repo', { workspaceId });
  }

  getGitStatus(workspaceId: string) {
    return this.get<GitStatus>('/git/status', { workspaceId });
  }

  getGitBranches(workspaceId: string) {
    return this.get<GitBranches>('/git/branches', { workspaceId });
  }

  getGitLog(workspaceId: string) {
    return this.get<GitLog>('/git/log', { workspaceId, limit: 20 });
  }

  getGitDiff(workspaceId: string, path: string, staged: boolean) {
    return this.get<{ ok: boolean; path: string; binary: boolean; truncated: boolean; additions: number; deletions: number; hunks: { header: string; lines: string[] }[] }>('/git/diff', { workspaceId, path, staged: staged ? 1 : 0 });
  }

  setGitStaged(workspaceId: string, paths: string[], staged: boolean) {
    return this.post<GitStatus>(`/git/${staged ? 'stage' : 'unstage'}`, { workspaceId, paths });
  }

  commitGit(workspaceId: string, message: string) {
    return this.post<{ ok: true; hash: string; shortHash: string }>('/git/commit', { workspaceId, message });
  }

  checkoutGitBranch(workspaceId: string, branch: string, create = false) {
    return this.post<{ ok: true; branch: string; detached: boolean }>('/git/checkout', { workspaceId, branch, ...(create ? { create: true } : {}) });
  }

  pushGit(workspaceId: string) {
    return this.post<{ ok: true; pushed: boolean; branch: string }>('/git/push', { workspaceId });
  }

  listSchedules() {
    return this.get<{ ok: boolean; records: ScheduleRecord[]; serverNow?: number }>('/schedule/catalog');
  }

  createSchedule(input: { title: string; prompt: string; timing: ScheduleTiming; target?: ScheduleTarget }) {
    return this.post<{ ok: true; record: ScheduleRecord }>('/schedule/create', input);
  }

  setScheduleActive(id: string, active: boolean, expectedUpdatedAt?: string) {
    return this.post<{ ok: true; record: ScheduleRecord }>(`/schedule/${active ? 'resume' : 'pause'}`, { id, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) });
  }

  runSchedule(id: string) {
    return this.post<{ ok: true; id: string; ran: boolean; code?: string; record?: ScheduleRecord }>('/schedule/run', { id });
  }

  deleteSchedule(id: string, sessionId = '', expectedUpdatedAt?: string) {
    return this.post<{ ok: true }>('/schedule/delete', { id, sessionId, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) });
  }

  async uploadBase64(
    name: string,
    encoded: string,
    options: { sessionId?: string; destPath?: string; onProgress?: (received: number, total: number) => void } = {},
  ) {
    const bytes = unb64(encoded);
    const begin = await this.post<{
      ok: true;
      uploadId: string;
      chunkSize: number;
      maxChunkSize: number;
    }>('/upload/begin', { name, size: bytes.length, ...options });
    const chunkSize = Math.min(begin.chunkSize || 262144, begin.maxChunkSize || 2097152);
    try {
      for (let offset = 0, index = 0; offset < bytes.length; offset += chunkSize, index += 1) {
        const part = bytes.slice(offset, Math.min(bytes.length, offset + chunkSize));
        await this.post('/upload/chunk', { uploadId: begin.uploadId, index, data: b64(part) });
        options.onProgress?.(offset + part.length, bytes.length);
      }
      return await this.post<{ ok: true; path: string; name: string; bytes: number; uploadId: string }>('/upload/finish', { uploadId: begin.uploadId });
    } catch (cause) {
      await this.post('/upload/abort', { uploadId: begin.uploadId }).catch(() => undefined);
      throw cause;
    }
  }

  async readTextFile(path: string, sessionId?: string, maxBytes = 512 * 1024) {
    const result = await this.download('/file/read', { body: { path, sessionId, offset: 0, length: maxBytes } });
    return { ...result, text: bytesText(result.data) };
  }

  getStatsOverview(range: StatsRange = 'today', fresh = false) {
    return this.get<StatsOverviewResponse>('/stats/overview', { range, ...(fresh ? { fresh: 1 } : {}) });
  }

  getCommands(sessionId: string) {
    return this.get<CommandsResponse>('/commands', { sessionId });
  }

  getNarration() {
    return this.get<{ ok: boolean; enabled: boolean }>('/narration');
  }

  setNarration(enabled: boolean) {
    return this.post<{ ok: boolean; enabled: boolean }>('/narration', { enabled });
  }

  downloadSessionFile(sessionId: string, path: string) {
    return this.download('/session/file', { method: 'POST', body: { sessionId, path } });
  }

  downloadSessionLog(sessionId: string) {
    return this.download('/session-log', { method: 'GET', query: { sessionId, includeDescendants: 'true' } });
  }

  markSessionRead(sessionId: string) {
    return this.post<{ ok: true; accepted?: boolean }>('/session/read', { sessionId });
  }

  updateQueue(
    sessionId: string,
    itemId: string,
    action: { kind: 'remove' } | { kind: 'steer' } | { kind: 'edit'; content: { type: 'text'; text: string }[] },
  ) {
    return this.post<{ ok: true }>('/session/queue/update', { sessionId, itemId, action });
  }

  updateGoal(
    sessionId: string,
    action: 'pause' | 'resume' | 'clear' | 'edit',
    ref: Record<string, unknown>,
    objective?: string,
  ) {
    return this.post<{ ok: true }>('/session/goal', {
      sessionId,
      action,
      ref,
      ...(objective !== undefined ? { objective } : {}),
    });
  }

  listFileReferences(sessionId: string, query = '') {
    return this.get<{ ok: boolean; items: FileReferenceItem[] }>('/file-references', { sessionId, query });
  }

  listSessionReferences(sessionId: string, query = '') {
    return this.get<{ ok: boolean; items: SessionReferenceItem[] }>('/session-references', { sessionId, query });
  }

  searchSessions(query: string) {
    return this.get<{ ok: boolean; items: SessionSearchHit[]; hasMore?: boolean }>('/session/search', { query });
  }

  createWorkspace(path: string) {
    return this.post<{ ok: true; workspace?: WorkspaceItem; created?: boolean }>('/workspace/create', { path });
  }

  renameWorkspace(workspaceId: string, title: string) {
    return this.post<{ ok: true; workspace?: WorkspaceItem }>('/workspace/rename', { workspaceId, title });
  }

  deleteWorkspace(workspaceId: string) {
    return this.post<{ ok: true; deleted?: boolean }>('/workspace/delete', { workspaceId });
  }

  moveSessionToWorkspace(workspaceId: string, sessionId: string) {
    return this.post<{ ok: true; workspace?: WorkspaceItem }>('/workspace/move-session', { workspaceId, sessionId });
  }

  clearArchivedSessions() {
    return this.post<{ ok: true; deleted: number }>('/workspace/clear-archived', { confirm: true });
  }

  listDirectoryRoots() {
    return this.get<{ ok: boolean; roots: DirectoryRoot[] }>('/directory/roots');
  }

  createDirectory(path: string, name: string) {
    return this.post<{ ok: true; path?: string }>('/directory/create', { path, name });
  }

  createFile(path: string, content = '', sessionId?: string, overwrite = false) {
    return this.post<{ ok: true; path?: string }>('/file/create', {
      path,
      content,
      ...(sessionId ? { sessionId } : {}),
      ...(overwrite ? { overwrite: true } : {}),
    });
  }

  renameFile(path: string, name: string, sessionId?: string) {
    return this.post<{ ok: true; path?: string; renamed?: boolean }>('/file/rename', {
      path,
      name,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  deleteFile(path: string, sessionId?: string) {
    return this.post<{ ok: true; path?: string; deleted?: boolean }>('/file/delete', {
      path,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  getGitShow(workspaceId: string, hash: string) {
    return this.get<GitCommitDetail>('/git/show', { workspaceId, hash });
  }

  generateCommitMessage(workspaceId: string, provider: string, model: string) {
    return this.post<{ ok: true; message: string }>('/git/commit-message', { workspaceId, provider, model });
  }

  updateSchedule(
    id: string,
    patch: { title?: string; prompt?: string; timing?: ScheduleTiming; target?: ScheduleTarget; active?: boolean },
    expectedUpdatedAt?: string,
  ) {
    return this.post<{ ok: true; record: ScheduleRecord }>('/schedule/update', {
      id,
      patch,
      ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    });
  }

  getScheduleHistory(id: string, sessionId?: string, limit = 20) {
    return this.get<{
      ok: boolean;
      id: string;
      records: ScheduleDeliveryRecord[];
      earlierRecordsUnavailable?: boolean;
      earlierRecordsPruned?: boolean;
    }>('/schedule/history', { id, ...(sessionId ? { sessionId } : {}), limit });
  }

  listChannels() {
    return this.get<{ ok: boolean; channels: ChannelItem[]; revision?: string }>('/channels');
  }

  saveChannel(input: {
    id?: string;
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey?: string;
    models: { id: string; name?: string }[];
  }) {
    return this.post<{ ok: true; channel: ChannelItem }>('/channels/save', input);
  }

  deleteChannel(id: string) {
    return this.post<{ ok: true }>('/channels/delete', { id });
  }

  listPlugins() {
    return this.get<{ ok: boolean; items: PluginEntry[]; revision?: string }>('/plugins');
  }

  readAgentPreset(agentPreset: string) {
    return this.post<AgentPresetDetail>('/agent-presets/read', { agentPreset });
  }

  copyAgentPreset(from: string, agentPreset: string, name?: string) {
    return this.post<{ ok: true; agentPreset: string }>('/agent-presets/copy', {
      from,
      agentPreset,
      ...(name ? { name } : {}),
    });
  }

  removeAgentPreset(agentPreset: string) {
    return this.post<{ ok: true; agentPreset: string }>('/agent-presets/remove', { agentPreset });
  }

  setDefaultAgentPreset(agentPreset: string) {
    return this.post<{ ok: true; agentPreset: string }>('/agent-presets/default', { agentPreset });
  }
}
