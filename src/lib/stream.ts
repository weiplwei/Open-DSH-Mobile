import { fetch as expoFetch } from 'expo/fetch';
import { ApiError, DshClient } from './api';
import type { ResponseEnvelope } from './e2ee';
import { SseParser, type SseRecord } from './sse';

type StreamResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } };
  text(): Promise<string>;
};
type StreamFetch = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}) => Promise<StreamResponse>;

export type StreamOptions = {
  sessionId: string;
  parentSessionId?: string;
  mode?: 'one-shot' | 'continuable';
  lastSeq?: number;
  lastEventId?: string;
  signal: AbortSignal;
  onPayload(payload: Record<string, unknown>, record: SseRecord): void;
  onState?(state: 'connecting' | 'live' | 'closed'): void;
};

/** One resumable v2 session stream. The caller owns reconnect timing and authoritative refreshes. */
export async function streamSession(
  client: DshClient,
  options: StreamOptions,
  fetchImpl: StreamFetch = expoFetch as unknown as StreamFetch,
): Promise<void> {
  const query = {
    sessionId: options.sessionId,
    parentSessionId: options.parentSessionId,
    mode: options.mode,
    lastSeq: options.lastSeq,
  };
  const errors: string[] = [];
  for (const address of client.candidateAddresses()) {
    if (options.signal.aborted) return;
    options.onState?.('connecting');
    const prepared = client.signedRequest('GET', '/session/stream', { query }, address);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const abort = () => controller.abort();
    options.signal.addEventListener('abort', abort, { once: true });
    let reader: Awaited<ReturnType<StreamResponse['body']['getReader']>> | undefined;
    try {
      const response = await fetchImpl(prepared.url, {
        method: 'GET',
        headers: {
          ...prepared.headers,
          accept: 'text/event-stream',
          ...(options.lastEventId ? { 'last-event-id': options.lastEventId } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text();
        throw new ApiError(text || `实时连接失败（HTTP ${response.status}）`, response.status);
      }
      client.host.activeAddress = address;
      options.onState?.('live');
      reader = response.body.getReader();
      const parser = new SseParser();
      const decoder = new TextDecoder();
      let seq = 0;
      while (!options.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        const records = parser.push(decoder.decode(value, { stream: true }));
        for (const record of records) {
          if (record.data === undefined) continue;
          seq += 1;
          const envelope = JSON.parse(record.data) as ResponseEnvelope;
          const payload = client.decodeStreamFrame<Record<string, unknown>>(
            envelope, prepared.path, prepared.ts, prepared.nonce, seq,
          );
          options.onPayload(payload, record);
        }
      }
      options.onState?.('closed');
      return;
    } catch (error) {
      if (options.signal.aborted) return;
      if (error instanceof ApiError) throw error;
      errors.push(`${address}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', abort);
      if (reader) await reader.cancel().catch(() => undefined);
    }
  }
  throw new ApiError(`实时连接不可用：\n${errors.join('\n')}`);
}
