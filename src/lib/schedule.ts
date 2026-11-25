import type { ScheduleTiming } from './types';

export type ScheduleForm = {
  frequency: 'daily' | 'weekly' | 'cron' | 'every' | 'after';
  time: string;
  weekdays: number[];
  cron: string;
  intervalMinutes?: string;
  timeZone: string;
};

export function buildScheduleTiming(form: ScheduleForm): ScheduleTiming {
  if (form.frequency === 'cron') {
    const expression = form.cron.trim();
    if (!expression) throw new Error('请输入 cron 表达式');
    return { kind: 'cron', cron: { expression, time_zone: form.timeZone } };
  }
  if (form.frequency === 'every' || form.frequency === 'after') {
    const mins = Number(form.intervalMinutes || '');
    if (!Number.isFinite(mins) || mins <= 0) throw new Error('请输入有效的分钟数');
    const seconds = Math.round(mins * 60);
    return form.frequency === 'every'
      ? { kind: 'every', every_seconds: seconds }
      : { kind: 'after', after_seconds: seconds };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) throw new Error('时间请使用 24 小时制 HH:mm');
  if (form.frequency === 'weekly') {
    if (!form.weekdays.length) throw new Error('每周任务至少选择一天');
    return { kind: 'weekly', weekly: { time: form.time, time_zone: form.timeZone, weekdays: [...form.weekdays].sort() } };
  }
  return { kind: 'daily', daily: { time: form.time, time_zone: form.timeZone } };
}

export function scheduleTimingLabel(timing?: ScheduleTiming): string {
  if (!timing) return '未设置时间';
  if (timing.kind === 'daily') {
    const daily = timing.daily as { time?: string; time_zone?: string } | undefined;
    return `每天 ${daily?.time || ''}${daily?.time_zone ? ` · ${daily.time_zone}` : ''}`;
  }
  if (timing.kind === 'weekly') {
    const weekly = timing.weekly as { time?: string; weekdays?: number[] } | undefined;
    return `每周 ${(weekly?.weekdays || []).join('/')} · ${weekly?.time || ''}`;
  }
  if (timing.kind === 'cron') {
    const cron = timing.cron as { expression?: string } | undefined;
    return `Cron · ${cron?.expression || ''}`;
  }
  if (timing.kind === 'after') {
    const secs = Number(timing.after_seconds ?? (Number(timing.after_ms || 0) / 1000));
    return secs >= 60 ? `延时 ${Math.round(secs / 60)} 分钟` : `延时 ${secs} 秒`;
  }
  if (timing.kind === 'every') {
    const secs = Number(timing.every_seconds ?? (Number(timing.every_ms || 0) / 1000));
    return secs >= 60 ? `每隔 ${Math.round(secs / 60)} 分钟` : `每隔 ${secs} 秒`;
  }
  if (timing.kind === 'at') return `单次 · ${String(timing.at || '')}`;
  if (timing.kind === 'rrule') return `RRULE · ${String(timing.rrule || '')}`;
  return timing.kind;
}
