import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, Bookmark, CalendarCheck2, CalendarDays,
  Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Compass, Download, ExternalLink,
  Filter, Github, Grid3X3, Info, Layers3, List, MapPin, Menu, Mic2, Plus, Search,
  Star, Trash2, Upload, UsersRound, X,
} from 'lucide-react';
import {
  catalog, categoriesById, DATE_LABEL, getConflicts, getEndTime, getRoomName, getSpeakerNames,
  getSpeakers, getTime, sessionSort, sessionsById, type Session, type Speaker,
} from './lib/catalog';
import AgendaGrid from './AgendaGrid';
import { exportIcs, exportPlan, parseImportedPlan, PLAN_STORAGE_KEY, readPlan, storePlan, type PlanState } from './lib/plan';

// Keep the conference catalog immutable. Only PlanState changes with user interaction.
type View = 'agenda' | 'plan' | 'speakers';
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
const runningStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const firstDay = catalog.event.dates[0];
const formatDayShort = (date: string) => date.endsWith('-28') ? 'MER 28 OTT' : 'GIO 29 OTT';
const sortedSessions = [...catalog.sessions].filter(s => s.schedule).sort(sessionSort);

function SpeakerAvatar({ speaker, size = 'sm' }: { speaker?: Speaker; size?: 'sm' | 'lg' | 'xl' }) {
  const [failed, setFailed] = useState(false);
  const initials = (speaker?.name || '?').split(' ').map(n => n.charAt(0)).slice(0, 2).join('').toUpperCase();
  return <span className={`avatar avatar-${size}`} aria-label={speaker?.name ?? 'Speaker'}>
    {speaker?.photoUrl && !failed ? <img src={speaker.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{initials}</span>}
  </span>;
}

function IconBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`small-chip ${className}`}>{children}</span>;
}

