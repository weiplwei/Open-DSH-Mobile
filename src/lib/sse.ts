export type SseRecord = { id?: string; data?: string; retry?: number };

function parseRecord(block: string): SseRecord | null {
  const record: SseRecord = {};
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    else if (field === 'id') record.id = value;
    else if (field === 'retry' && /^\d+$/.test(value)) record.retry = Number(value);
  }
  if (data.length) record.data = data.join('\n');
  return record.data !== undefined || record.id !== undefined ? record : null;
}

export class SseParser {
  private buffer = '';

  push(chunk: string): SseRecord[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const records: SseRecord[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const record = parseRecord(block);
      if (record) records.push(record);
      boundary = this.buffer.indexOf('\n\n');
    }
    return records;
  }
}
