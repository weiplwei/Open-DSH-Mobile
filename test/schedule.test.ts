import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScheduleTiming } from '../src/lib/schedule';

test('builds local daily and weekly schedules', () => {
  assert.deepEqual(buildScheduleTiming({ frequency: 'daily', time: '08:30', weekdays: [], cron: '', timeZone: 'America/Edmonton' }), { kind: 'daily', daily: { time: '08:30', time_zone: 'America/Edmonton' } });
  assert.deepEqual(buildScheduleTiming({ frequency: 'weekly', time: '09:00', weekdays: [5, 1], cron: '', timeZone: 'UTC' }), { kind: 'weekly', weekly: { time: '09:00', time_zone: 'UTC', weekdays: [1, 5] } });
});

test('rejects invalid local time and empty weekly schedule', () => {
  assert.throws(() => buildScheduleTiming({ frequency: 'daily', time: '25:00', weekdays: [], cron: '', timeZone: 'UTC' }), /24 小时制/);
  assert.throws(() => buildScheduleTiming({ frequency: 'weekly', time: '09:00', weekdays: [], cron: '', timeZone: 'UTC' }), /至少选择一天/);
});
