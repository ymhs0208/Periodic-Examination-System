import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Maximize, Minimize, Monitor, Pause, Play, RotateCw, Wifi, WifiOff } from 'lucide-react';
import type { SystemData } from '../../types/exam';
import type { LiveConnection } from '../../services/examSync';
import { academicOverview, academicStatus, type AcademicRoom } from './academicOverview';
import './academic-board.css';

interface Props {
  data: SystemData;
  liveConnection: LiveConnection;
  lastDataReceivedAt?: string;
  onReconnect: () => void;
  onOpenOperations: () => void;
}
const clock = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const receivedTime = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

function RoomCard({ item }: { item: AcademicRoom }) {
  const { room, period, phase } = item;
  const tone = item.urgentIssues ? 'critical' : item.missing ? 'warning' : item.highAbsence ? 'danger' : item.openIssues ? 'warning' : 'normal';
  const known = !!period && room.statusReported;
  return <article className={`academic-room academic-room--${tone}`} aria-label={`${room.className}，${academicStatus(item)}`}>
    <div className="academic-room-top">
      <h3 title={room.className}>{room.className}</h3>
      <span className="academic-room-status">{tone !== 'normal' && <AlertTriangle size={15} aria-hidden="true" />}{academicStatus(item)}</span>
    </div>
    <p className="academic-subject" title={period?.subject}>{period ? <><span>第 {item.periodNumber} 節</span> {period.subject}</> : '—'}</p>
    <p className="academic-period">{period ? `${period.startTime}–${period.endTime} · ${phase === 'active' ? '考試中' : phase === 'upcoming' ? '即將開始' : '本日最後一節已結束'}` : '不列入出缺席統計'}</p>
    <dl className="academic-room-counts">
      <div><dt>應到</dt><dd>{period ? room.expectedCount : '—'}</dd></div>
      <div><dt>實到</dt><dd>{known ? room.presentCount : '—'}</dd></div>
      <div className={known && room.absentCount > 0 ? 'academic-absent' : ''}><dt>缺席</dt><dd>{known ? room.absentCount : '—'}</dd></div>
    </dl>
    {item.openIssues > 0 && <p className="academic-room-issue">今日通報待處理 {item.openIssues} 件{item.urgentIssues > 0 ? `（緊急 ${item.urgentIssues} 件）` : ''}</p>}
  </article>;
}

