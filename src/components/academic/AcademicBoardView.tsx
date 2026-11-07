import { useServerClock } from '../useServerClock';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, ArrowUpRight, BellRing, Building2, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Maximize, Minimize, Monitor, Pause, Play, RotateCw, Users, UserMinus, WifiOff } from 'lucide-react';
import type { SystemData } from '../../types/exam';
import type { LiveConnection } from '../../services/examSync';
import { academicOverview, academicStatus, type AcademicRoom } from './academicOverview';
import { invigilatorPath } from '../invigilator/InvigilatorNavigation';
import './academic-board.css';

interface Props {
  data: SystemData;
  liveConnection: LiveConnection;
  lastDataReceivedAt?: string;
  onReconnect: () => void;
  onOpenOperations: () => void;
  onOpenClassroom: (classId: string, periodId?: string) => void;
}
const clock = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const receivedTime = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

function RoomCard({ item, href, onOpen }: { item: AcademicRoom; href: string; onOpen: () => void }) {
  const { room, period, phase } = item;
  const tone = item.urgentIssues ? 'critical' : item.missing ? 'warning' : item.highAbsence ? 'danger' :
    item.openIssues ? 'warning' : phase === 'upcoming' || phase === 'none' ? 'neutral' : 'normal';
  const known = !!period && room.statusReported;
  return <a href={href} className={`academic-room academic-room--${tone}`} aria-label={`進入${room.className}，${academicStatus(item)}`}
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      onOpen();
    }}>
    <div className="academic-room-top">
      <h3 title={room.className}>{room.className}</h3>
      <ArrowUpRight className="academic-room-arrow" size={17} aria-hidden="true" />
    </div>
    <div className="academic-room-context">
      <span className="academic-room-status">{academicStatus(item)}</span>
      {item.openIssues > 0 && <span className="academic-room-issue" title={`今日待處理通報 ${item.openIssues} 件，其中緊急 ${item.urgentIssues} 件`}><BellRing size={13} aria-hidden="true" />{item.openIssues} 件</span>}
    </div>
    <div className="academic-room-exam">
      {period && <span className="academic-room-period-number">第 {item.periodNumber} 節</span>}
      <div>
        <p className="academic-subject" title={period?.subject}>{period?.subject ?? '未安排今日考試'}</p>
        <p className="academic-period">{period ? `${period.startTime}–${period.endTime} · ${phase === 'active' ? '考試中' : phase === 'upcoming' ? '即將開始' : '已結束'}` : '不列入出缺席統計'}</p>
      </div>
    </div>
    <dl className="academic-room-counts">
      <div><dt>應到</dt><dd>{period ? room.expectedCount : '—'}</dd></div>
      <div><dt>實到</dt><dd>{known ? room.presentCount : '—'}</dd></div>
      <div className={known && room.absentCount > 0 ? 'academic-absent' : ''}><dt>缺席</dt><dd>{known ? room.absentCount : '—'}</dd></div>
    </dl>
  </a>;
}

