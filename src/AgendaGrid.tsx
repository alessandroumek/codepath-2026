import { useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, CircleAlert, Clock3, Info, Plus } from 'lucide-react';
import { catalog, categoriesById, getConflicts, getRoomName, getSpeakerNames, getTime, getEndTime, type Session } from './lib/catalog';
import { buildScheduleGeometry, minuteLabel, timeMinutes } from './lib/schedule-grid';

type Props = {
  day: string;
  visible: Session[];
  selectedIds: string[];
  selectedSet: ReadonlySet<string>;
  savedSet: ReadonlySet<string>;
  onSelect: (session: Session) => void;
  onSave: (id: string) => void;
  onDetail: (id: string) => void;
  onViewPlan: () => void;
};

const GUTTER = 76;
const ROOM_WIDTH = 205;
const GRID_HEADER_HEIGHT = 57;

/** Every room is one column, including the workshop room, and every talk uses its actual duration. */
export default function AgendaGrid({
  day, visible, selectedIds, selectedSet, savedSet, onSelect, onSave, onDetail, onViewPlan,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const daySessions = useMemo(() => catalog.sessions.filter(s => s.schedule?.date === day), [day]);
  const geometry = useMemo(() => buildScheduleGeometry(daySessions), [daySessions]);
  const rooms = catalog.rooms;
  const totalWidth = GUTTER + rooms.length * ROOM_WIDTH;
  const visibleSet = useMemo(() => new Set(visible.map(s => s.id)), [visible]);
  const selectedToday = daySessions.filter(s => selectedSet.has(s.id)).length;
  const conflictCount = visible.filter(s => !selectedSet.has(s.id) && getConflicts(s, selectedIds).length > 0).length;

  if (!visible.length) return <div className="grid-no-results"><Info size={20}/><strong>Nessun talk corrisponde ai filtri.</strong><span>Prova ad ampliare la ricerca o a rimuovere un filtro.</span></div>;

  return <section className="schedule-section" aria-label="Agenda a griglia per sale e orari">
    <div className="grid-toolbar">
      <div className="grid-legend">
        <span><i className="legend-mark legend-selected"/> Nel percorso</span>
        <span><i className="legend-mark legend-conflict"/> Sovrapposto a una scelta</span>
        <span><i className="legend-mark legend-free"/> Disponibile</span>
      </div>
      <div className="grid-toolbar-actions">
        <span className="grid-conflict-counter">{conflictCount} alternative in conflitto</span>
        <button className="grid-direction" onClick={() => scrollRef.current?.scrollBy({left: -ROOM_WIDTH * 2, behavior: 'smooth'})} aria-label="Scorri alle sale precedenti" title="Sale precedenti"><ArrowLeft size={17}/></button>
        <button className="grid-direction" onClick={() => scrollRef.current?.scrollBy({left: ROOM_WIDTH * 2, behavior: 'smooth'})} aria-label="Scorri alle sale successive" title="Sale successive"><ArrowRight size={17}/></button>
      </div>
    </div>
    <div className="grid-scroller" ref={scrollRef} tabIndex={0} aria-label="Griglia delle sessioni; scorri orizzontalmente per visualizzare tutte le sale">
      <div className="grid-interior" style={{width: totalWidth}}>
        <div className="grid-room-headings" style={{height: GRID_HEADER_HEIGHT}}>
          <div className="grid-time-heading" style={{width: GUTTER}}>ORA</div>
          {rooms.map((room, index) => <div className="grid-room-heading" key={room.id} style={{left: GUTTER + index * ROOM_WIDTH, width: ROOM_WIDTH}}>
            <span className="grid-room-number">{String(index + 1).padStart(2, '0')}</span>
            <strong>{room.name}</strong>
          </div>)}
        </div>
        <div className="grid-board" style={{height: geometry.height + 17}}>
          {rooms.map((room, index) => <div className="grid-room-lane" key={room.id} style={{left: GUTTER + index * ROOM_WIDTH, width: ROOM_WIDTH, height: geometry.height + 17}}/>)}
          {geometry.segments.filter(segment => !segment.active && segment.endMinute - segment.startMinute >= 30).map(segment => <div className="grid-break" key={`break-${segment.startMinute}`} style={{top: segment.top + 1, height: segment.height, left: GUTTER, width: rooms.length * ROOM_WIDTH}}><span>Pausa · {segment.endMinute - segment.startMinute} min</span></div>)}
          {geometry.starts.map(minute => <div className="grid-hour-row" key={`line-${minute}`} style={{top: geometry.yFor(minute)}}><div className="grid-hour-rule" style={{left: GUTTER, width: rooms.length * ROOM_WIDTH}}/></div>)}
          <div className="grid-time-rail" style={{height: geometry.height + 17}} aria-hidden="true">
            {geometry.starts.map(minute => <span className="grid-time-tick" key={minute} style={{top: geometry.yFor(minute)}}>{minuteLabel(minute)}</span>)}
          </div>
          {daySessions.filter(s => visibleSet.has(s.id)).map(session => {
            const schedule = session.schedule!;
            const roomIndex = rooms.findIndex(room => room.id === schedule.roomId);
            if (roomIndex < 0) return null;
            const top = geometry.yFor(timeMinutes(getTime(session)));
            const bottom = geometry.yFor(timeMinutes(getEndTime(session)));
            const height = bottom - top - 4;
            const isSelected = selectedSet.has(session.id);
            const conflict = !isSelected && getConflicts(session, selectedIds).length > 0;
            const saved = savedSet.has(session.id);
            const compact = height < 67;
            const dense = height >= 67 && height < 116;
            const primaryCategory = categoriesById.get(session.categoryIds[0]);
            return <article key={session.id} className={`grid-talk ${isSelected ? 'grid-talk-selected' : ''} ${conflict ? 'grid-talk-conflict' : ''} ${compact ? 'grid-talk-compact' : ''} ${dense ? 'grid-talk-dense' : ''} ${session.format === 'workshop' ? 'grid-talk-workshop' : ''}`}
              style={{top: top + 2, left: GUTTER + roomIndex * ROOM_WIDTH + 5, width: ROOM_WIDTH - 10, height}} aria-label={`${getTime(session)} - ${getEndTime(session)}: ${session.title} — ${getRoomName(session)}${isSelected ? ', nel tuo percorso' : conflict ? ', in conflitto con una selezione' : ''}`}>
              <div className="grid-talk-top"><span className="grid-talk-time"><Clock3 size={11}/>{getTime(session)}–{getEndTime(session)}</span>
                <button className={`grid-favorite ${saved ? 'grid-favorite-active' : ''}`} title={saved ? 'Rimuovi dai preferiti' : 'Salva tra i preferiti'} aria-label={saved ? 'Rimuovi dai preferiti' : 'Salva tra i preferiti'} onClick={() => onSave(session.id)}><Bookmark size={13} fill={saved ? 'currentColor' : 'none'}/></button>
              </div>
              <button className="grid-talk-title" title={`Dettagli: ${session.title}`} onClick={() => onDetail(session.id)}>{session.title}</button>
              {!compact && <div className="grid-talk-bottom"><span title={getSpeakerNames(session)}>{getSpeakerNames(session)}</span>{primaryCategory && <small title={primaryCategory.label}>{primaryCategory.label}</small>}</div>}
              <button className={`grid-talk-select ${isSelected ? 'is-chosen' : ''} ${conflict ? 'will-replace' : ''}`} onClick={() => onSelect(session)} title={isSelected ? 'Rimuovi dal percorso' : conflict ? 'Confronta la sovrapposizione e sostituisci' : 'Aggiungi al percorso'} aria-label={isSelected ? `Rimuovi ${session.title} dal percorso` : conflict ? `Sostituisci il talk selezionato con ${session.title}` : `Aggiungi ${session.title} al percorso`}>
                {isSelected ? <Check size={13}/> : conflict ? <CircleAlert size={13}/> : <Plus size={13}/>}
                {!compact && <span>{isSelected ? 'Scelto' : conflict ? 'Sostituisci' : 'Scegli'}</span>}
              </button>
            </article>;
          })}
        </div>
      </div>
    </div>
    <div className="grid-footer-bar">
      <span><Info size={14}/> Le pause sono compresse; i talk e i workshop rispettano le durate reali. Scorri lateralmente per vedere tutte le sale.</span>
      <button onClick={onViewPlan}>{selectedToday} {selectedToday === 1 ? 'talk scelto' : 'talk scelti'} oggi <ArrowRight size={15}/></button>
    </div>
  </section>;
}
