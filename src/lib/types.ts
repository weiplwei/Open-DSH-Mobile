export type PairingPayload = {
  type: 'dsh-pair';
  version: 1;
  name?: string;
  instanceId: string;
  code?: string;
  proto: 2;
  ticket: string;
  relayUrl?: string;
  relayUrls?: string[];
  directUrl?: string;
  lanUrls?: string[];
  ipv6Candidates?: string[];
};

export type PairedHost = {
  name: string;
  instanceId: string;
  token: string;
  deviceKey: string;
  keyId: string;
  deviceId?: string;
  addresses: string[];
  localAddresses?: string[];
  activeAddress: string;
  clockOffsetMs: number;
  pairedAt: number;
};

export type SessionItem = {
  sessionId: string;
  title?: string;
  running?: boolean;
  pendingInteraction?: boolean;
  completed?: boolean;
  lastTurnError?: string | null;
  lastTurn?: unknown;
  blank?: boolean;
  cwd?: string;
  agentPreset?: string;
  pinned?: boolean;
  archived?: boolean;
  archivedAt?: number;
  scheduled?: boolean;
  updatedAt?: number;
  lastMessage?: string | {
    role?: string;
    text?: string;
    at?: number;
  } | null;
  origin?: string;
  parentSessionId?: string;
};

export type MessageContentPart = {
  type?: string;
  text?: string;
  mediaType?: string;
  data?: string;
  uploadId?: string;
  name?: string;
  [key: string]: unknown;
};

export type MessageBlock = {
  type?: string;
  text?: string;
  name?: string;
  state?: string;
  callId?: string;
  argsRaw?: string;
  output?: string;
  [key: string]: unknown;
};