export function AcademicBoardView({ data, liveConnection, lastDataReceivedAt, onReconnect, onOpenOperations }: Props) {
  const [now, setNow] = useState(() => new Date());
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
  const pageCount = projection ? Math.max(1, Math.ceil(rooms.length / capacity)) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRooms = projection ? rooms.slice(currentPage * capacity, (currentPage + 1) * capacity) : rooms;
  const connected = liveConnection === 'connected';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const changed = () => {
      const active = document.fullscreenElement === boardRef.current;
      setNativeFullscreen(active);
      if (!active) { setProjection(false); fullscreenButtonRef.current?.focus(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        setProjection(false); setFullscreenNotice(''); fullscreenButtonRef.current?.focus();
      }
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('fullscreenchange', changed); window.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    if (!projection) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [projection]);
  useEffect(() => {
    if (!projection || !gridAreaRef.current) return;
    const area = gridAreaRef.current;
    const resize = () => {
      const columns = Math.max(1, Math.floor((area.clientWidth + 12) / 244));
      const rows = Math.max(1, Math.floor((area.clientHeight + 12) / 264));
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
  return <section ref={boardRef} className={`academic-board${projection ? ' academic-board--projection' : ''}`} aria-labelledby="academic-board-title">
    <header className="academic-header">
      <div className="academic-brand"><span className="academic-brand-icon"><Monitor aria-hidden="true" /></span><div>
        <p>{data.config.schoolName || '段考考務即時管理系統'} · {data.config.examName || '全校考場監看'}</p>
        <h1 id="academic-board-title">教務處總覽看板</h1>
      </div></div>
      <div className="academic-header-right"><div className="academic-clock"><strong>{clock.format(now)}</strong><span>{overview.today} · 台北時間</span></div>
        <div className="academic-actions">
          {!projection && <button type="button" onClick={onOpenOperations}><ArrowLeft size={16} aria-hidden="true" />管理中心</button>}
          <button ref={fullscreenButtonRef} type="button" onClick={toggleFullscreen} aria-pressed={projection}>
            {projection ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
            {projection ? nativeFullscreen ? '退出全螢幕' : '退出投影' : '全螢幕投影'}
          </button>
        </div>
      </div>
    </header>
    <div className={`academic-connection ${connected ? '' : 'academic-connection--lost'}`} role="status">
      {connected ? <Wifi size={20} aria-hidden="true" /> : <WifiOff size={22} aria-hidden="true" />}
      <div><strong>{connected ? '即時連線正常' : liveConnection === 'offline' ? '網路離線 · 資料暫停更新' : liveConnection === 'connecting' ? '正在建立即時連線 · 資料尚未確認' : '同步連線中斷 · 正在重連'}</strong>
        <span>{connected ? '收到資料：' : '目前顯示上次資料：'}{lastDataReceivedAt ? `${receivedTime.format(new Date(lastDataReceivedAt))}（台北時間）` : '尚無接收紀錄'}{!connected && '；請勿將舊資料視為即時結果。'}</span></div>
      {!connected && <button type="button" onClick={onReconnect}><RotateCw size={17} aria-hidden="true" />重新連線</button>}
    </div>
    {fullscreenNotice && <p className="academic-fullscreen-notice" role="status">{fullscreenNotice}</p>}
    <dl className="academic-metrics">
      <div><dt>全校考場</dt><dd>{totals.total}<small>場</small></dd><p>考試中 {totals.active} 場</p></div>
      <div><dt>已回報</dt><dd>{totals.reported}<small>/ {totals.scheduled} 場</small></dd><p>依各班顯示節次</p></div>
      <div><dt>已知實到</dt><dd>{totals.reported ? totals.present : '—'}<small>人</small></dd><p>僅統計已回報考場</p></div>
      <div className="academic-metric-absent"><dt>已知缺席</dt><dd>{totals.reported ? totals.absent : '—'}<small>人</small></dd><p>缺席偏高 {totals.highAbsence} 場</p></div>
      <div className={totals.missing ? 'academic-metric-warning' : ''}><dt>未回報</dt><dd>{totals.missing}<small>場</small></dd><p>待確認 {totals.unknownPeople} 人</p></div>
    </dl>
    <div className={`academic-attention${attention.length ? ' academic-attention--active' : ''}`}>
      <AlertTriangle size={22} aria-hidden="true" />
      <div><strong>{attention.length ? `優先關注 ${attention.length} 場` : '目前無待關注異常'}</strong>
        <span>{attention.length ? attention.slice(0, 5).map((item) => `${item.room.className} ${academicStatus(item)}`).join('　／　') + (attention.length > 5 ? `　另 ${attention.length - 5} 場` : '') : totals.active ? '考場持續監看中' : '目前非考試時段；尚未開始不列為未回報'}</span></div>
      <b>今日緊急 {totals.urgent} 場 · 待處理 {totals.openIssues} 件</b>
    </div>
    <div className="academic-section-title"><h2><Activity size={19} aria-hidden="true" />全校考場一覽</h2><p>緊急通報 → 未回報 → 缺席偏高 → 其他考場</p></div>
    <div ref={gridAreaRef} className="academic-grid-area" tabIndex={0} aria-label="全校考場卡片，可捲動查看">
      {rooms.length ? <div className="academic-grid">{visibleRooms.map((item) => <RoomCard key={item.room.classId} item={item} />)}</div>
        : <div className="academic-empty"><Monitor size={40} aria-hidden="true" /><h2>尚未建立考場</h2><p>請先到管理中心設定班級與考程，完成後會自動顯示於此。</p></div>}
    </div>
    <footer className="academic-footer"><div><p>顯示各班「進行中 → 今日下一節 → 今日最後一節」；節次依各班今日考程排序。</p><p>缺席偏高：≥ 3 人或 ≥ 10%。僅顯示統計，不顯示學生資料。連線狀態為此看板，非各考場裝置。</p></div>
      {projection && pageCount > 1 ? <div className="academic-pager">
        <button type="button" aria-label="上一頁考場" onClick={() => setPage((currentPage - 1 + pageCount) % pageCount)}><ChevronLeft size={22} /></button>
        <strong>第 {currentPage + 1} / {pageCount} 頁 · 全校 {totals.total} 場</strong>
        <button type="button" aria-label="下一頁考場" onClick={() => setPage((currentPage + 1) % pageCount)}><ChevronRight size={22} /></button>
        <button type="button" aria-pressed={autoRotate} onClick={() => setAutoRotate((value) => !value)}>{autoRotate ? <Pause size={17} /> : <Play size={17} />}{autoRotate ? '暫停輪播' : '開始輪播'}</button>
        <span>{autoRotate ? '每 12 秒換頁' : '輪播已暫停'}</span>
      </div> : <span>{projection ? `全校 ${totals.total} 場 · 同頁顯示` : '全校考場直接顯示 · 投影時自動分頁'}</span>}
    </footer>
  </section>;
}