export function AcademicBoardView({ data, liveConnection, lastDataReceivedAt, onReconnect, onOpenOperations, onOpenClassroom }: Props) {
  const now = useServerClock(1000);
  const [projection, setProjection] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState('');
  const [autoRotate, setAutoRotate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [page, setPage] = useState(0);
  const [capacity, setCapacity] = useState(18);
  const boardRef = useRef<HTMLElement>(null);
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const overview = useMemo(() => academicOverview(data, now), [data, now]);
  const { rooms, totals } = overview;
  const [hours, minutes, seconds] = clock.format(now).split(':');
  const examTitle = data.config.examName || '全校考場監看';
  const schoolName = data.config.schoolName || '段考考務即時管理系統';
  const pageCount = projection ? Math.max(1, Math.ceil(rooms.length / capacity)) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRooms = projection ? rooms.slice(currentPage * capacity, (currentPage + 1) * capacity) : rooms;
  const connected = liveConnection === 'connected';

  useEffect(() => {
    const changed = () => {
      const active = document.fullscreenElement === boardRef.current;
      setNativeFullscreen(active);
      if (!active) { setProjection(false); fullscreenButtonRef.current?.focus(); }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (!projection) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        setProjection(false);
        setFullscreenNotice('');
        fullscreenButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [projection]);
  useEffect(() => {
    if (!projection || !gridAreaRef.current) return;
    const area = gridAreaRef.current;
    const resize = () => {
      const style = getComputedStyle(area);
      const gap = parseFloat(style.getPropertyValue('--ab-grid-gap'));
      const width = parseFloat(style.getPropertyValue('--ab-tile-width'));
      const height = parseFloat(style.getPropertyValue('--ab-tile-height'));
      const usableWidth = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const usableHeight = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const columns = Math.max(1, Math.floor((usableWidth + gap) / (width + gap)));
      const rows = Math.max(1, Math.floor((usableHeight + gap) / (height + gap)));
      setCapacity(columns * rows);
      area.style.setProperty('--academic-columns', String(columns));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    resize();
    return () => observer.disconnect();
  }, [projection]);
  useEffect(() => { setPage(0); }, [capacity, projection, overview.today]);
  useEffect(() => {
    if (!projection || !autoRotate || pageCount <= 1) return;
    const timer = window.setInterval(() => setPage((previous) => (previous + 1) % pageCount), 12000);
    return () => window.clearInterval(timer);
  }, [projection, autoRotate, pageCount]);

  async function openClassroom(classId: string, periodId?: string) {
    setFullscreenNotice('');
    if (document.fullscreenElement === boardRef.current) {
      try { await document.exitFullscreen(); } catch { /* leaving this page */ }
    }
    setProjection(false);
    onOpenClassroom(classId, periodId);
  }

  async function toggleFullscreen() {
    setFullscreenNotice('');
    if (projection) {
      if (document.fullscreenElement === boardRef.current) {
        try { await document.exitFullscreen(); } catch { setFullscreenNotice('無法退出全螢幕，請按 Esc。'); }
      } else { setProjection(false); fullscreenButtonRef.current?.focus(); }
      return;
    }
    setPage(0);
    setProjection(true);
    try {
      if (!boardRef.current?.requestFullscreen) throw new Error('unsupported');
      await boardRef.current.requestFullscreen();
    } catch {
      setFullscreenNotice('瀏覽器未允許原生全螢幕，已改用視窗投影模式；按 Esc 或「退出投影」返回。');
    }
  }

  const attention = rooms.filter((item) => item.priority <= 3);
  const metrics = [
    { label: '全校考場', value: totals.total, unit: '場', note: `考試中 ${totals.active} 場`, icon: Building2, tone: 'blue' },
    { label: '已回報', value: totals.reported, unit: `/ ${totals.scheduled} 場`, note: '依各班顯示節次', icon: ClipboardCheck, tone: 'teal' },
    { label: '未回報', value: totals.missing, unit: '場', note: `待確認 ${totals.unknownPeople} 人`, icon: AlertTriangle, tone: totals.missing ? 'amber' : 'slate' },
    { label: '已知實到', value: totals.reported ? totals.present : '—', unit: '人', note: '僅計已回報考場', icon: Users, tone: 'blue' },
    { label: '已知缺席', value: totals.reported ? totals.absent : '—', unit: '人', note: `缺席偏高 ${totals.highAbsence} 場`, icon: UserMinus, tone: totals.highAbsence ? 'rose' : 'slate' }
  ];
  const actions = <div className="academic-actions">
    {!projection && <button type="button" onClick={onOpenOperations}><ArrowLeft size={16} aria-hidden="true" />管理中心</button>}
    <button ref={fullscreenButtonRef} type="button" onClick={toggleFullscreen} aria-pressed={projection} className="academic-primary">
      {projection ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
      {projection ? nativeFullscreen ? '退出全螢幕' : '退出投影' : '全螢幕投影'}
    </button>
  </div>;
  return <section ref={boardRef} className={`academic-board${projection ? ' academic-board--projection' : ''}`} aria-labelledby="academic-board-title">
    <header className="academic-header">
      <div className="academic-toolbar">
        <div className="academic-brand">
          <span className="academic-brand-icon"><Monitor size={17} aria-hidden="true" /></span>
          <strong>教務處總覽看板</strong>
          <span className="academic-mode">{projection ? '投影模式' : '即時監看'}</span>
        </div>
        {actions}
      </div>
      <div className="academic-masthead">
        <div className="academic-exam">
          <p className={`academic-exam-state${totals.active ? ' academic-exam-active' : ''}`}>
            {totals.active ? `考試進行中 · ${totals.active} 場` : '目前非考試時段'}
          </p>
          <h1 id="academic-board-title">{examTitle}</h1>
          <p className="academic-exam-detail">{schoolName}</p>
        </div>
        <div className="academic-clock">
          <p className="academic-kicker"><Clock size={15} aria-hidden="true" />台灣時間 <time dateTime={overview.today}>{overview.today}</time></p>
          <time dateTime={now.toISOString()} className="academic-clock-time">{hours}:{minutes}<span>:{seconds}</span></time>
        </div>
      </div>
    </header>
    {!connected && <div className="academic-connection academic-connection--lost" role="status">
      <WifiOff size={22} aria-hidden="true" />
      <div><strong>{liveConnection === 'offline' ? '網路離線 · 資料暫停更新' : liveConnection === 'connecting' ? '正在建立即時連線 · 資料尚未確認' : '同步連線中斷 · 正在重連'}</strong>
        <span>目前顯示上次資料：{lastDataReceivedAt ? `${receivedTime.format(new Date(lastDataReceivedAt))}（台北時間）` : '尚無接收紀錄'}；請勿將舊資料視為即時結果。</span></div>
      <button type="button" onClick={onReconnect}><RotateCw size={17} aria-hidden="true" />重新連線</button>
    </div>}
    {fullscreenNotice && <p className="academic-fullscreen-notice" role="status">{fullscreenNotice}</p>}
    <div className="academic-layout">
      <dl className="academic-metrics">
        {metrics.map(({ label, value, unit, note, icon: Icon, tone }) => (
          <div key={label} className={`academic-metric academic-metric--${tone}`}>
            <dt><Icon size={16} aria-hidden="true" />{label}</dt>
            <dd>{value}<small>{unit}</small></dd>
            <dd className="academic-metric-note">{note}</dd>
          </div>
        ))}
      </dl>
      <div className="academic-workspace">
        <aside className={`academic-attention${attention.length ? ' academic-attention--active' : ''}`} aria-labelledby="academic-attention-title">
          <h2 id="academic-attention-title"><AlertTriangle size={19} aria-hidden="true" />優先關注 <strong>{attention.length} 場</strong></h2>
          <div className="academic-attention-totals">
            <span>今日緊急 <b>{totals.urgent}</b> 場</span><span>待處理 <b>{totals.openIssues}</b> 件</span>
          </div>
          {!projection && (attention.length ? <>
            <ul className="academic-attention-list">
              {attention.slice(0, 5).map((item) => <li key={item.room.classId}><strong>{item.room.className}</strong><span>{academicStatus(item)}</span></li>)}
            </ul>
            {attention.length > 5 && <p className="academic-attention-note">另有 {attention.length - 5} 場列於考場一覽。</p>}
          </> : <p className="academic-attention-note">目前無待關注異常。</p>)}
        </aside>
        <section className="academic-rooms" aria-labelledby="academic-rooms-title">
          <div className="academic-section-title">
            <div>
              <h2 id="academic-rooms-title"><Activity size={19} aria-hidden="true" />全校考場一覽</h2>
              <p>優先顯示緊急通報、未回報及缺席偏高考場</p>
            </div>
            <ul className="academic-legend" aria-label="考場狀態顏色分級">
              <li className="academic-legend-item academic-legend-item--normal">已回報</li>
              <li className="academic-legend-item academic-legend-item--warning">待處理</li>
              <li className="academic-legend-item academic-legend-item--danger">缺席偏高</li>
              <li className="academic-legend-item academic-legend-item--critical">緊急通報</li>
            </ul>
          </div>
          <div ref={gridAreaRef} className="academic-grid-area" tabIndex={projection ? 0 : undefined} aria-label="全校考場卡片">
            {rooms.length ? <div className="academic-grid">{visibleRooms.map((item) => <RoomCard key={item.room.classId} item={item} href={invigilatorPath('attendance', item.room.classId)} onOpen={() => { void openClassroom(item.room.classId, item.period?.id); }} />)}</div>
              : <div className="academic-empty"><Monitor size={32} aria-hidden="true" /><h3>尚未建立考場</h3><p>請先到管理中心設定班級與考程，完成後會自動顯示於此。</p></div>}
          </div>
        </section>
      </div>
    </div>
    <footer className="academic-footer">
      {projection ? <div className="academic-pager">
        <div className="academic-page-controls">
          <button type="button" aria-label="上一頁考場" disabled={pageCount <= 1} onClick={() => setPage((currentPage - 1 + pageCount) % pageCount)}><ChevronLeft size={20} aria-hidden="true" /></button>
          <strong>第 {currentPage + 1} / {pageCount} 頁</strong>
          <button type="button" aria-label="下一頁考場" disabled={pageCount <= 1} onClick={() => setPage((currentPage + 1) % pageCount)}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <button type="button" aria-pressed={autoRotate && pageCount > 1} disabled={pageCount <= 1} onClick={() => setAutoRotate((value) => !value)}>
          {autoRotate && pageCount > 1 ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          {pageCount <= 1 ? '同頁顯示' : autoRotate ? '暫停輪播' : '開始輪播'}
        </button>
      </div> : <p>節次依各班考程顯示：進行中、今日下一節或今日最後一節。缺席偏高為 3 人以上或達應到人數 10%。</p>}
    </footer>
  </section>;
}
