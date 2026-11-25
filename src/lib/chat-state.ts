import type { ChatMessage, LiveStepEntry } from './types';

export function messageKey(message: ChatMessage, fallbackIndex = 0): string {
  const raw = message.id || message.messageId || message.clientMessageId;
  if (raw) return String(raw);
  if (typeof message.seq === 'number' && Number.isFinite(message.seq)) return `seq:${message.seq}`;
  return `${message.role || 'msg'}-${fallbackIndex}`;
}

function mergeMessage(prev: ChatMessage, next: ChatMessage): ChatMessage {
  const merged: ChatMessage = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function sortChronological(items: ChatMessage[]): ChatMessage[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aHasSeq = typeof a.item.seq === 'number' && Number.isFinite(a.item.seq);
      const bHasSeq = typeof b.item.seq === 'number' && Number.isFinite(b.item.seq);
      if (aHasSeq && bHasSeq) {
        if (a.item.seq !== b.item.seq) return (a.item.seq as number) - (b.item.seq as number);
        return a.index - b.index;
      }
      if (aHasSeq) return -1;
      if (bHasSeq) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
  mode: 'replace' | 'prepend' | 'append',
): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  const order: string[] = [];

  const upsert = (list: ChatMessage[], prependNew: boolean) => {
    list.forEach((item, index) => {
      const key = messageKey(item, index);
      const current = byKey.get(key);
      if (current) {
        byKey.set(key, mergeMessage(current, item));
      } else {
        byKey.set(key, item);
        if (prependNew) order.unshift(key);
        else order.push(key);
      }
    });
  };

  if (mode === 'replace') {
    upsert(incoming, false);
  } else if (mode === 'prepend') {
    upsert(existing, false);
    // Insert unseen incoming items in reverse order at front so relative order is kept before sorting.
    const incomingToAdd: { key: string; item: ChatMessage }[] = [];
    incoming.forEach((item, index) => {
      const key = messageKey(item, index);
      const current = byKey.get(key);
      if (current) {
        byKey.set(key, mergeMessage(current, item));
      } else {
        byKey.set(key, item);
        incomingToAdd.push({ key, item });
      }
    });
    if (incomingToAdd.length > 0) {
      order.unshift(...incomingToAdd.map((entry) => entry.key));
    }
  } else {
    upsert(existing, false);
    upsert(incoming, false);
  }

  return sortChronological(order.map((key) => byKey.get(key)!));
}

export type LiveStepsState = {
  turn: number | null;
  steps: LiveStepEntry[];
};

export function applyLiveStepsFrame(
  current: LiveStepsState,
  frame: { full?: boolean; turn?: number | null; steps?: LiveStepEntry[] },
): LiveStepsState {
  const incomingSteps = Array.isArray(frame.steps) ? frame.steps : [];
  const nextTurn = typeof frame.turn === 'number' ? frame.turn : (frame.turn === null ? null : current.turn);
  const turnSwitched = typeof frame.turn === 'number' && current.turn !== null && frame.turn !== current.turn;

  if (frame.full === true || turnSwitched) {
    return {
      turn: frame.turn ?? null,
      steps: incomingSteps.map((entry) => ({ key: entry.key, step: { ...entry.step } })),
    };
  }

  const nextSteps = current.steps.map((entry) => ({ key: entry.key, step: { ...entry.step } }));
  const indexByKey = new Map<string, number>();
  nextSteps.forEach((entry, index) => indexByKey.set(entry.key, index));

  for (const entry of incomingSteps) {
    const existingIndex = indexByKey.get(entry.key);
    if (existingIndex === undefined) {
      indexByKey.set(entry.key, nextSteps.length);
      nextSteps.push({ key: entry.key, step: { ...entry.step } });
    } else {
      nextSteps[existingIndex] = {
        key: entry.key,
        step: { ...nextSteps[existingIndex].step, ...entry.step },
      };
    }
  }

  return {
    turn: nextTurn,
    steps: nextSteps,
  };
}

export function findActiveTurnStartedAt(messages: ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.turnLifecycle?.state === 'running' && typeof item.turnLifecycle.startedAt === 'number') {
      return item.turnLifecycle.startedAt;
    }
    if (item.turnLifecycle && item.turnLifecycle.state !== 'running') {
      return null;
    }
  }
  return null;
}

export function isSkeletonOnlyAssistantMessage(message: ChatMessage, turnsWithProcess: Set<number>): boolean {
  if (message.role !== 'assistant' || message.kind || message.error) return false;
  if (typeof message.text === 'string' && message.text.trim().length > 0) return false;
  if (Array.isArray(message.images) && message.images.length > 0) return false;
  if (!Array.isArray(message.blocks) || message.blocks.length === 0) return false;
  if (typeof message.turn !== 'number' || !turnsWithProcess.has(message.turn)) return false;
  return message.blocks.every((block) => block.type === 'tool-call' && !block.argsRaw && !block.output);
}

export function visibleChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const turnsWithProcess = new Set<number>();
  for (const item of messages) {
    if (typeof item.turn === 'number' && item.turnProcess?.steps?.length) {
      turnsWithProcess.add(item.turn);
    }
  }
  if (turnsWithProcess.size === 0) return messages;
  return messages.filter((item) => !isSkeletonOnlyAssistantMessage(item, turnsWithProcess));
}