function SessionCard({
  session, selected, saved, onSelect, onSave, onDetail,
}: {
  session: Session; selected: boolean; saved: boolean;
  onSelect: (session: Session) => void; onSave: (id: string) => void; onDetail: (id: string) => void;
}) {
  const speakers = getSpeakers(session);
  const primaryCategory = categoriesById.get(session.categoryIds[0]);
  return <article className={`session-card ${selected ? 'session-card-selected' : ''}`}>
    <div className="card-topline">
      <span className="room-name"><span className="room-dot" />{getRoomName(session)}</span>
      <div className="card-top-actions">
        {session.format === 'workshop' && <span className="workshop-label">WORKSHOP</span>}
        <button type="button" className={`icon-button bookmark-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Togli dai preferiti' : 'Salva tra i preferiti'} title={saved ? 'Togli dai preferiti' : 'Da valutare'} onClick={() => onSave(session.id)}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
    </div>
    <button type="button" className="session-title" onClick={() => onDetail(session.id)}>{session.title}</button>
    <p className="session-summary">{session.summary.text}</p>
    <div className="session-chips">
      {primaryCategory && <IconBadge className="category-chip">{primaryCategory.label}</IconBadge>}
      {session.categoryIds.length > 1 && <span className="extra-category" title={session.categoryIds.slice(1).map(c => categoriesById.get(c)?.label).join(', ')}>+{session.categoryIds.length - 1}</span>}
    </div>
    <div className="session-card-foot">
      <button type="button" className="speaker-inline" onClick={() => onDetail(session.id)} title="Apri dettagli speaker">
        <div className="avatar-stack">{speakers.slice(0, 2).map(s => <SpeakerAvatar key={s.id} speaker={s} />)}</div>
        <span>{getSpeakerNames(session)}</span>
      </button>
      <button type="button" className={`add-session-btn ${selected ? 'added' : ''}`} aria-label={selected ? 'Rimuovi dal percorso' : 'Aggiungi al percorso'} title={selected ? 'Nel percorso: clicca per rimuovere' : 'Aggiungi al percorso'} onClick={() => onSelect(session)}>
        {selected ? <Check size={18} /> : <Plus size={18} />}
      </button>
    </div>
  </article>;
}

function DetailModal({
  session, selected, saved, rating, note, onClose, onSelect, onSave, onRating, onNote,
}: {
  session: Session; selected: boolean; saved: boolean; rating?: number; note?: string;
  onClose: () => void; onSelect: (session: Session) => void; onSave: (id: string) => void;
  onRating: (id: string, rating: number) => void; onNote: (id: string, note: string) => void;
}) {
  const speakers = getSpeakers(session);
  const categories = session.categoryIds.map(id => categoriesById.get(id)?.label).filter(Boolean);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
    <section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className="detail-nav"><span className="eyebrow">DETTAGLIO SESSIONE</span><button className="icon-button" onClick={onClose} title="Chiudi" aria-label="Chiudi"><X size={20} /></button></div>
      <div className="detail-scroll">
        <div className="detail-meta">
          {session.schedule ? <><IconBadge><CalendarDays size={13} /> {DATE_LABEL[session.schedule.date]}</IconBadge><IconBadge><Clock3 size={13}/>{getTime(session)}–{getEndTime(session)}</IconBadge><IconBadge><MapPin size={13}/>{getRoomName(session)}</IconBadge></> : <IconBadge>Orario da confermare</IconBadge>}
        </div>
        <h2 id="detail-title">{session.title}</h2>
        <div className="category-row">{categories.map(label => <span key={label} className="category-tag">{label}</span>)}</div>
        <div className="detail-section"><h3>Abstract ufficiale</h3><p className="official-abstract">{session.summary.text}</p>
        </div>
        <div className="detail-section"><h3>{speakers.length > 1 ? 'Gli speaker' : 'Lo speaker'}</h3>
          {speakers.map(s => <div className="speaker-detail" key={s.id}><SpeakerAvatar speaker={s} size="xl"/><div><strong>{s.name}</strong><span className="speaker-role">{s.role || 'Profilo in aggiornamento'}</span>{s.biography && <p>{s.biography}</p>}<a href={s.profileUrl} target="_blank" rel="noreferrer">Profilo su Codemotion <ArrowUpRight size={14}/></a></div></div>)}
        </div>
        <div className="detail-section"><h3>Tag</h3><div className="tag-cloud">{session.tags.map(tag => <span className="tag" key={tag}>#{tag}</span>)}</div></div>
        <div className="detail-section personal-section"><h3>La tua valutazione <span className="local-tag">Salvate sul dispositivo</span></h3><span className="muted-caption">Quanto ti interessa questo talk?</span>
          <div className="rating-row" role="group" aria-label="Interesse da 1 a 5 stelle">{[1, 2, 3, 4, 5].map(i => <button aria-label={`Interesse ${i} su 5`} title={`${i} su 5`} key={i} className={`rating-star ${rating && i <= rating ? 'lit' : ''}`} onClick={() => onRating(session.id, i)}><Star size={25} fill={rating && i <= rating ? 'currentColor' : 'none'}/></button>)}</div>
          <label className="note-label" htmlFor="personal-note">Note personali</label>
          <textarea id="personal-note" value={note ?? ''} onChange={e => onNote(session.id, e.target.value.slice(0, 4000))} maxLength={4000} placeholder="Cosa ti interessa approfondire? Domande da fare allo speaker…" rows={3}/>
        </div>
      </div>
      <div className="detail-actions"><button className={`btn-secondary ${saved ? 'saved' : ''}`} onClick={() => onSave(session.id)}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'}/>{saved ? 'Da valutare ✓' : 'Da valutare'}</button><button className={`btn-primary ${selected ? 'btn-quiet' : ''}`} disabled={!session.schedule} onClick={() => onSelect(session)}>{selected ? <><Check size={17}/> Nel percorso</> : <><Plus size={17}/> Aggiungi al percorso</>}</button></div>
    </section>
  </div>;
}

function ConflictModal({ candidate, conflicting, onReplace, onCancel }: { candidate: Session; conflicting: Session[]; onReplace: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop conflict-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }} role="presentation">
    <div className="conflict-dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description">
      <div className="conflict-icon"><CircleAlert size={23}/></div><h2 id="conflict-title">Due talk, stesso orario.</h2><p id="conflict-description">Vuoi seguire <strong>{candidate.title}</strong>? Dovrai sostituire {conflicting.length > 1 ? 'le sessioni già selezionate' : 'la sessione già selezionata'} in sovrapposizione.</p>
      <div className="conflict-current"><span>GIÀ NEL PERCORSO</span>{conflicting.map(c => <strong key={c.id}>{getTime(c)} · {c.title}</strong>)}</div>
      <div className="conflict-actions"><button className="btn-secondary" onClick={onCancel}>Annulla</button><button className="btn-primary" onClick={onReplace}>Sostituisci {conflicting.length > 1 ? `${conflicting.length} talk` : 'il talk'} <ArrowRight size={17}/></button></div>
    </div>
  </div>;
}

function EmptyState({ title, description, children, icon = 'calendar' }: { title: string; description: string; children?: ReactNode; icon?: 'calendar' | 'search' }) {
  return <div className="empty-state"><span className="empty-icon">{icon === 'calendar' ? <CalendarCheck2 size={31} strokeWidth={1.5}/> : <Search size={28} strokeWidth={1.5}/>}</span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

function App() {
  const [view, setView] = useState<View>('agenda');
  const [day, setDay] = useState(firstDay);
  const [agendaLayout, setAgendaLayout] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('codepath:agenda-layout') === 'list' ? 'list' : 'grid'; }
    catch { return 'grid'; }
  });
  const [search, setSearch] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [roomFilter, setRoomFilter] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [plan, setPlan] = useState<PlanState>(readPlan);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{candidate: Session; conflicting: Session[]} | null>(null);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(runningStandalone);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { storePlan(plan); }, [plan]);
  useEffect(() => { try { localStorage.setItem('codepath:agenda-layout', agendaLayout); } catch { /* storage unavailable */ } }, [agendaLayout]);
  // Changes in another tab of the same origin are reflected here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === PLAN_STORAGE_KEY && event.storageArea === localStorage) setPlan(readPlan());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); setShowInstallHelp(false); };
    const media = window.matchMedia('(display-mode: standalone)');
    const onModeChange = () => setIsInstalled(runningStandalone());
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onModeChange);
    };
  }, []);
  useEffect(() => {
    if (!detailId && !pendingConflict) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPendingConflict(null); setDetailId(null); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [detailId, pendingConflict]);
  const selectedSet = useMemo(() => new Set(plan.selectedIds), [plan.selectedIds]);
  const savedSet = useMemo(() => new Set(plan.savedIds), [plan.savedIds]);
  const selected = useMemo(() => plan.selectedIds.map(id => sessionsById.get(id)).filter((s): s is Session => Boolean(s?.schedule)).sort(sessionSort), [plan.selectedIds]);

  const visible = useMemo(() => sortedSessions.filter(session => {
    const sameDay = session.schedule?.date === day;
    if (!sameDay) return false;
    if (roomFilter && session.schedule?.roomId !== roomFilter) return false;
    if (categoryFilters.length && !categoryFilters.some(id => session.categoryIds.includes(id))) return false;
    if (savedOnly && !savedSet.has(session.id)) return false;
    if (!search.trim()) return true;
    const text = [session.title, session.summary.text, getSpeakerNames(session), ...session.tags, ...session.categoryIds.map(id => categoriesById.get(id)?.label || '')].join(' ').toLocaleLowerCase('it');
    return text.includes(search.toLocaleLowerCase('it').trim());
  }), [day, search, categoryFilters, roomFilter, savedOnly, savedSet]);
  const grouped = useMemo(() => {
    const groups = new Map<string, Session[]>();
    for (const session of visible) {
      const time = getTime(session);
      const list = groups.get(time) || [];
      list.push(session);
      groups.set(time, list);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);
  const unscheduled = catalog.sessions.filter(s => !s.schedule);
  const categoriesWithCount = useMemo(() => catalog.categories.map(c => ({...c, count: catalog.sessions.filter(s => s.categoryIds.includes(c.id)).length})), []);
  const speakerMatches = useMemo(() => catalog.speakers.filter(s => {
    if (!search.trim()) return true;
    const titles = s.sessionIds.map(id => sessionsById.get(id)?.title ?? '').join(' ');
    return `${s.name} ${s.role ?? ''} ${s.biography ?? ''} ${titles}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it').trim());
  }), [search]);
  const hasFilters = Boolean(search || categoryFilters.length || roomFilter || savedOnly);

  function navigate(v: View) { setView(v); setMobileMenu(false); setSearch(''); }
  function toggleCategory(id: string) { setCategoryFilters(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]); }
  function clearFilters() { setSearch(''); setCategoryFilters([]); setRoomFilter(''); setSavedOnly(false); }
  function saveSession(id: string) { setPlan(p => ({...p, savedIds: p.savedIds.includes(id) ? p.savedIds.filter(item => item !== id) : [...p.savedIds, id]})); }
  function selectSession(session: Session) {
    if (!session.schedule) return;
    if (selectedSet.has(session.id)) {
      setPlan(p => ({...p, selectedIds: p.selectedIds.filter(id => id !== session.id)}));
      return;
    }
    const conflicting = getConflicts(session, plan.selectedIds);
    if (conflicting.length) {
      setDetailId(null);
      setPendingConflict({candidate: session, conflicting});
      return;
    }
    setPlan(p => ({...p, selectedIds: [...p.selectedIds, session.id]}));
  }
  function replaceConflicting() {
    if (!pendingConflict) return;
    const drop = new Set(pendingConflict.conflicting.map(s => s.id));
    setPlan(p => ({...p, selectedIds: [...p.selectedIds.filter(id => !drop.has(id)), pendingConflict.candidate.id]}));
    setPendingConflict(null);
  }
  function setRating(id: string, rating: number) { setPlan(p => ({...p, ratings: {...p.ratings, [id]: rating}})); }
  function setNote(id: string, note: string) { setPlan(p => ({...p, notes: {...p.notes, [id]: note}})); }
  async function handleImport(file?: File) {
    if (!file) return;
    try {
      const imported = parseImportedPlan(await file.text());
      setPlan(imported); setToast('Percorso importato correttamente.'); setView('plan');
    } catch (err) { setToast(err instanceof Error ? err.message : 'Impossibile importare il file.'); }
    if (importRef.current) importRef.current.value = '';
  }
  function clearPlan() {
    if (window.confirm('Vuoi rimuovere tutti i talk dal tuo percorso? Preferiti, voti e note resteranno salvati.')) setPlan(p => ({...p, selectedIds: []}));
  }

  async function installApp() {
    if (!installPrompt) { setShowInstallHelp(true); return; }
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch { setShowInstallHelp(true); }
    finally { setInstallPrompt(null); }
  }

  const detailSession = detailId ? sessionsById.get(detailId) : undefined;
  return <div className="app-layout">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} aria-label="Menu principale">
      <div className="sidebar-head"><button type="button" className="brand" onClick={() => navigate('agenda')} title="Torna all'agenda"><span className="brand-logo">C<span>◢</span></span><span><strong>codepath<span className="brand-period">.</span></strong><small>YOUR CONFERENCE, YOUR WAY</small></span></button><button className="mobile-close icon-button" aria-label="Chiudi menu" onClick={() => setMobileMenu(false)}><X size={19}/></button></div>
      <div className="sidebar-inner">
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-links" aria-label="Viste principali">
          <button className={`nav-item ${view === 'agenda' ? 'active' : ''}`} onClick={() => navigate('agenda')}><CalendarDays size={19}/> Agenda completa <ChevronRight className="nav-chevron" size={15}/></button>
          <button className={`nav-item ${view === 'plan' ? 'active' : ''}`} onClick={() => navigate('plan')}><Compass size={19}/> Il mio percorso <span className="count-badge">{selected.length}</span></button>
          <button className={`nav-item ${view === 'speakers' ? 'active' : ''}`} onClick={() => navigate('speakers')}><UsersRound size={19}/> Speaker <span className="nav-chevron nav-count">{catalog.speakers.length}</span></button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-categories-title"><span>ESPLORA PER TEMA</span><Layers3 size={16}/></div>
        <div className="side-categories">{categoriesWithCount.map(c => <label key={c.id} className={`category-option ${categoryFilters.includes(c.id) ? 'checked' : ''}`}><input type="checkbox" checked={categoryFilters.includes(c.id)} onChange={() => {toggleCategory(c.id); setView('agenda');}}/><span className="custom-checkbox">{categoryFilters.includes(c.id) && <Check size={12}/>}</span><span className="category-name">{c.label}</span><span className="category-count">{c.count}</span></label>)}</div>
        {categoryFilters.length > 0 && <button className="reset-cats" onClick={() => setCategoryFilters([])}>Rimuovi filtri <X size={14}/></button>}
      </div>
      <div className="sidebar-footer"><span className="footer-led"/> <div><strong>Dataset aggiornato</strong><small>Snapshot: 15 ottobre 2026</small></div><a href={catalog.event.sourcePages.agenda} target="_blank" rel="noreferrer" title="Apri agenda ufficiale"><ArrowUpRight size={18}/></a></div>
    </aside>
    {mobileMenu && <div className="mobile-menu-overlay" onClick={() => setMobileMenu(false)} />}

    <div className="main-shell">
      <header className="top-header"><div className="top-left"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} title="Apri menu" aria-label="Apri menu"><Menu size={23}/></button><span className="breadcrumb">CODEMOTION MILANO <span>/</span> <strong>{view === 'agenda' ? 'Agenda' : view === 'plan' ? 'Il mio percorso' : 'Speaker'}</strong></span></div><div className="header-right">{!isInstalled && <button className="install-button" type="button" onClick={installApp} title="Installa Codepath sul dispositivo"><Download size={15}/> Installa app</button>}<span className="event-dates"><CalendarDays size={16}/> 28–29 OTTOBRE 2026</span><a className="official-link" href="https://conferences.codemotion.com/milan/agenda/" target="_blank" rel="noreferrer">Sito ufficiale <ArrowUpRight size={16}/></a></div></header>
      <div className="page-wrap">
        <section className="hero"><div className="hero-copy"><span className="hero-kicker"><span className="hero-kicker-dot"/> LA TUA GUIDA ALL'EVENTO</span><h1>{view === 'agenda' ? <>Due giorni.<br/><span>Infinite possibilità.</span></> : view === 'plan' ? <>Il tuo percorso.<br/><span>Le tue scelte.</span></> : <>Le persone<br/><span>dietro le idee.</span></>}</h1><p>{view === 'agenda' ? 'Esplora gli speech, confronta le alternative e costruisci il percorso perfetto per te.' : view === 'plan' ? 'Tutti i talk che hai scelto, organizzati in modo chiaro e senza sovrapposizioni.' : 'Conosci gli speaker e scopri i loro interventi, le esperienze e i temi trattati.'}</p></div><div className="hero-ornament" aria-hidden="true"><span className="ornament-cross">+</span><div className="ornament-ring ring-a"/><div className="ornament-ring ring-b"/><div className="ornament-ring ring-c"/><div className="ornament-dots">···</div></div><div className="hero-metrics"><div><strong>{catalog.sessions.length}</strong><span>SESSIONI</span></div><div><strong>{catalog.speakers.length}</strong><span>SPEAKER</span></div><div><strong>02</strong><span>GIORNATE</span></div></div></section>

        {view === 'agenda' && <div className={`content-grid ${agendaLayout === 'grid' ? 'content-grid-grid-mode' : ''}`}>
          <div className="content-main">
            <section className="toolbar"><div className="section-heading"><div><span className="eyebrow">PIANIFICA LE TUE GIORNATE</span><h2>Esplora l'agenda <span className="heading-spark">✳</span></h2></div><span className="result-count">{visible.length} TALK TROVATI</span></div>
              <div className="day-tabs" role="tablist" aria-label="Giorno della conferenza">{catalog.event.dates.map((d, i) => <button key={d} type="button" role="tab" aria-selected={day === d} className={`day-tab ${day === d ? 'active' : ''}`} onClick={() => setDay(d)}><span className="day-number">0{i + 1}</span><span>{formatDayShort(d)}</span>{day === d && <span className="day-tab-indicator"/>}</button>)}</div>
              <div className="filter-row"><label className="search-wrap"><Search size={18}/><input aria-label="Cerca speech, speaker o tecnologia" placeholder="Cerca speech, speaker o tecnologia..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button title="Cancella ricerca" onClick={() => setSearch('')} aria-label="Cancella ricerca"><X size={16}/></button>}</label><label className="select-wrap"><MapPin size={16}/><select aria-label="Filtra per sala" value={roomFilter} onChange={e => setRoomFilter(e.target.value)}><option value="">Tutte le sale</option>{catalog.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><button className={`filter-save ${savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(p => !p)} title="Mostra solo talk da valutare"><Bookmark size={16} fill={savedOnly ? 'currentColor' : 'none'}/> Da valutare</button></div>
              {hasFilters && <div className="active-filters"><Filter size={14}/><span>Filtri attivi</span>{categoryFilters.map(id => <button className="active-filter-pill" key={id} onClick={() => toggleCategory(id)}>{categoriesById.get(id)?.label} <X size={12}/></button>)}<button className="clear-filters" onClick={clearFilters}>Azzera tutto</button></div>}
              <div className="agenda-layout-toolbar"><div className="layout-switch" role="group" aria-label="Modalità di visualizzazione dell'agenda"><button aria-pressed={agendaLayout === 'grid'} className={agendaLayout === 'grid' ? 'active' : ''} onClick={() => setAgendaLayout('grid')}><Grid3X3 size={16}/> Griglia oraria</button><button aria-pressed={agendaLayout === 'list'} className={agendaLayout === 'list' ? 'active' : ''} onClick={() => setAgendaLayout('list')}><List size={16}/> Elenco</button></div><div className="agenda-layout-note"><CheckCircle2 size={15}/> {selected.filter(s => s.schedule?.date === day).length} selezionati oggi <button onClick={() => navigate('plan')}>Vedi percorso <ArrowRight size={14}/></button></div></div>
            </section>
            {agendaLayout === 'grid' && <AgendaGrid day={day} visible={visible} selectedIds={plan.selectedIds} selectedSet={selectedSet} savedSet={savedSet} onSelect={selectSession} onSave={saveSession} onDetail={setDetailId} onViewPlan={() => navigate('plan')}/>}
            {agendaLayout === 'list' && <div className="agenda-timeline">{grouped.length === 0 ? <EmptyState icon="search" title="Nessun talk trovato" description="Prova a modificare i filtri o a cercare un altro argomento."><button className="btn-secondary" onClick={clearFilters}>Rimuovi tutti i filtri</button></EmptyState> : grouped.map(([time, slot]) => <section key={`${day}-${time}`} className="time-group"><div className="time-aside"><span className="timeline-bullet"/><strong>{time}</strong><span>{slot.length} {slot.length === 1 ? 'talk' : 'talk'} in parallelo</span></div><div className="time-content"><div className="slot-header"><div><span className="slot-time">{time}</span><span className="slot-sub">{slot.length} {slot.length === 1 ? 'intervento disponibile' : 'interventi in contemporanea'}</span></div><span className="slot-end">{Math.max(...slot.map(s => Date.parse(s.schedule!.endsAt))) ? `fino alle ${slot.reduce((last, s) => getEndTime(s) > last ? getEndTime(s) : last, '00:00')}` : ''}</span></div><div className="session-grid">{slot.map(s => <SessionCard key={s.id} session={s} selected={selectedSet.has(s.id)} saved={savedSet.has(s.id)} onSelect={selectSession} onSave={saveSession} onDetail={setDetailId}/>)}</div></div></section>)}</div>}
            {unscheduled.length > 0 && <div className="unscheduled-box"><button className="unscheduled-toggle" onClick={() => setShowUnscheduled(v => !v)}><Info size={18}/> <span>{unscheduled.length} {unscheduled.length === 1 ? 'sessione ancora senza orario' : 'sessioni ancora senza orario'}</span><span className="unscheduled-more">{showUnscheduled ? 'Nascondi' : 'Visualizza'} <ChevronRight size={16}/></span></button>{showUnscheduled && <div className="unscheduled-items">{unscheduled.map(s => <button key={s.id} onClick={() => setDetailId(s.id)}><strong>{s.title}</strong><span>{getSpeakerNames(s)} <ArrowUpRight size={14}/></span></button>)}</div>}</div>}
          </div>
          <aside className="path-sidebar" aria-label="Riepilogo del percorso"><div className="path-title"><div><span className="eyebrow">IL TUO PERCORSO</span><h2>La tua selezione</h2></div><span className="path-count">{selected.length}</span></div><div className="path-progress"><span>STAI COSTRUENDO IL TUO EVENTO</span><div className="progress-track"><div style={{width: `${Math.min(100, selected.length / 14 * 100)}%`}}/></div><p>{selected.length === 0 ? 'Inizia aggiungendo il primo talk' : `${selected.length} ${selected.length === 1 ? 'talk selezionato' : 'talk selezionati'} per i due giorni`}</p></div>{selected.length ? <div className="path-items">{catalog.event.dates.map(d => <div key={d} className="path-day"><span className="path-day-label">{DATE_LABEL[d].toUpperCase()}</span>{selected.filter(s => s.schedule?.date === d).map(s => <button className="path-item" key={s.id} onClick={() => setDetailId(s.id)}><span className="path-time">{getTime(s)}</span><span className="path-item-detail"><strong>{s.title}</strong><small>{getRoomName(s)}</small></span></button>)}</div>)}</div> : <div className="path-empty"><span className="path-empty-icon"><Compass size={28}/></span><strong>Da dove cominciamo?</strong><p>Clicca su <span className="inline-plus">+</span> nei talk che ti interessano. Li organizzeremo qui, senza conflitti.</p></div>}<button className="path-action" onClick={() => navigate('plan')}>Apri il mio percorso <ArrowRight size={17}/></button><div className="session-storage-note"><Info size={15}/> Percorso e note salvati su questo dispositivo.</div></aside>
        </div>}

        {view === 'plan' && <section className="plan-page"><div className="section-heading"><div><span className="eyebrow">LA TUA SELEZIONE</span><h2>Il mio percorso <span className="heading-spark">✳</span></h2></div><span className="result-count">{selected.length} TALK SELEZIONATI</span></div>
          <div className="plan-controls"><div className="plan-stat-strip"><span><CheckCircle2 size={18}/> Nessuna sovrapposizione</span><span><CalendarDays size={18}/> {selected.filter(s => s.schedule?.date === firstDay).length} il 28 / {selected.filter(s => s.schedule?.date !== firstDay).length} il 29</span></div><div className="plan-tools"><button type="button" className="outline-button" onClick={() => importRef.current?.click()}><Upload size={16}/> Importa JSON</button><input className="hidden-file" type="file" accept="application/json,.json" ref={importRef} onChange={e => handleImport(e.target.files?.[0])}/><button type="button" className="outline-button" onClick={() => exportPlan(plan)}><Download size={16}/> Esporta JSON</button><button type="button" className="outline-button" disabled={!selected.length} onClick={() => exportIcs(plan.selectedIds)}><CalendarDays size={16}/> Calendario .ics</button>{selected.length > 0 && <button type="button" className="outline-button danger-tool" onClick={clearPlan} title="Svuota il percorso"><Trash2 size={16}/></button>}</div></div>
          {selected.length ? <div className="planned-days">{catalog.event.dates.map((d, index) => <section className="planned-day" key={d}><div className="planned-day-head"><span className="day-round">0{index + 1}</span><div><span className="eyebrow">GIORNATA {index + 1}</span><h3>{DATE_LABEL[d]}</h3></div><span className="planned-day-count">{selected.filter(s => s.schedule?.date === d).length} TALK</span></div><div className="planned-list">{selected.filter(s => s.schedule?.date === d).length === 0 ? <div className="planned-empty">Nessun talk selezionato per questa giornata. <button onClick={() => {setDay(d); navigate('agenda');}}>Esplora il programma <ArrowRight size={14}/></button></div> : selected.filter(s => s.schedule?.date === d).map(s => <div className="planned-card" key={s.id}><div className="planned-card-time"><strong>{getTime(s)}</strong><span>{getEndTime(s)}</span></div><div className="planned-card-main"><span className="room-name"><span className="room-dot"/>{getRoomName(s)}</span><button onClick={() => setDetailId(s.id)} className="planned-card-title">{s.title}</button><span className="planned-speakers"><Mic2 size={14}/>{getSpeakerNames(s)}</span></div><div className="planned-card-actions"><button className="icon-button" onClick={() => setDetailId(s.id)} title="Dettagli" aria-label="Dettagli"><ArrowUpRight size={18}/></button><button className="icon-button" onClick={() => selectSession(s)} title="Rimuovi" aria-label="Rimuovi dal percorso"><X size={18}/></button></div></div>)}</div></section>)}</div> : <EmptyState title="Il percorso ti aspetta" description="L'agenda è pronta. Esplora le sessioni e scegli cosa seguire: i talk selezionati appariranno qui, ordinati per ora e giornata."><button className="btn-primary" onClick={() => navigate('agenda')}>Esplora l'agenda <ArrowRight size={16}/></button></EmptyState>}
          <div className="privacy-note"><Info size={16}/><span>Le tue scelte non sono incluse nei dati statici e non vengono inviate a un server. Restano nel localStorage di questo dispositivo anche dopo la chiusura del browser, finché non cancelli i dati del sito. Esporta il JSON per un backup o per trasferire il percorso su un altro dispositivo.</span></div>
        </section>}

        {view === 'speakers' && <section className="speaker-page"><div className="section-heading"><div><span className="eyebrow">LE VOCI DELLA CONFERENZA</span><h2>Tutti gli speaker <span className="heading-spark">✳</span></h2></div><span className="result-count">{speakerMatches.length} SPEAKER</span></div><div className="speaker-toolbar"><label className="search-wrap"><Search size={18}/><input placeholder="Cerca uno speaker o il suo talk..." aria-label="Cerca speaker" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Cancella ricerca" title="Cancella" onClick={() => setSearch('')}><X size={16}/></button>}</label></div>{speakerMatches.length ? <div className="speaker-grid">{speakerMatches.map(s => <article className="speaker-card" key={s.id}><SpeakerAvatar speaker={s} size="lg"/><div className="speaker-card-bio"><h3>{s.name}</h3><p className="speaker-affiliation">{s.role || 'Profilo non ancora disponibile'}</p><p className="speaker-excerpt">{s.biography || 'Le informazioni biografiche non sono presenti nel materiale originale.'}</p><div className="speaker-talks">{s.sessionIds.map(id => {const talk = sessionsById.get(id); return talk ? <button onClick={() => setDetailId(talk.id)} key={id}><Mic2 size={14}/><span>{talk.title}</span><ArrowUpRight size={14}/></button> : null;})}</div></div></article>)}</div> : <EmptyState icon="search" title="Nessuno speaker trovato" description="Prova con un altro nome o una tecnologia."><button className="btn-secondary" onClick={() => setSearch('')}>Azzera ricerca</button></EmptyState>}</section>}
        <footer className="site-footer"><span><span className="footer-mark">C◢</span> Codepath · Un planner indipendente per Codemotion Milano 2026 <a href="https://github.com/alessandroumek/codepath-2026" target="_blank" rel="noopener noreferrer" aria-label="Codice su GitHub (si apre in una nuova scheda)"><Github size={14} aria-hidden="true"/> Codice su GitHub <ExternalLink size={12} aria-hidden="true"/></a></span><span>Programma: snapshot del 15 ottobre 2026 · Abstract ufficiali Sessionize · <a href={catalog.event.sourcePages.speakers} target="_blank" rel="noreferrer">Speaker ufficiali <ExternalLink size={13}/></a></span></footer>
      </div>
    </div>
    <button className="mobile-plan-shortcut" type="button" onClick={() => navigate(view === 'plan' ? 'agenda' : 'plan')} aria-label={view === 'plan' ? "Apri agenda" : 'Apri il mio percorso'}>{view === 'plan' ? <CalendarDays size={20}/> : <Compass size={20}/>}<span>{view === 'plan' ? 'Agenda' : `Percorso (${selected.length})`}</span><ArrowRight size={16}/></button>
    {detailSession && <DetailModal session={detailSession} selected={selectedSet.has(detailSession.id)} saved={savedSet.has(detailSession.id)} rating={plan.ratings[detailSession.id]} note={plan.notes[detailSession.id]} onClose={() => setDetailId(null)} onSelect={selectSession} onSave={saveSession} onRating={setRating} onNote={setNote}/>}
    {pendingConflict && <ConflictModal candidate={pendingConflict.candidate} conflicting={pendingConflict.conflicting} onReplace={replaceConflicting} onCancel={() => setPendingConflict(null)}/>}
    {showInstallHelp && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowInstallHelp(false); }}>
      <section className="conflict-dialog install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
        <button className="icon-button install-guide-close" aria-label="Chiudi" onClick={() => setShowInstallHelp(false)}><X size={19}/></button>
        <h2 id="install-guide-title">Installa Codepath</h2>
        <p>L'app funziona come un'applicazione indipendente e, dopo il primo caricamento online, puoi consultare l'agenda anche offline.</p>
        <div className="install-instructions"><strong>iPhone / iPad (Safari)</strong><span>Apri il menu Condividi e seleziona “Aggiungi alla schermata Home”.</span></div>
        <div className="install-instructions"><strong>Chrome / Edge (desktop e Android)</strong><span>Apri il menu del browser e cerca “Installa app” o “Aggiungi a schermata Home”.</span></div>
        <button className="btn-primary install-dismiss" onClick={() => setShowInstallHelp(false)}>Ho capito <Check size={17}/></button>
      </section>
    </div>}
    {toast && <div className="toast-message" role="status"><Info size={16}/>{toast}<button onClick={() => setToast('')} aria-label="Chiudi notifica"><X size={16}/></button></div>}
  </div>;
}

export default App;