export type MessageUsage = {
  uncachedInputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type TurnStepItem = {
  kind: 'think' | 'tool';
  summary?: string;
  state?: string;
  seq?: number;
  index?: number;
  callId?: string;
  name?: string;
  resultSeq?: number;
};

export type TurnProcess = {
  count: number;
  steps: TurnStepItem[];
  startSeq?: number;
};

export type TurnLifecycle = {
  turn: number;
  seq: number;
  startSeq?: number;
  state: 'running' | 'completed' | 'aborted' | 'error' | 'max-tokens';
  startedAt?: number;
  endedAt?: number;
};

export type LiveStepEntry = {
  key: string;
  step: TurnStepItem;
};

export type StepDetail = {
  kind: 'think' | 'tool';
  state?: string;
  name?: string;
  text?: string;
  argsRaw?: string;
  output?: string;
  diffs?: unknown[];
  truncated?: boolean;
};

export type StepDetailResponse = {
  ok: boolean;
  step: StepDetail;
};

export type GoalProjection = {
  id?: string;
  revision?: number;
  objective?: string;
  status?: string;
  ref?: { id?: string; revision?: number };
  [key: string]: unknown;
};

export type QueueItem = {
  id: string;
  placement: 'queued' | 'steering';
  message?: {
    id?: string;
    content?: string | MessageContentPart[];
  };
};

export type FileReferenceItem = {
  path: string;
  kind?: string;
};

export type SessionReferenceItem = {
  sessionId: string;
  label: string;
  mention?: string;
  cwd?: string;
  createdAt?: number;
};

export type SessionSearchHit = {
  sessionId: string;
  snippet: string;
};

export type DirectoryRoot = {
  name: string;
  path: string;
};

export type GitCommitDetail = {
  ok: boolean;
  hash: string;
  shortHash?: string;
  author?: string;
  date?: string;
  time?: string;
  subject?: string;
  body?: string;
  files?: { path: string; status?: string; additions?: number; deletions?: number }[];
  diff?: string;
  hunks?: { header: string; lines: string[] }[];
  [key: string]: unknown;
};

export type ScheduleDeliveryRecord = {
  messageId: string;
  scheduledAt?: string;
  deliveredAt?: string;
  prompt?: string;
  targetSessionId?: string;
};

export type ChannelModel = {
  id: string;
  name?: string;
};

export type ChannelItem = {
  id: string;
  source: 'external' | 'custom';
  name: string;
  active?: boolean;
  protocol?: string;
  baseUrl?: string;
  keySet?: boolean;
  writable?: boolean;
  models: ChannelModel[];
};

export type PluginEntry = {
  entryId: string;
  moduleName: string;
  enabled: boolean;
  fiberPhase: string | null;
};

export type AgentPresetDetail = {
  ok: boolean;
  agentPreset: string;
  trust: 'user' | 'system';
  content: string;
  name?: string;
  description?: string;
};

export type SessionProjections = {
  tokenUsage?: {
    uncachedInputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
  };
  sessionStats?: {
    turns?: number;
    steps?: number;
    decodeTokens?: number;
    decodeMs?: number;
    llmMs?: number;
    toolMs?: number;
  };
  contextPressure?: {
    pressureTokens?: number;
    contextWindow?: number;
  };
  planMode?: {
    active: boolean;
    pending?: boolean;
  };
  goal?: GoalProjection;
  [key: string]: unknown;
};

export type SessionStatsResponse = {
  ok: boolean;
  projections: SessionProjections;
};

export type PresentedFile = {
  path: string;
  description?: string;
  title?: string;
  name?: string;
  size?: number;
  mtime?: number;
  duration?: number;
  status?: string;
};

export type SlashCommand = {
  name: string;
  description: string;
  input?: { hint?: string };
};

export type CommandsResponse = {
  ok: boolean;
  items: SlashCommand[];
};

export type StatsRange = 'today' | 'yesterday' | '3d' | '7d' | '30d' | 'all';

export type StatsDayPoint = {
  day: string;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  requests: number;
  turns: number;
};

export type StatsOverviewBucket = {
  generatedAt: number;
  range: StatsRange;
  kpi: {
    sessions: number;
    uncachedInputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    turns: number;
    steps: number;
    llmMs: number;
    toolMs: number;
    activeMs: number;
    days: number;
  };
  days: StatsDayPoint[];
  heatmap: { day: string; tokens: number }[];
  composition?: {
    systemTokens: number;
    toolsTokens: number;
    messageTokens: number;
  };
  compositionSessionId?: string;
  sessions: {
    sessionId: string;
    title: string;
    workspaceName?: string;
    cwd?: string;
    lastText?: string;
    billedTokens: number;
    turns: number;
    lastAt: number;
    gone?: boolean;
  }[];
  models: {
    provider: string;
    providerName: string;
    model: string;
    modelName: string;
    uncachedInputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    billedTokens: number;
    turns: number;
    requests: number;
    lastAt: number;
  }[];
};

export type StatsOverviewResponse = {
  ok: boolean;
  overview: StatsOverviewBucket;
  ranges?: Partial<Record<StatsRange, StatsOverviewBucket>>;
};

export type ChatMessage = {
  id?: string;
  messageId?: string;
  clientMessageId?: string;
  seq?: number;
  kind?: string;
  role?: string;
  text?: string;
  content?: string | MessageContentPart[];
  blocks?: MessageBlock[];
  images?: Record<string, unknown>[];
  name?: string;
  summary?: string;
  state?: string;
  retry?: number;
  status?: string;
  time?: number;
  turn?: number;
  createdAt?: number;
  timestamp?: number;
  running?: boolean;
  error?: string;
  usage?: MessageUsage;
  turnProcess?: TurnProcess;
  turnLifecycle?: TurnLifecycle;
  presentedFiles?: PresentedFile[];
  [key: string]: unknown;
};

export type SessionsResponse = {
  ok: boolean;
  items: SessionItem[];
  hasMore?: boolean;
  generatedAt?: number;
  revision?: string;
};

export type MessagesResponse = {
  ok: boolean;
  items: ChatMessage[];
  hasMore?: boolean;
  lastSeq?: number;
  oldestSeq?: number;
  resyncRequired?: boolean;
};

export type WorkspaceItem = {
  workspaceId: string;
  title?: string;
  path?: string;
  pinned?: boolean;
  git?: { isRepo?: boolean; root?: string; branch?: string };
  [key: string]: unknown;
};

export type WorkspacesResponse = {
  ok: boolean;
  items: WorkspaceItem[];
  generatedAt?: number;
  revision?: string;
  emptyConfirmed?: boolean;
  unchanged?: boolean;
};

export type AgentPreset = {
  id: string;
  name?: string;
  description?: string;
  trust?: string;
  isDefault?: boolean;
  broken?: boolean | string;
};

export type AgentPresetsResponse = {
  ok: boolean;
  presets: AgentPreset[];
  authorable?: boolean;
  hasDocument?: boolean;
};

export type ModelSelection = { provider: string; model: string; reasoningEffort?: string };
export type ReasoningEffort = { id: string; name: string; description?: string };
export type ModelItem = {
  id: string;
  name: string;
  description?: string;
  badge?: string;
  reasoning?: { efforts: ReasoningEffort[]; defaultEffort?: string };
};
export type ModelGroup = { id: string; name: string; models: ModelItem[] };
export type ModelCatalog = {
  ok: boolean;
  current?: ModelSelection;
  defaultModel?: ModelSelection;
  groups?: ModelGroup[];
  options?: Record<string, unknown>[];
  failures?: { id?: string; name?: string; message?: string }[];
};

export type SubagentEntry = {
  kind: 'child' | 'diagnostic';
  id: string;
  label?: string;
  name?: string;
  description?: string;
  mode?: 'one-shot' | 'continuable' | 'unknown' | 'external';
  activity?: 'running' | 'inactive';
  hasChildren?: boolean;
  parentSessionId?: string;
  parentId?: string;
  path?: string;
  depth?: number;
  targetAvailable?: boolean | null;
  reason?: 'corrupt' | 'unsupported' | 'unavailable';
};

export type SubagentsResponse = {
  ok: boolean;
  entries: SubagentEntry[];
  parentAvailable: boolean;
  rootSessionId?: string;
  rootAvailable?: boolean | null;
  capabilities?: { images?: boolean; delivery?: boolean; steer?: boolean };
};

export type DirectoryEntry = { name: string; path: string; hidden: boolean; kind: 'file' | 'folder'; size?: number; modified?: number };
export type DirectoryListing = {
  ok: boolean;
  listing: {
    path: string;
    home: string;
    crumbs: { name: string; path: string }[];
    entries: DirectoryEntry[];
    truncated: boolean;
  };
};

export type GitChange = { path: string; oldPath?: string; status: string; additions: number; deletions: number; binary: boolean; stage: 'staged' | 'unstaged' | 'untracked' };
export type GitStatus = { ok: boolean; staged: GitChange[]; unstaged: GitChange[]; untracked: GitChange[]; conflicted: GitChange[] };
export type GitRepo = { ok: boolean; isRepo: boolean; root?: string; name?: string; branch?: string | null; detached?: boolean; head?: string | null; upstream?: string | null; ahead?: number | null; behind?: number | null; dirtyCount?: number; conflictedCount?: number };
export type GitBranches = { ok: boolean; current: string | null; detached: boolean; branches: { name: string; current?: boolean; upstream?: string | null; ahead?: number; behind?: number }[] };
export type GitLog = { ok: boolean; commits: { hash: string; shortHash: string; author: string; time: string; subject: string }[]; hasMore?: boolean };

export type ScheduleTiming = Record<string, unknown> & { kind: 'after' | 'every' | 'at' | 'rrule' | 'daily' | 'weekly' | 'cron' };
export type ScheduleTarget = { kind: 'session'; sessionId: string } | { kind: 'new_once' | 'new'; create?: { cwd?: string; agentPreset?: string } };
export type ScheduleRecord = {
  id: string;
  sessionId?: string;
  kind?: string;
  title: string;
  prompt: string;
  timing?: ScheduleTiming;
  target?: ScheduleTarget;
  active?: boolean;
  status?: string;
  scheduledAt?: number | string;
  lastRunAt?: number | string;
  updatedAt?: string;
  [key: string]: unknown;
};
