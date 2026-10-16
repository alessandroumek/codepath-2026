import { getEndTime, getTime, type Session } from './catalog';

/** A deliberately compressed timeline: session time is proportional, long empty breaks are folded. */
export interface ScheduleSegment {
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
  active: boolean;
}
export interface ScheduleGeometry {
  segments: ScheduleSegment[];
  height: number;
  yFor: (minute: number) => number;
  starts: number[];
}

export function timeMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Geometry is based on the complete day, not on filtered sessions, to avoid visual jumps. */
export function buildScheduleGeometry(sessions: Session[]): ScheduleGeometry {
  if (sessions.length === 0) return { segments: [], height: 0, starts: [], yFor: () => 0 };
  const bounds = [...new Set(sessions.flatMap(s => [timeMinutes(getTime(s)), timeMinutes(getEndTime(s))]))].sort((a, b) => a - b);
  const starts = [...new Set(sessions.map(s => timeMinutes(getTime(s))))].sort((a, b) => a - b);
  let cursor = 0;
  const segments: ScheduleSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startMinute = bounds[i];
    const endMinute = bounds[i + 1];
    const active = sessions.some(s => timeMinutes(getTime(s)) < endMinute && timeMinutes(getEndTime(s)) > startMinute);
    const duration = endMinute - startMinute;
    // Talk length is proportional; gaps between blocks are only 20–30px high.
    const height = active ? duration * 3.05 : Math.min(32, Math.max(16, duration * 0.7));
    segments.push({ startMinute, endMinute, top: cursor, height, active });
    cursor += height;
  }
  const yFor = (minute: number) => {
    if (minute <= bounds[0]) return 0;
    if (minute >= bounds[bounds.length - 1]) return cursor;
    const segment = segments.find(s => s.startMinute <= minute && s.endMinute >= minute);
    return segment ? segment.top + (minute - segment.startMinute) * segment.height / (segment.endMinute - segment.startMinute) : 0;
  };
  return { segments, height: cursor, starts, yFor };
}

export function minuteLabel(minute: number): string {
  return `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}
