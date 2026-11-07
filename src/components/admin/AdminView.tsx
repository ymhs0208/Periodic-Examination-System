import { parseDelimited } from '../../services/parseDelimited';
import { validTeacherPassword, MIN_TEACHER_PASSWORD_LENGTH } from '../../types/exam';
import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Building2,
  AlertTriangle,
  CheckCircle2,
  FileEdit,
  Radio,
  Printer,
  Download,
  Send,
  Trash2,
  Search,
  Settings,
  HeartPulse,
  FileText,
  Wrench,
  Check,
  LogOut,
  Maximize2,
  Minimize2,
  LayoutGrid,
  List,
  Upload,
  Plus,
  History,
  UserPlus,
  UserCheck
} from 'lucide-react';
import { examSync } from '../../services/examSync';
import { escapeCSV } from '../../services/csv';
import { countAbsentReasons, OfficialExamReport } from './OfficialExamReport';
import { GradeSettings } from './GradeSettings';
import { ExamScheduleSettings } from './ExamScheduleSettings';
import { ClassroomSettings } from './ClassroomSettings';
import { AdminSettingsNavigation, type AdminSettingsPage } from './AdminSettingsNavigation';
import { AdminAccountsSettings } from './AdminAccountsSettings';
import { AuditLogView } from './AuditLogView';
import { ExamPeriodSelect, useExamClock } from '../ExamPeriodSelect';
import { dataForPeriod, periodLabel, preferredPeriod, reportingPeriods, scheduledExamSubjects, invigilatorForPeriod, examPeriods, periodApplies } from '../../types/examSchedule';
import { InvigilatorAssignments } from './InvigilatorAssignments';
import { CorrectionReview } from '../CorrectionWorkflow';
import { useActionConfirmation } from '../useActionConfirmation';
import { useAnnouncementClock } from '../useAnnouncementClock';
import { announcementDisplayStart, announcementStatus } from '../../types/announcements';
import { availableGrades, classroomGrades, gradeLabel } from '../../types/grades';
import { MAX_EXAM_AUTHOR_ASSIGNMENTS } from '../../types/exam';
import type {
  ExamAuthorAssignment,
  SystemData,
  TeacherAccount,
  TeacherAccountInput,
  IssueStatus,
  AnnouncementType,
  ExamConfig
} from '../../types/exam';

export type AdminTab =
  | 'matrix'
  | 'broadcast'
  | 'issues'
  | 'teachers'
  | 'assign'
  | 'reports'
  | 'logs'
  | 'settings';

interface AdminViewProps {
  data: SystemData;
  onSelectClassroom?: (classId: string, periodId?: string) => void;
  isEmbedded?: boolean;
  onLogout?: () => void;
  loggingOut?: boolean;
  activeAdminTab?: AdminTab;
  onAdminTabChange?: (tab: AdminTab) => void;
  activeSettingsPage?: AdminSettingsPage;
  onSettingsPageChange?: (page?: AdminSettingsPage) => void;
}

const announcementTimeFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei',
  dateStyle: 'short',
  timeStyle: 'short'
});

function parseAnnouncementTime(value: string) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || announcementTimeFormat.format(date) !== value.replace('T', ' ')) return null;
  return date.toISOString();
}

export const AdminView: React.FC<AdminViewProps> = ({
  data: sourceData,
  onSelectClassroom,
  isEmbedded = false,
  onLogout,
  loggingOut,
  activeAdminTab,
  onAdminTabChange,
  activeSettingsPage,
  onSettingsPageChange
}) => {
  const { confirmAction, confirmationDialog } = useActionConfirmation();
  const [internalTab, setInternalTab] = useState<AdminTab>('matrix');
  const activeTab = activeAdminTab || internalTab;
  const now = useExamClock();
  const [requestedPeriodId, setRequestedPeriodId] = useState('');
  const periods = reportingPeriods(sourceData);
  const chosenPeriod = periods.find((item) => item.id === requestedPeriodId);
  const selectedPeriod = chosenPeriod ?? preferredPeriod(periods.filter((item) => item.date), now) ?? periods[0];
  const attendanceData = dataForPeriod(sourceData, selectedPeriod);
  const isAttendanceTab = activeTab === 'matrix' || activeTab === 'reports';
  const data = isAttendanceTab ? attendanceData : sourceData;
  const grades = availableGrades(sourceData.config, sourceData.classrooms);
  const gradeName = (grade: number) => gradeLabel(data.config, grade);
  const validGradeFilter = (value: string) => grades.includes(Number(value)) ? value : 'all';
  const setActiveTab = (tab: AdminTab) => {
    setInternalTab(tab);
    if (onAdminTabChange) {
      onAdminTabChange(tab);
    }
  };

  // Broadcast Form State
  const [targetAudience, setTargetAudience] = useState<string>('all');
  const [annoType, setAnnoType] = useState<AnnouncementType>('correction');
  const [annoSubject, setAnnoSubject] = useState<string>(selectedPeriod?.subject ?? sourceData.config.subject);
  const [annoTitle, setAnnoTitle] = useState<string>('');
  const [annoContent, setAnnoContent] = useState<string>('');
  const [annoStartsAt, setAnnoStartsAt] = useState('');
  const [annoEndsAt, setAnnoEndsAt] = useState('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishSuccess, setPublishSuccess] = useState<boolean>(false);
  const [publishError, setPublishError] = useState('');
  const [withdrawingId, setWithdrawingId] = useState<string>();
  const [withdrawFeedback, setWithdrawFeedback] = useState<{ error: boolean; text: string }>();
  const announcementNow = useAnnouncementClock(data.announcements, activeTab === 'broadcast');

  // Issues Handling State
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    data.issues[0]?.id || null
  );
  const [issueClassFilter, setIssueClassFilter] = useState('');
  const [isReplying, setIsReplying] = useState<boolean>(false);
  const [replyFeedback, setReplyFeedback] = useState<{ issueId: string; error: boolean; text: string }>();

  // Matrix Filter & Fullscreen Zero-Scroll Attendance Wall
  const [requestedGradeFilter, setGradeFilter] = useState('all');
  const gradeFilter = validGradeFilter(requestedGradeFilter);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [matrixDisplayMode, setMatrixDisplayMode] = useState<'grid' | 'table'>('table');
  const [isAttendanceWallFullscreen, setIsAttendanceWallFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAttendanceWallFullscreen) {
        setIsAttendanceWallFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAttendanceWallFullscreen]);

  const [fullscreenNote, setFullscreenNote] = useState('');
  const [wallPage, setWallPage] = useState(0);
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) setIsAttendanceWallFullscreen(false); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => { setWallPage(0); }, [gradeFilter, searchQuery, matrixDisplayMode, selectedPeriod?.id]);
  const toggleAttendanceWallFullscreen = () => {
    const next = !isAttendanceWallFullscreen;
    setIsAttendanceWallFullscreen(next);
    if (next) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => setFullscreenNote('瀏覽器未允許全螢幕，目前為頁內放大模式。'));
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Settings State (Exam Config + Classroom/Invigilator Config)
  const [configForm, setConfigForm] = useState<ExamConfig>(sourceData.config);
  const previousExamConfig = React.useRef(sourceData.config);
  const configDirty = useRef(false);
  const [configConflict, setConfigConflict] = useState(false);
  const updateConfigDraft = (next: ExamConfig) => { configDirty.current = true; setConfigSaved(false); setConfigForm(next); };
  const [configSaved, setConfigSaved] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveError, setConfigSaveError] = useState('');

  // School Teacher Roster & Independent Account Management State
  const teachersList: TeacherAccount[] = data.teachers || [];
  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [teacherAssignFilter, setTeacherAssignFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const teacherSlots = (teacher: TeacherAccount) => sourceData.classrooms.flatMap((room) =>
    examPeriods(sourceData.config).filter((period) => periodApplies(period, room) && invigilatorForPeriod(room, period.id, teachersList)?.id === teacher.id)
      .map((period) => `${room.className} · ${periodLabel(period)}`));
  const hasAssignment = (teacher: TeacherAccount) => teacherSlots(teacher).length > 0;
  const visibleTeachers = teachersList.filter((teacher) =>
    (teacherAssignFilter === 'all' || (teacherAssignFilter === 'assigned') === hasAssignment(teacher)) &&
    (!teacherSearch.trim() || [teacher.name, teacher.username, teacher.department ?? ''].some((value) => value.toLowerCase().includes(teacherSearch.trim().toLowerCase()))));

  // Single Teacher Add/Edit Form
  const teacherDialog = useRef<HTMLDialogElement>(null);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [teacherFormError, setTeacherFormError] = useState('');
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [tchNameForm, setTchNameForm] = useState<string>('');
  const [tchDeptForm, setTchDeptForm] = useState<string>('專任教師');
  const [tchUserForm, setTchUserForm] = useState<string>('');
  const [tchPassForm, setTchPassForm] = useState<string>('');
  const [tchClassForm, setTchClassForm] = useState<string>('');
  const [tchAuthorAssignments, setTchAuthorAssignments] = useState<ExamAuthorAssignment[]>([]);
  const originalAuthorAssignments = useRef<ExamAuthorAssignment[]>([]);
  const examSubjects = scheduledExamSubjects(sourceData.config);
  const authorAssignmentLabel = ({ subject, grade }: ExamAuthorAssignment) => `${subject} · ${gradeLabel(sourceData.config, grade)}`;
  const updateAuthorAssignment = (index: number, changes: Partial<ExamAuthorAssignment>) => {
    setTchAuthorAssignments((current) => current.map((item, row) => row === index ? { ...item, ...changes } : item));
  };
  const [teacherFeedback, setTeacherFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [teacherPending, setTeacherPending] = useState('');
  const teacherFeedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(teacherFeedbackTimer.current), []);

  // Batch Import Teachers State
  const [showBatchImportBox, setShowBatchImportBox] = useState<boolean>(false);
  const [batchImportText, setBatchImportText] = useState<string>('');
  const [batchImportMode, setBatchImportMode] = useState<'merge' | 'replace'>('merge');

  const showTempTeacherMsg = (type: 'ok' | 'err', msg: string) => {
    setTeacherFeedback({ type, msg });
    clearTimeout(teacherFeedbackTimer.current);
    teacherFeedbackTimer.current = type === 'ok' ? setTimeout(() => setTeacherFeedback(null), 5000) : undefined;
  };

  const handleSaveSingleTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTeacher) return;
    setTeacherFormError('');
    if (!tchNameForm.trim() || !tchUserForm.trim() || (!editingTeacherId && !tchPassForm.trim())) {
      setTeacherFormError('請完整填寫教師姓名、獨立登入帳號與登入密碼');
      return;
    }
    if ((!editingTeacherId || tchPassForm.trim()) && !validTeacherPassword(tchPassForm)) {
      setTeacherFormError('新增或重設的密碼須為 12 至 256 字元，且不可過於簡單。');
      return;
    }
    const examAuthorAssignments = tchAuthorAssignments.map((item) => ({ ...item, subject: item.subject.trim() }));
    if (examAuthorAssignments.some((item, index) => !item.subject || !grades.includes(item.grade) ||
      examAuthorAssignments.slice(0, index).some((other) => other.subject === item.subject && other.grade === item.grade))) {
      setTeacherFormError('請填寫每項出題科目與年級，且同一科目與年級只能指派一次');
      return;
    }
    if (examAuthorAssignments.some(({ subject, grade }) => !examSubjects.includes(subject) &&
      !originalAuthorAssignments.current.some((item) => item.subject === subject && item.grade === grade))) {
      setTeacherFormError('新增或變更出題指派時，請選擇目前考程表中的科目');
      return;
    }
    const assignmentsChanged = JSON.stringify(examAuthorAssignments) !== JSON.stringify(originalAuthorAssignments.current);
    const teacher = {
      id: editingTeacherId || undefined,
      name: tchNameForm.trim(),
      department: tchDeptForm.trim() || '專任教師',
      username: tchUserForm.trim(),
      password: tchPassForm.trim(),
      assignedClassId: tchClassForm,
      ...(!editingTeacherId || assignmentsChanged ? {
        examAuthorAssignments,
        expectedExamAuthorAssignments: editingTeacherId ? originalAuthorAssignments.current : undefined
      } : {})
    };
    if (!await confirmAction({
      title: editingTeacherId ? '確認更新教師帳號' : '確認新增教師帳號',
      facts: [
        { label: '教師姓名', value: teacher.name },
        { label: '登入帳號', value: teacher.username },
        { label: '任教科別', value: teacher.department },
        { label: '指派考場', value: teacher.assignedClassId ? getTargetAudienceLabel(teacher.assignedClassId) : '未指派' },
        { label: '出題科目與年級', value: editingTeacherId && !assignmentsChanged ? '沿用現有指派' : examAuthorAssignments.map(authorAssignmentLabel).join('\n') || '未指派' },
        { label: '密碼', value: teacher.password ? '將儲存輸入的密碼' : '沿用現有密碼' }
      ],
      confirmLabel: '確認儲存'
    })) return;
    setSavingTeacher(true);
    try {
      const res = await examSync.saveTeacher(teacher);
      if (!res.success) {
        setTeacherFormError(res.error || '儲存教師資料失敗');
        return;
      }
      showTempTeacherMsg(
        'ok',
        editingTeacherId
          ? `已更新「${tchNameForm.trim()}」的獨立帳號與指派設定`
          : `已新增「${tchNameForm.trim()}」至全校教師名冊`
      );
      teacherDialog.current?.close();
    } catch (error) {
      setTeacherFormError(error instanceof Error ? error.message : '儲存教師資料失敗，請稍後再試。');
    } finally {
      setSavingTeacher(false);
    }
  };

  const openTeacherForm = (teacher?: TeacherAccount) => {
    setEditingTeacherId(teacher?.id ?? null);
    setTchNameForm(teacher?.name ?? '');
    setTchDeptForm(teacher?.department || '專任教師');
    setTchUserForm(teacher?.username ?? '');
    setTchPassForm('');
    setTchClassForm(teacher?.assignedClassId ?? '');
    setTeacherFormError('');
    originalAuthorAssignments.current = teacher?.examAuthorAssignments ?? [];
    setTchAuthorAssignments(originalAuthorAssignments.current);
    teacherDialog.current?.showModal();
  };

  const handleDeleteTeacherAccount = async (teacher: TeacherAccount) => {
    if (teacherPending) return;
    if (!await confirmAction({
      title: '確認移除教師帳號',
      description: '移除後，這個帳號將無法再登入監考端。',
      facts: [
        { label: '教師姓名', value: teacher.name },
        { label: '登入帳號', value: teacher.username }
      ],
      confirmLabel: '確認移除',
      danger: true
    })) return;
    setTeacherPending('正在移除教師帳號…');
    setTeacherFeedback(null);
    try {
      const res = await examSync.deleteTeacher(teacher.id);
      if (!res.success) throw new Error(res.error || '無法移除教師帳號。');
      showTempTeacherMsg('ok', `已從名冊移除「${teacher.name}」`);
      if (editingTeacherId === teacher.id) {
        setEditingTeacherId(null);
      }
    } catch (error) {
      showTempTeacherMsg('err', error instanceof Error ? error.message : '無法移除教師帳號。');
    } finally {
      setTeacherPending('');
    }
  };

  const parseTeacherCSVLines = (rawText: string): TeacherAccountInput[] => {
    const rows = parseDelimited(rawText);
    const parsed: TeacherAccountInput[] = [];
    const seen = new Set<string>();
    rows.forEach((cols, index) => {
      if (!index && (cols[0].includes('姓名') || cols[1]?.toLowerCase().includes('username') || cols[1]?.includes('帳號'))) return;
      const [name, username, password, department, assignedClassId] = cols;
      if (cols.length < 3 || cols.length > 5 || !name || !username || !password) throw new Error(`第 ${index + 1} 列：請填妥姓名、帳號、密碼，並確認為 3–5 欄。`);
      if (seen.has(username)) throw new Error(`第 ${index + 1} 列：帳號 ${username} 重複。`);
      if (assignedClassId && !sourceData.classrooms.some((room) => room.classId === assignedClassId)) throw new Error(`第 ${index + 1} 列：找不到考場 ${assignedClassId}。`);
      seen.add(username); parsed.push({ name, username, password, department: department || '專任教師', assignedClassId: assignedClassId || '' });
    });
    if (parsed.length > 50) throw new Error('每次最多 50 筆；請分批使用合併模式。覆蓋模式不可分批，以免移除先前批次。');
    return parsed;
  };

  const confirmTeacherImport = (parsed: TeacherAccountInput[], fileName?: string) => confirmAction({
    title: '確認匯入教師名冊',
    description: batchImportMode === 'replace'
      ? '現有教師名冊將以這次匯入的資料取代。'
      : '符合相同登入帳號的教師資料將更新。',
    facts: [
      { label: '匯入方式', value: batchImportMode === 'replace' ? '完全取代' : '合併更新' },
      { label: '資料筆數', value: `${parsed.length} 筆（每次上限 50）` },
      { label: '來源', value: fileName ?? '貼上或選檔的文字' },
      { label: '逐列預覽（不顯示密碼）', value: parsed.map((row, i) => `${i + 1}. ${teachersList.some((t) => t.username === row.username) ? '更新' : '新增'}：${row.name}／${row.username}／${row.department}／${row.assignedClassId || '沿用原預設考場或不指派'}`).join('\n') },
      ...(batchImportMode === 'replace' ? [{ label: '覆蓋影響', value: `將移除未列入的 ${teachersList.filter((t) => !parsed.some((r) => r.username === t.username)).length} 位教師；相同帳號保留 ID 與出題／分節監考指派。移除仍有指派者會被阻擋。所有匯入帳號密碼會更新。` }] : [])
    ],
    confirmLabel: '確認匯入',
    danger: batchImportMode === 'replace'
  });

  const importTeacherText = async (text: string, fileName?: string) => {
    let parsed: TeacherAccountInput[];
    try { parsed = parseTeacherCSVLines(text); } catch (error) { showTempTeacherMsg('err', error instanceof Error ? error.message : '名單格式錯誤'); return; }
    if (parsed.length === 0) {
      showTempTeacherMsg('err', '未解析到有效資料，請確認格式為：教師姓名,登入帳號,登入密碼,科別,指派班級(選填)');
      return;
    }
    if (parsed.some(teacher => !validTeacherPassword(teacher.password))) {
      showTempTeacherMsg('err', '每位教師的密碼須為 12 至 256 字元，且不可過於簡單；請檢查後重新匯入。');
      return;
    }
    if (!await confirmTeacherImport(parsed, fileName)) return;
    setTeacherPending(`正在匯入 ${parsed.length} 位教師帳號…`);
    setTeacherFeedback(null);
    try {
      const res = await examSync.importTeachers(parsed, batchImportMode);
      if (!res.success) throw new Error(res.error || '無法匯入教師名冊。');
      showTempTeacherMsg('ok', `已匯入 ${parsed.length} 位教師帳號。`);
      if (!fileName) {
        setBatchImportText('');
        setShowBatchImportBox(false);
      }
    } catch (error) {
      showTempTeacherMsg('err', error instanceof Error ? error.message : '無法匯入教師名冊。');
    } finally {
      setTeacherPending('');
    }
  };

  const handleFileUploadImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || teacherPending) return;
    setTeacherPending('正在讀取教師名冊檔案…');
    setTeacherFeedback(null);
    try {
      const text = await file.text();
      setTeacherPending('');
      setBatchImportText(text); setShowBatchImportBox(true);
      showTempTeacherMsg('ok', `已讀取 ${file.name}，請確認模式，再按預覽並匯入。`);
    } catch {
      showTempTeacherMsg('err', '讀取檔案失敗，請確認為 UTF-8 編碼之 CSV 或 TXT 檔');
    } finally {
      e.target.value = '';
      setTeacherPending('');
    }
  };

  const downloadTeacherTemplateCSV = () => {
    const csvContent = '\uFEFF教師姓名,獨立登入帳號,獨立登入密碼,任教科別,指派班級代號(選填)\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '全校監考教師獨立帳號匯入範本.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCurrentTeachersCSV = () => {
    const header = '教師姓名,獨立登入帳號,任教科別,目前指派考場代號';
    const rows = teachersList.map((teacher) =>
      [teacher.name, teacher.username, teacher.department || '專任教師', teacher.assignedClassId]
        .map(escapeCSV).join(','));
    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `全校監考教師與指派清冊_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  React.useEffect(() => {
    const { gradeLabels: _previousLabels, periods: _previousPeriods, ...previous } = previousExamConfig.current;
    const { gradeLabels: _currentLabels, periods: _currentPeriods, ...current } = sourceData.config;
    previousExamConfig.current = sourceData.config;
    if (JSON.stringify(previous) !== JSON.stringify(current)) {
      if (configDirty.current) { setConfigConflict(true); setConfigSaved(false); }
      else setConfigForm(current);
    }
  }, [sourceData.config]);

  // KPIs
  const totalClassrooms = data.classrooms.length;
  const issueClassroomIds = new Set(data.issues.filter((i) => i.status !== 'resolved').map((i) => i.classId));
  const abnormalCount = issueClassroomIds.size;
  const normalCount = Math.max(0, totalClassrooms - abnormalCount);
  const totalAbsent = attendanceData.classrooms.reduce((acc, c) => acc + (c.absentCount || 0), 0);
  const pendingIssuesCount = data.issues.filter((i) => i.status !== 'resolved').length;

  // Filtered Classrooms for Matrix
  const filteredClassrooms = data.classrooms.filter((c) => {
    if (gradeFilter !== 'all' && c.grade.toString() !== gradeFilter) return false;
    if (searchQuery && !c.className.includes(searchQuery) && !c.invigilator.includes(searchQuery)) return false;
    return true;
  });

  // Publish Announcement
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annoTitle.trim() || !annoContent.trim() || isPublishing) return;
    setPublishError('');
    setPublishSuccess(false);
    const startsAt = parseAnnouncementTime(annoStartsAt);
    const endsAt = parseAnnouncementTime(annoEndsAt);
    const now = Date.now();
    if (startsAt === null || endsAt === null) {
      setPublishError('請輸入有效的顯示日期和時間。');
      return;
    }
    if (endsAt && Date.parse(endsAt) <= Math.max(now, startsAt ? Date.parse(startsAt) : now)) {
      setPublishError('結束顯示時間須晚於開始顯示時間及現在時間。');
      return;
    }
    const announcement = {
      type: annoType,
      subject: annoSubject,
      targetAudience,
      title: annoTitle.trim(),
      content: annoContent.trim(),
      startsAt,
      endsAt,
      priority: annoType === 'correction' ? 'critical' : 'normal',
      publishedBy: '教務處 試務中心'
    };
    if (!await confirmAction({
      title: '確認發布考務公告',
      description: '考科僅為標籤，不限制接收對象；時間延長僅發布通知，不會修改考程。需延後結束時間時，請至考務設定 → 考程調整。',
      facts: [
        { label: '發布對象', value: `${getTargetAudienceLabel(announcement.targetAudience)}（${sourceData.classrooms.filter((room) => announcement.targetAudience === 'all' || announcement.targetAudience === room.classId || announcement.targetAudience === `grade_${room.grade}`).map((room) => room.className).join('、') || '無符合班級'}）` },
        { label: '考科', value: announcement.subject || '未指定' },
        { label: '公告類型', value: { correction: '試題更正', extension: '時間延長', notice: '一般提醒', emergency: '緊急公告' }[announcement.type] },
        { label: '公告標題', value: announcement.title },
        { label: '公告內容', value: announcement.content },
        { label: '開始顯示（台灣時間）', value: startsAt ? announcementTimeFormat.format(new Date(startsAt)) : '發布後立即顯示' },
        { label: '結束顯示（台灣時間）', value: endsAt ? announcementTimeFormat.format(new Date(endsAt)) : '直到手動撤回' }
      ],
      confirmLabel: '確認發布'
    })) return;

    setIsPublishing(true);
    try {
      await examSync.publishAnnouncement(announcement);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : '儲存公告失敗，請稍後再試。');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const announcement = data.announcements.find((item) => item.id === id);
    if (!announcement || withdrawingId || !await confirmAction({
      title: '確認撤回考務公告',
      description: '撤回後將不再顯示於接收端。若內容有誤，可先複製為新公告修正，再撤回舊公告。',
      facts: [
        { label: '公告標題', value: announcement.title },
        { label: '發布對象', value: `${getTargetAudienceLabel(announcement.targetAudience)}（${sourceData.classrooms.filter((room) => announcement.targetAudience === 'all' || announcement.targetAudience === room.classId || announcement.targetAudience === `grade_${room.grade}`).map((room) => room.className).join('、') || '無符合班級'}）` }
      ],
      confirmLabel: '確認撤回',
      danger: true
    })) return;
    setWithdrawingId(id);
    setWithdrawFeedback(undefined);
    try {
      await examSync.deleteAnnouncement(id);
      setWithdrawFeedback({ error: false, text: '公告已撤回。' });
    } catch (error) {
      setWithdrawFeedback({ error: true, text: error instanceof Error ? error.message : '無法撤回公告。' });
    } finally {
      setWithdrawingId(undefined);
    }
  };

  // Reply to Issue with quick action buttons
  const handleQuickDispatch = async (issueId: string, replyMessage: string, status: IssueStatus) => {
    const issue = data.issues.find((item) => item.id === issueId);
    if (!issue || isReplying || !await confirmAction({
      title: status === 'resolved' ? '確認結案' : '確認回覆考場通報',
      description: '此操作只記錄處理狀態並回覆監考老師，不會自動聯絡或派遣支援人員。請確認已完成實際聯繫。',
      facts: [
        { label: '考場', value: issue.className },
        { label: '通報內容', value: issue.content },
        { label: '回覆內容', value: replyMessage }
      ],
      confirmLabel: status === 'resolved' ? '確認結案' : '確認回覆'
    })) return;
    setIsReplying(true);
    setReplyFeedback(undefined);
    try {
      await examSync.updateIssue(issueId, {
        status,
        reply: replyMessage,
        repliedBy: '教務處 試務中心'
      });
      setReplyFeedback({ issueId, error: false, text: status === 'resolved' ? '考場通報已結案。' : '考場通報已回覆。' });
    } catch (error) {
      setReplyFeedback({ issueId, error: true, text: error instanceof Error ? error.message : '無法更新考場通報。' });
    } finally {
      setIsReplying(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingConfig) return;
    if (configConflict) { setConfigSaveError('基本資料已有遠端變更，請先重新載入並核對再儲存。'); return; }
    setSavingConfig(true);
    setConfigSaved(false);
    setConfigSaveError('');
    try {
      await examSync.updateConfig({
        schoolName: configForm.schoolName,
        academicYear: configForm.academicYear,
        examName: configForm.examName,
        rulesNotes: configForm.rulesNotes.map((rule) => rule.trim()).filter(Boolean)
      });
      configDirty.current = false; setConfigConflict(false);
      setConfigSaved(true);
    } catch (error) {
      setConfigSaveError(error instanceof Error ? error.message : '無法儲存考務設定。');
    } finally {
      setSavingConfig(false);
    }
  };

  // Report View Filter State
  const [requestedReportGradeFilter, setReportGradeFilter] = useState('all');
  const reportGradeFilter = validGradeFilter(requestedReportGradeFilter);
  const [reportOnlyAbsent, setReportOnlyAbsent] = useState<boolean>(false);

  const getTargetAudienceLabel = (target: string) => {
    if (target === 'all') return '全校所有考場';
    const grade = /^grade_(\d+)$/.exec(target);
    if (grade) return `${gradeName(Number(grade[1]))}全體考場`;
    const cls = sourceData.classrooms.find((c) => c.classId === target);
    return cls ? `${cls.classId} ${cls.className}` : target;
  };

  const getIssueCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'medical':
        return '考生突發傷病';
      case 'facility':
      case 'equipment':
        return '考場設備異常';
      case 'paper':
        return '試卷印刷/補發';
      case 'violation':
      case 'cheating':
        return '考場違規紀錄';
      case 'urgent':
        return '緊急考務支援';
      default:
        return '一般考務通報';
    }
  };

  // Report filtered classrooms & grade summaries
  const sortedClassrooms = [...attendanceData.classrooms].sort((a, b) =>
    a.classId.localeCompare(b.classId, 'zh-Hant-TW', { numeric: true })
  );

  const reportFilteredClassrooms = sortedClassrooms.filter((c) => {
    if (reportGradeFilter !== 'all' && String(c.grade) !== reportGradeFilter) return false;
    if (reportOnlyAbsent && (c.absentCount || 0) === 0) return false;
    return true;
  });

  const buildGradeStatRow = (label: string, list: typeof data.classrooms) => {
    const classCount = list.length;
    const reportedList = list.filter((c) => c.statusReported);
    const reportedCount = reportedList.length;
    const expected = list.reduce((acc, c) => acc + (c.expectedCount || 0), 0);
    const present = reportedList.reduce((acc, c) => acc + (c.presentCount || 0), 0);
    const absent = reportedList.reduce((acc, c) => acc + (c.absentCount || 0), 0);
    let sick = 0;
    let personal = 0;
    let official = 0;
    let bereavement = 0;
    let other = 0;
    reportedList.forEach((c) => {
      const counts = countAbsentReasons(c.absentStudents || []);
      sick += counts.sick;
      personal += counts.personal;
      official += counts.official;
      bereavement += counts.bereavement;
      other += counts.other;
    });
    const reportedExpected = list.filter((c) => c.statusReported).reduce((sum, c) => sum + c.expectedCount, 0);
    const rate = reportedExpected > 0 ? ((present / reportedExpected) * 100).toFixed(2) : '—';
    return {
      label,
      classCount,
      reportedCount,
      unreportedCount: Math.max(0, classCount - reportedCount),
      expected,
      present,
      absent,
      sick,
      personal,
      official,
      bereavement,
      other,
      rate
    };
  };

  const gradeSummaryRows = classroomGrades(sortedClassrooms).map((grade) =>
    buildGradeStatRow(gradeName(grade), sortedClassrooms.filter((room) => room.grade === grade))
  );

  const totalSummaryRow = buildGradeStatRow('全校總計', sortedClassrooms);

  const exportAttendanceCSV = () => {
    const nowStr = new Date().toLocaleString('zh-TW', { hour12: false });
    const examDateStr = attendanceData.config.examDate;
    const serialNo = `EXAM-${examDateStr.replace(/-/g, '')}-${attendanceData.config.subject}`;

    const lines: string[] = [];

    // ═══════════════════════════════════════════════════════════════════════
    // 【壹、段考考務出缺席總報表 — 表頭與基本考務資訊】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV(`${attendanceData.config.schoolName} — 段考考務出缺席暨試務狀況總報表（教務處備查聯）`)].join(','));
    lines.push(
      [
        escapeCSV('報表編號'),
        escapeCSV(serialNo),
        escapeCSV('段考名稱'),
        escapeCSV(attendanceData.config.examName),
        escapeCSV('考試科目'),
        escapeCSV(attendanceData.config.subject),
        escapeCSV('製表時間'),
        escapeCSV(nowStr)
      ].join(',')
    );
    lines.push(
      [
        escapeCSV('考試日期'),
        escapeCSV(examDateStr),
        escapeCSV('考試時段'),
        escapeCSV(`${attendanceData.config.startTime} - ${attendanceData.config.endTime} (${attendanceData.config.durationMinutes}分鐘)`),
        escapeCSV('清點完成進度'),
        escapeCSV(`已回報 ${totalSummaryRow.reportedCount} / ${totalSummaryRow.classCount} 班`),
        escapeCSV('已回報到考率（僅已回報班級應到為分母）'),
        escapeCSV(totalSummaryRow.rate === '—' ? '—' : `${totalSummaryRow.rate}%`)
      ].join(',')
    );
    lines.push([escapeCSV(`明細／缺席清冊範圍：${reportGradeFilter === 'all' ? '全年級' : gradeName(Number(reportGradeFilter))}；${reportOnlyAbsent ? '僅有缺席考場' : '全部考場'}；回報覆蓋率 ${totalSummaryRow.reportedCount}/${totalSummaryRow.classCount} 班；彙總仍為全校。`)].join(','));
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【貳、全校暨各年級出缺席與假別統計彙整表】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【貳、全校暨各年級出缺席與假別統計彙整表】')].join(','));
    lines.push(
      [
        '年級別',
        '考場班數',
        '已清點班數',
        '待回報班數',
        '應到總人數',
        '實到總人數',
        '缺席總人數',
        '病假人數',
        '事假人數',
        '公假人數',
        '喪假人數',
        '其他/曠課人數',
        '已回報到考率(%)'
      ]
        .map(escapeCSV)
        .join(',')
    );

    [...gradeSummaryRows, totalSummaryRow].forEach((r) => {
      lines.push(
        [
          r.label,
          r.classCount,
          r.reportedCount,
          r.unreportedCount,
          r.expected,
          r.present,
          r.absent,
          r.sick,
          r.personal,
          r.official,
          r.bereavement,
          r.other,
          r.rate === '—' ? '—' : `${r.rate}%`
        ]
          .map(escapeCSV)
          .join(',')
      );
    });
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【參、各考場（班級）出缺席暨監考清點明細總表】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【參、各考場（班級）出缺席暨監考清點明細總表】')].join(','));
    lines.push(
      [
        '序號',
        '年級',
        '班級代碼',
        '考場班級名稱',
        '監考教師',
        '監考帳號',
        '應到人數',
        '實到人數',
        '缺席人數',
        '已回報到考率(%)',
        '病假',
        '事假',
        '公假',
        '喪假',
        '其他/曠課',
        '缺席考生完整明細(座號/姓名/假別)',
        '點名清點狀態',
        '考場異常通報狀態',
        '最後回報時間',
        '監考教師簽章/備註'
      ]
        .map(escapeCSV)
        .join(',')
    );

    reportFilteredClassrooms.forEach((c, idx) => {
      const absentList = c.absentStudents || [];
      const counts = countAbsentReasons(absentList);
      const absentDetailStr =
        !c.statusReported ? '待點名' : absentList.length > 0
          ? absentList
              .map((s) => `${String(s.seatNo).padStart(2, '0')}號 ${s.name || '考生'}(${s.reason || '缺考'})`)
              .join('；')
          : '全班到齊（無缺席）';
      const classRate =
        c.statusReported && c.expectedCount > 0 ? ((c.presentCount / c.expectedCount) * 100).toFixed(2) : '—';
      const classIssues = data.issues.filter((i) => i.classId === c.classId);
      const hasUnresolved = classIssues.some((i) => i.status !== 'resolved');
      const issueStatusLabel =
        classIssues.length === 0
          ? '考場正常'
          : hasUnresolved
          ? `異常待處理(${classIssues.filter((i) => i.status !== 'resolved').length}件)`
          : `異常已結案(${classIssues.length}件)`;
      const matchedTch = teachersList.find(
        (t) => t.assignedClassId === c.classId || t.name === c.invigilator
      );

      lines.push(
        [
          idx + 1,
          gradeName(c.grade),
          c.classId,
          c.className,
          c.invigilator,
          matchedTch?.username || c.invigilatorUsername || '',
          c.expectedCount,
          c.statusReported ? c.presentCount : '—',
          c.statusReported ? c.absentCount : '—',
          classRate === '—' ? '—' : `${classRate}%`,
          counts.sick,
          counts.personal,
          counts.official,
          counts.bereavement,
          counts.other,
          absentDetailStr,
          c.statusReported ? '已完成清點' : '尚未回報',
          issueStatusLabel,
          c.lastUpdated || '—',
          ''
        ]
          .map(escapeCSV)
          .join(',')
      );
    });
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【肆、全校缺席考生個別備查清冊（供教務處註冊組／學務處核對）】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【肆、全校缺席考生個別備查清冊（供教務處註冊組／學務處生教組核對）】')].join(','));
    lines.push(
      [
        '編號',
        '年級',
        '班級代碼',
        '班級名稱',
        '座號',
        '考生姓名',
        '缺席假別/原因',
        '監考教師',
        '考場清點狀態',
        '回報時間',
        '請假證明/補考資格核對欄'
      ]
        .map(escapeCSV)
        .join(',')
    );

    const allSchoolAbsent = reportFilteredClassrooms.filter((c) => c.statusReported).flatMap((c) =>
      (c.absentStudents || []).map((st) => ({
        grade: c.grade,
        classId: c.classId,
        className: c.className,
        seatNo: st.seatNo,
        name: st.name || `座號${st.seatNo}考生`,
        reason: st.reason || '缺考',
        invigilator: c.invigilator,
        statusReported: c.statusReported ? '已確認' : '待確認',
        lastUpdated: c.lastUpdated
      }))
    );

    if (allSchoolAbsent.length > 0) {
      allSchoolAbsent.forEach((st, idx) => {
        lines.push(
          [
            idx + 1,
            gradeName(st.grade),
            st.classId,
            st.className,
            `${String(st.seatNo).padStart(2, '0')}號`,
            st.name,
            st.reason,
            st.invigilator,
            st.statusReported,
            st.lastUpdated,
            ''
          ]
            .map(escapeCSV)
            .join(',')
        );
      });
    } else {
      lines.push([escapeCSV(totalSummaryRow.unreportedCount ? `目前無已回報缺席紀錄，仍有 ${totalSummaryRow.unreportedCount} 班待回報。` : '目前篩選範圍的已回報考場無缺席紀錄。')].join(','));
    }
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【伍、本節試題更正與考務即時公告紀錄表】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【伍、本節試題更正與考務即時公告紀錄表】')].join(','));
    lines.push(
      ['編號', '公告類型', '發布時間', '科目', '目標考場對象', '公告/更正標題', '詳細內容', '發布單位']
        .map(escapeCSV)
        .join(',')
    );

    if (data.announcements.length > 0) {
      data.announcements.forEach((a, idx) => {
        lines.push(
          [
            idx + 1,
            a.type === 'correction' ? '試題更正' : '考務公告',
            new Date(a.publishedAt).toLocaleString('zh-TW', { hour12: false }),
            a.subject,
            getTargetAudienceLabel(a.targetAudience),
            a.title,
            a.content,
            a.publishedBy
          ]
            .map(escapeCSV)
            .join(',')
        );
      });
    } else {
      lines.push([escapeCSV('本節無任何試題更正或考務公告紀錄。')].join(','));
    }
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【陸、考場異常與突發狀況通報處置紀錄表】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【陸、考場異常與突發狀況通報處置紀錄表】')].join(','));
    lines.push(
      [
        '編號',
        '通報時間',
        '班級代碼',
        '考場班級',
        '通報類別',
        '優先等級',
        '考場狀況描述',
        '處理狀態',
        '教務處處置與回覆',
        '回覆單位'
      ]
        .map(escapeCSV)
        .join(',')
    );

    if (data.issues.length > 0) {
      data.issues.forEach((iss, idx) => {
        lines.push(
          [
            idx + 1,
            new Date(iss.createdAt).toLocaleString('zh-TW', { hour12: false }),
            iss.classId,
            iss.className,
            getIssueCategoryLabel(iss.type),
            iss.isUrgent || iss.type === 'urgent' ? '緊急優先' : '一般通報',
            iss.content,
            iss.status === 'resolved'
              ? '已處理結案'
              : iss.status === 'processing'
              ? '處理中'
              : '待處理',
            iss.reply || '—',
            iss.repliedBy || '—'
          ]
            .map(escapeCSV)
            .join(',')
        );
      });
    } else {
      lines.push([escapeCSV('本節全校各考場秩序良好，無任何異常或突發狀況通報。')].join(','));
    }
    lines.push('');

    // ═══════════════════════════════════════════════════════════════════════
    // 【柒、教務處試務中心核章備查欄】
    // ═══════════════════════════════════════════════════════════════════════
    lines.push([escapeCSV('【柒、教務處試務中心核章備查欄】')].join(','));
    lines.push(
      [
        '試務組長簽章：',
        '',
        '註冊組長簽章：',
        '',
        '教學組長簽章：',
        '',
        '教務主任簽章：',
        '',
        '校長核閱：',
        ''
      ]
        .map(escapeCSV)
        .join(',')
    );

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `段考考務出缺席總報表備查_${examDateStr}_${attendanceData.config.subject}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAbsentRosterCSV = () => {
    const examDateStr = attendanceData.config.examDate;
    const headers = [
      '編號',
      '考試日期',
      '段考名稱',
      '考試科目',
      '考試時段',
      '年級',
      '班級代碼',
      '班級名稱',
      '座號',
      '考生姓名',
      '缺席假別/原因',
      '監考教師',
      '考場清點狀態',
      '回報時間',
      '教務註冊組補考審核',
      '學務處假單核對'
    ]
      .map(escapeCSV)
      .join(',');

    const allSchoolAbsent = reportFilteredClassrooms.filter((c) => c.statusReported).flatMap((c) =>
      (c.absentStudents || []).map((st) => ({
        grade: c.grade,
        classId: c.classId,
        className: c.className,
        seatNo: st.seatNo,
        name: st.name || `座號${st.seatNo}考生`,
        reason: st.reason || '缺考',
        invigilator: c.invigilator,
        statusReported: c.statusReported ? '已完成清點' : '尚未回報',
        lastUpdated: c.lastUpdated || '—'
      }))
    );

    const rows = allSchoolAbsent.map((st, idx) =>
      [
        idx + 1,
        examDateStr,
        attendanceData.config.examName,
        attendanceData.config.subject,
        `${attendanceData.config.startTime}-${attendanceData.config.endTime}`,
        gradeName(st.grade),
        st.classId,
        st.className,
        `${String(st.seatNo).padStart(2, '0')}號`,
        st.name,
        st.reason,
        st.invigilator,
        st.statusReported,
        st.lastUpdated,
        '',
        ''
      ]
        .map(escapeCSV)
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `段考缺席考生個別清冊_${examDateStr}_${attendanceData.config.subject}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sections = [
    { id: 'matrix', label: '考場看板', icon: LayoutGrid, count: totalClassrooms, description: '查看各班點名進度與考場狀況。' },
    { id: 'broadcast', label: '公告與更正', icon: Radio, count: data.correctionProposals?.filter((item) => item.status === 'pending').length || 0, description: '審核試題更正，或撰寫並發布考務公告。' },
    { id: 'issues', label: '考場通報', icon: AlertTriangle, count: pendingIssuesCount, description: '查看待處理的考場狀況及教務回覆。' },
    { id: 'teachers', label: '教師帳號', icon: UserPlus, count: teachersList.length, description: '匯入教師名冊、管理個別登入帳號。' },
    { id: 'assign', label: '監考指派', icon: UserCheck, description: '依年級查看考場並安排監考老師。' },
    { id: 'settings', label: '考務設定', icon: Settings, description: '管理學校、考程、考場與管理員帳號。' },
    { id: 'reports', label: '統計報表', icon: Printer, description: '檢視、匯出或列印考務紀錄。' },
    { id: 'logs', label: '操作紀錄', icon: History, description: '查看登入與主要考務異動。' }
  ] as const;
  const currentSection = sections.find((section) => section.id === activeTab) ?? sections[0];
  const CurrentIcon = currentSection.icon;
  const examDetails = [data.config.examName, data.config.subject, data.config.examDate].filter(Boolean);
  const announcementScheduleFields = (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 pb-3">
      <legend className="px-1 text-sm font-black text-slate-900">顯示時段（台灣時間）</legend>
      <p id="admin-anno-schedule-help" className="text-xs text-slate-700">開始留空會立即顯示，結束留空會顯示至手動撤回。</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-bold text-slate-800">
          開始顯示時間
          <input type="datetime-local" value={annoStartsAt} onChange={(e) => setAnnoStartsAt(e.target.value)}
            aria-describedby="admin-anno-schedule-help"
            className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
        </label>
        <label className="min-w-0 text-xs font-bold text-slate-800">
          結束顯示時間
          <input type="datetime-local" value={annoEndsAt} onChange={(e) => setAnnoEndsAt(e.target.value)}
            aria-describedby="admin-anno-schedule-help"
            className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm" />
        </label>
      </div>
    </fieldset>
  );
  const announcementFeedback = publishError ? (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{publishError}</p>
  ) : publishSuccess ? (
    <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">公告已儲存，將依設定時段顯示。</p>
  ) : null;

  return (
    <div className={`print-report-root ${activeTab === 'reports' ? 'official-report-layout' : ''} flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${isEmbedded ? 'xl:h-[820px] xl:overflow-y-auto' : ''}`}>
      {confirmationDialog}
      <section className="attendance-banner no-print relative isolate overflow-hidden px-4 py-5 text-white sm:px-7 sm:py-7">
        <div className="attendance-banner-pattern pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-teal-200"><Building2 size={16} aria-hidden="true" />教務管理中心</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl">教務管理中心</h1>
            {examDetails.length > 0 && <p className="mt-2 text-sm text-slate-200">{examDetails.join(' · ')}</p>}
          </div>
          <div className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto">
            <dl className="rounded-xl border border-white/20 bg-slate-950/25 px-2 py-2 sm:min-w-26">
              <dt className="text-[11px] font-bold text-teal-100 sm:text-xs">正常考場</dt>
              <dd className="mt-1 font-mono text-lg font-bold sm:text-2xl">{normalCount}</dd>
            </dl>
            <button type="button" onClick={() => setActiveTab('issues')}
              className={`min-w-0 cursor-pointer rounded-xl border px-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:min-w-26 ${abnormalCount > 0 ? 'border-rose-200/50 bg-rose-900/60 hover:bg-rose-900' : 'border-white/20 bg-slate-950/25 hover:bg-white/10'}`}>
              <span className="block text-[11px] font-bold text-slate-100 sm:text-xs">需處理考場</span>
              <span className="mt-1 block font-mono text-lg font-bold sm:text-2xl">{abnormalCount}</span>
            </button>
            <dl className="rounded-xl border border-white/20 bg-slate-950/25 px-2 py-2 sm:min-w-26">
              <dt className="text-[11px] font-bold text-amber-100 sm:text-xs">全校缺席</dt>
              <dd className="mt-1 font-mono text-lg font-bold sm:text-2xl">{totalAbsent}</dd>
            </dl>
          </div>
        </div>
      </section>

      <nav aria-label="教務功能" className="no-print grid grid-cols-2 gap-2 border-b border-slate-200 bg-white p-3 sm:grid-cols-4 sm:px-6 xl:grid-cols-7">
        {sections.filter((section) => !isEmbedded || section.id !== 'reports').map((section) => {
          const Icon = section.icon;
          return (
            <a key={section.id} href={`/admin/${section.id}`}
              aria-current={activeTab === section.id ? 'page' : undefined}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setActiveTab(section.id);
              }}
              className="group flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 aria-[current=page]:border-teal-700 aria-[current=page]:bg-teal-50 aria-[current=page]:text-teal-900 sm:px-3">
              <Icon size={16} className="shrink-0 text-teal-800" aria-hidden="true" />
              <span>{section.label}</span>
              {'count' in section && <span className="ml-auto shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 group-aria-[current=page]:bg-teal-100">{section.count}</span>}
            </a>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 bg-slate-50 p-3 sm:p-6 lg:p-7 xl:overflow-y-auto">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-teal-200 bg-teal-50 text-teal-800"><CurrentIcon size={19} aria-hidden="true" /></span>
            <div>
              <h2 className="text-lg font-black text-slate-950 sm:text-xl">{currentSection.label}</h2>
              <p className="mt-0.5 text-sm leading-6 text-slate-600">{currentSection.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === 'reports' && <button type="button" onClick={exportAttendanceCSV}
              className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700">
              <Download size={16} className="text-teal-800" aria-hidden="true" />匯出全校彙總＋目前篩選明細 CSV
            </button>}
            {onLogout && (
              <button type="button" disabled={loggingOut} onClick={onLogout}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700 disabled:opacity-50">
                <LogOut size={16} aria-hidden="true" />{loggingOut ? '登出中…' : '登出'}
              </button>
            )}
          </div>
        </div>

        {activeTab === 'settings' && (configConflict || configDirty.current) && <div role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm font-bold">
          {configConflict ? '基本資料已由其他人更新。你的草稿未被覆蓋；請重新載入最新資料後核對。' : '基本資料有尚未儲存的變更。'}
          <button type="button" onClick={() => { if (window.confirm('捨棄基本資料草稿並載入最新資料？')) { configDirty.current = false; setConfigConflict(false); setConfigSaved(false); setConfigForm(sourceData.config); } }} className="ml-3 underline">捨棄草稿並重新載入</button>
        </div>}
        {isAttendanceTab && (
          <div className="no-print mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <ExamPeriodSelect periods={periods} value={chosenPeriod?.id ?? ''} onChange={setRequestedPeriodId} autoLabel="自動選擇考試節次" />
            <p className="mt-2 text-sm font-bold text-slate-700">
              {selectedPeriod ? `目前查看 · ${periodLabel(selectedPeriod)}` : '目前沒有已設定的考試節次。'}
            </p>
          </div>
        )}

        {/* TAB 1: 全校考場出席人數即時看板 (預設 4x3 零滾動矩陣 + 支援全螢幕免滾動電視牆) */}
        {activeTab === 'matrix' && (
          <div className="space-y-3.5">
            {/* 全螢幕「全校考場出席人數即時看板」淺色電視牆模式 (桌機零滾動 / 手機平板流暢自適應) */}
            {/* 篩選、檢視切換與「全螢幕出席看板」按鈕 */}
            <div className={isAttendanceWallFullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-50 p-4 space-y-4' : 'space-y-4'}>
            {isAttendanceWallFullscreen && <div className="rounded-xl bg-white p-3 font-bold">
              <p>{selectedPeriod ? periodLabel(selectedPeriod) : '尚無考試節次'} · {gradeFilter === 'all' ? '全年級' : gradeName(Number(gradeFilter))} · {filteredClassrooms.length} 班</p>
              {fullscreenNote && <p role="status">{fullscreenNote}</p>}
              <button type="button" onClick={() => setWallPage(Math.max(0, wallPage - 1))} disabled={wallPage === 0} className="p-3 disabled:opacity-40">上一頁</button>
              <span>第 {Math.min(wallPage + 1, Math.max(1, Math.ceil(filteredClassrooms.length / 8)))} / {Math.max(1, Math.ceil(filteredClassrooms.length / 8))} 頁</span>
              <button type="button" onClick={() => setWallPage(wallPage + 1)} disabled={(wallPage + 1) * 8 >= filteredClassrooms.length} className="p-3 disabled:opacity-40">下一頁</button>
              <button type="button" onClick={toggleAttendanceWallFullscreen} className="p-3 underline">退出放大／全螢幕</button>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 shrink-0">年級:</span>
                <select aria-label="篩選年級" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}
                  className="min-h-10 max-w-full rounded-xl border border-slate-300 bg-white px-2 text-sm font-bold">
                  <option value="all">全部年級</option>
                  {grades.map((grade) => <option key={grade} value={grade}>{gradeName(grade)}</option>)}
                </select>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                <div className="relative min-w-0 w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="text"
                    aria-label="搜尋班級或監考老師"
                    placeholder="搜尋班級或監考老師..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 w-full focus:outline-none focus:ring-2 focus:ring-teal-700 font-bold"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setMatrixDisplayMode('grid')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer ${
                      matrixDisplayMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>宮格</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatrixDisplayMode('table')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer ${
                      matrixDisplayMode === 'table'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>表格</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleAttendanceWallFullscreen}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-2xs transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{isAttendanceWallFullscreen ? '退出全螢幕' : '放大目前清單'}</span>
                </button>
              </div>
            </div>

            {/* 預設模式：4x3 緊湊考場出席人數即時看板 (單頁顯示全校考場，無須上下捲動) */}
            {filteredClassrooms.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
                <Users size={26} className="text-teal-800" aria-hidden="true" />
                <p className="mt-2 font-bold text-slate-950">{totalClassrooms === 0 ? '目前尚未建立考場。' : '沒有符合條件的考場。'}</p>
                {totalClassrooms === 0 ? (
                  <button type="button" onClick={() => setActiveTab('settings')} className="mt-3 min-h-10 cursor-pointer rounded-xl bg-teal-800 px-3 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">前往考務設定</button>
                ) : (
                  <button type="button" onClick={() => { setGradeFilter('all'); setSearchQuery(''); }} className="mt-3 min-h-10 cursor-pointer rounded-xl border border-slate-200 px-3 text-sm font-bold text-teal-800 hover:bg-teal-50">清除篩選</button>
                )}
              </div>
            ) : matrixDisplayMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(isAttendanceWallFullscreen ? filteredClassrooms.slice(Math.min(wallPage, Math.max(0, Math.ceil(filteredClassrooms.length / 8) - 1)) * 8, (Math.min(wallPage, Math.max(0, Math.ceil(filteredClassrooms.length / 8) - 1)) + 1) * 8) : filteredClassrooms).map((c) => {
                  const classIssues = data.issues.filter((i) => i.classId === c.classId);
                  const hasUnresolved = classIssues.some((i) => i.status !== 'resolved');
                  const latestIssue = classIssues.filter((i) => i.status !== 'resolved').sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent))[0];

                  return (
                    <div
                      key={c.classId}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 ${
                        hasUnresolved
                          ? 'bg-rose-50/80 border-rose-300'
                          : 'bg-white border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-black text-[11px] tabular-nums">
                              {c.classId}
                            </span>
                            <span className="text-base font-black text-slate-900">{c.className}</span>
                          </div>
                          <span className="text-xs text-slate-600 font-bold block mt-0.5">
                            監考：{c.invigilator}
                          </span>
                        </div>

                        {hasUnresolved ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (latestIssue) setSelectedIssueId(latestIssue.id);
                              setIssueClassFilter(c.classId);
                              setActiveTab('issues');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-700 text-white font-black text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>處置</span>
                          </button>
                        ) : (
                          <span
                            className={`text-xs font-black px-2 py-0.5 rounded-lg whitespace-nowrap ${
                              c.statusReported
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {c.statusReported ? '已點名' : '待點名'}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 p-2 rounded-xl border border-slate-200/70">
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block">應到</span>
                          <span className="font-mono font-black text-lg text-slate-900 tabular-nums leading-tight">
                            {c.expectedCount}
                          </span>
                        </div>
                        <div className="bg-emerald-50/80 rounded-lg border border-emerald-200/80">
                          <span className="text-[11px] font-bold text-emerald-800 block">實到</span>
                          <span className="font-mono font-black text-lg text-emerald-700 tabular-nums leading-tight">
                            {c.statusReported ? c.presentCount : '—'}
                          </span>
                        </div>
                        <div
                          className={`rounded-lg border ${
                            c.absentCount > 0
                              ? 'bg-rose-50 border-rose-300'
                              : 'border-transparent'
                          }`}
                        >
                          <span className="text-[11px] font-bold text-rose-800 block">缺席</span>
                          <span
                            className={`font-mono font-black text-lg tabular-nums leading-tight ${
                              c.absentCount > 0 ? 'text-rose-700' : 'text-slate-600'
                            }`}
                          >
                            {c.statusReported ? c.absentCount : '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="text-slate-600 font-bold truncate max-w-[175px]">
                          {!c.statusReported ? '待點名' : c.absentStudents && c.absentStudents.length > 0
                            ? `缺席：${c.absentStudents.map((s) => `#${s.seatNo} ${s.name}`).join('、')}`
                            : '全班到齊'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectClassroom) onSelectClassroom(c.classId, selectedPeriod?.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 font-black text-xs cursor-pointer transition-colors"
                        >
                          巡查此班
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 表格模式 */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <p className="px-4 py-2 text-xs text-slate-600 sm:hidden">表格可左右滑動；也可切換上方「宮格」。</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black">
                        <th className="py-2.5 px-4">考場班級</th>
                        <th className="py-2.5 px-4">監考教師</th>
                        <th className="py-2.5 px-4">點名狀態</th>
                        <th className="py-2.5 px-3 text-center font-mono">應到</th>
                        <th className="py-2.5 px-3 text-center font-mono">實到</th>
                        <th className="py-2.5 px-3 text-center font-mono">缺席</th>
                        <th className="py-2.5 px-4">缺席考生明細</th>
                        <th className="py-2.5 px-4">考場即時狀況</th>
                        <th className="py-2.5 px-4 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                      {(isAttendanceWallFullscreen ? filteredClassrooms.slice(Math.min(wallPage, Math.max(0, Math.ceil(filteredClassrooms.length / 8) - 1)) * 8, (Math.min(wallPage, Math.max(0, Math.ceil(filteredClassrooms.length / 8) - 1)) + 1) * 8) : filteredClassrooms).map((c) => {
                        const classIssues = data.issues.filter((i) => i.classId === c.classId);
                        const hasUnresolved = classIssues.some((i) => i.status !== 'resolved');
                        const latestIssue = classIssues.filter((i) => i.status !== 'resolved').sort((a, b) => Number(b.isUrgent) - Number(a.isUrgent))[0];

                        return (
                          <tr
                            key={c.classId}
                            className={`hover:bg-teal-50/40 transition-colors ${
                              hasUnresolved ? 'bg-rose-50/70' : ''
                            }`}
                          >
                            <td className="py-2.5 px-4 font-black text-slate-900 whitespace-nowrap">
                              {c.className}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                              {c.invigilator}
                            </td>
                            <td className="px-4">{c.statusReported ? '已回報' : '待點名'}</td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-700">
                              {c.expectedCount}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums text-emerald-700 font-black">
                              {c.statusReported ? c.presentCount : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                              {!c.statusReported ? '—' : c.absentCount > 0 ? (
                                <span className="text-rose-700 font-black">{c.statusReported ? c.absentCount : '—'}</span>
                              ) : (
                                <span className="text-slate-600">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate text-xs">
                              {!c.statusReported ? <span>待點名</span> : c.absentStudents && c.absentStudents.length > 0 ? (
                                c.absentStudents
                                  .map((st) => `#${st.seatNo} ${st.name} (${st.reason})`)
                                  .join(' · ')
                              ) : (
                                <span className="text-slate-600">全勤到齊</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4">
                              {hasUnresolved ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (latestIssue) setSelectedIssueId(latestIssue.id);
                              setIssueClassFilter(c.classId);
                                    setActiveTab('issues');
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-rose-700 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>有狀況！點此處理</span>
                                </button>
                              ) : (
                                <span className="text-emerald-700 flex items-center gap-1 font-black whitespace-nowrap">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span>無未結案通報</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  if (onSelectClassroom) onSelectClassroom(c.classId, selectedPeriod?.id);
                                }}
                                className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-teal-100 text-slate-700 hover:text-teal-950 font-black text-xs cursor-pointer transition-colors"
                              >
                                巡查此班
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            </div>
            {/* 內嵌式「快速改題目廣播」卡片 */}
            {isEmbedded && (
              <form
                onSubmit={handlePublishAnnouncement}
                className="bg-white rounded-2xl sm:rounded-3xl border-2 border-amber-300 p-4 sm:p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2">
                  <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                    <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                    <span>試題更正／公告（考科僅為標籤；時間延長不改考程）</span>
                  </div>
                </div>
                <div>
                  <input
                    type="text"
                    value={annoTitle}
                    onChange={(e) => setAnnoTitle(e.target.value)}
                    aria-label="更正標題"
                    placeholder="請輸入更正標題（例如：【試題更正】第 X 題選項修正）"
                    className="w-full text-xs sm:text-sm font-black p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>
                <div>
                  <textarea
                    rows={2}
                    value={annoContent}
                    onChange={(e) => setAnnoContent(e.target.value)}
                    aria-label="更正或公告內容"
                    placeholder="請輸入試題更正或公告內容..."
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold"
                  />
                </div>
                <p className="text-xs font-bold text-amber-900">考科僅為標籤，不會限制接收班級。「時間延長」僅發布通知，考程時間不變；若需延後，請至考務設定 → 考程調整。</p>
                {announcementScheduleFields}
                <button
                  type="submit"
                  disabled={isPublishing || !annoTitle.trim() || !annoContent.trim()}
                  className="w-full min-h-[44px] py-2.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isPublishing ? '正在儲存公告…' : '預覽並發布公告'}</span>
                </button>
                {announcementFeedback}
              </form>
            )}
          </div>
        )}

        {/* TAB 2: 試題更正 / 公告發布 */}
        {activeTab === 'broadcast' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7">
            <div className="min-w-0 lg:col-span-12">
              <CorrectionReview proposals={data.correctionProposals ?? []} audienceLabel={getTargetAudienceLabel} />
            </div>
            <div className="lg:col-span-7 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileEdit className="w-5 h-5 text-teal-800" />
                  <span>修改題目 / 廣播公告</span>
                </h3>
                <span className="text-xs text-slate-600 font-medium block mt-0.5">
                  可立即發布，也可設定所選考場的公告顯示時段。
                </span>
              </div>

              {/* 發布表單 (自適應手機單欄、平板桌機三欄) */}
              <form onSubmit={handlePublishAnnouncement} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="admin-target-audience" className="block text-xs font-black text-slate-700 mb-1">對象班級</label>
                    <select id="admin-target-audience"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      className="w-full min-h-[42px] text-xs font-black p-2.5 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="all">全部班級 (全校)</option>
                      {grades.map((grade) => (
                        <option key={grade} value={`grade_${grade}`}>{gradeName(grade)}全體</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="admin-anno-subject" className="block text-xs font-black text-slate-700 mb-1">考科（僅標籤）</label>
                    <input id="admin-anno-subject"
                      type="text"
                      value={annoSubject}
                      onChange={(e) => setAnnoSubject(e.target.value)}
                      className="w-full min-h-[42px] text-xs font-black p-2.5 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-anno-type" className="block text-xs font-black text-slate-700 mb-1">類型</label>
                    <select id="admin-anno-type"
                      value={annoType}
                      onChange={(e) => setAnnoType(e.target.value as any)}
                      className="w-full min-h-[42px] text-xs font-black p-2.5 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="correction">試題更正 (黃金高亮)</option>
                      <option value="extension">時間延長</option>
                      <option value="notice">一般提醒</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="admin-anno-title" className="block text-xs font-black text-slate-700 mb-1">公告標題</label>
                  <input id="admin-anno-title"
                    type="text"
                    value={annoTitle}
                    onChange={(e) => setAnnoTitle(e.target.value)}
                    placeholder="請輸入公告或試題更正標題..."
                    className="w-full text-sm font-black p-3 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="admin-anno-content" className="block text-xs font-black text-slate-700 mb-1">
                    更正內容（會用超大字顯示在各班黑板上）：
                  </label>
                  <textarea id="admin-anno-content"
                    rows={3}
                    value={annoContent}
                    onChange={(e) => setAnnoContent(e.target.value)}
                    placeholder="請輸入詳細試題更正說明或考務公告內容..."
                    className="w-full text-sm font-bold p-3.5 rounded-xl border border-slate-300 bg-white leading-relaxed"
                  />
                </div>

                <p className="text-xs font-bold text-amber-900">考科僅為標籤，不會限制接收班級。「時間延長」僅發布通知，考程時間不變；若需延後，請至考務設定 → 考程調整。</p>
                {announcementScheduleFields}
                <button
                  type="submit"
                  disabled={isPublishing || !annoTitle.trim() || !annoContent.trim()}
                  className="w-full min-h-[52px] py-3.5 sm:py-4 px-5 bg-teal-800 hover:bg-teal-900 active:scale-[0.99] text-white font-black text-sm sm:text-lg rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5 shrink-0" />
                  <span>{isPublishing ? '正在發布公告…' : '預覽並發布公告'}</span>
                </button>

                {announcementFeedback}
              </form>
            </div>

            {/* 已發布歷史列表 */}
            <div className="lg:col-span-5 bg-white rounded-2xl sm:rounded-3xl border-2 border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 flex flex-col">
              <h4 className="text-sm sm:text-base font-black text-slate-900 border-b border-slate-100 pb-3">
                公告與更正紀錄 ({data.announcements.length})
              </h4>
              {withdrawFeedback && <p role={withdrawFeedback.error ? 'alert' : 'status'}
                className={`rounded-xl p-3 text-sm font-bold ${withdrawFeedback.error ? 'bg-rose-50 text-rose-900' : 'bg-teal-50 text-teal-900'}`}>{withdrawFeedback.text}</p>}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[520px] pr-1">
                {data.announcements.length > 0 ? (
                  data.announcements.map((anno) => (
                    <div
                      key={anno.id}
                      className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/70 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-amber-900">
                          {anno.type === 'correction' ? '試題更正' : '考務公告'} · {anno.subject}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(anno.id)}
                          disabled={Boolean(withdrawingId)}
                          className="text-rose-700 hover:text-rose-800 font-black flex items-center gap-1 cursor-pointer min-h-[32px] px-2 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{withdrawingId === anno.id ? '撤回中…' : '撤回公告'}</span>
                        </button>
                      </div>
                      <div className="font-black text-slate-900 text-sm">{anno.title}</div>
                      <p className="font-bold">對象：{getTargetAudienceLabel(anno.targetAudience)} · {sourceData.classrooms.filter((room) => anno.targetAudience === 'all' || anno.targetAudience === room.classId || anno.targetAudience === `grade_${room.grade}`).length} 班</p>
                      <button type="button" className="underline" onClick={() => { setAnnoTitle(anno.title); setAnnoContent(anno.content); setAnnoSubject(anno.subject); setAnnoType(anno.type); setTargetAudience(anno.targetAudience); setAnnoStartsAt(''); setAnnoEndsAt(''); setPublishSuccess(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>複製為新公告（修正後重新發布）</button>
                      <dl className="space-y-1 text-slate-700">
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-bold">狀態</dt>
                          <dd>{{ scheduled: '排程中', active: '顯示中', ended: '已結束' }[announcementStatus(anno, announcementNow)]}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-bold">開始顯示</dt>
                          <dd>{announcementTimeFormat.format(new Date(announcementDisplayStart(anno)))}</dd>
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-bold">結束顯示</dt>
                          <dd>{anno.endsAt ? announcementTimeFormat.format(new Date(anno.endsAt)) : '手動撤回'}</dd>
                        </div>
                      </dl>
                      <div className="bg-white p-3 rounded-xl border border-amber-200 text-slate-800 font-bold leading-relaxed">
                        {anno.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-xs sm:text-sm text-slate-600 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    目前尚無發布任何試題更正或公告
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 考場突發回報受理 */}
        {activeTab === 'issues' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7">
            {/* 左邊：案件列表 */}
            <div className="lg:col-span-6 bg-white rounded-2xl sm:rounded-3xl border-2 border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  各考場通報清單 ({data.issues.filter((i) => !issueClassFilter || i.classId === issueClassFilter).length}) · 待處理 {data.issues.filter((i) => i.status !== 'resolved' && (!issueClassFilter || i.classId === issueClassFilter)).length} 件
                </h3>
                <span className="text-xs text-slate-600 font-bold">先聯絡支援人員，再選案件回覆</span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
                {issueClassFilter && <button type="button" onClick={() => setIssueClassFilter('')} className="underline">目前：{issueClassFilter}，清除考場篩選</button>}
                {!data.issues.some((i) => !issueClassFilter || i.classId === issueClassFilter) && <p className="p-4 text-slate-600">目前沒有考場通報。</p>}
                {data.issues.filter((i) => !issueClassFilter || i.classId === issueClassFilter).map((issue) => (
                  <button
                    type="button"
                    key={issue.id}
                    aria-pressed={selectedIssueId === issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`block w-full p-4 text-left rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                      selectedIssueId === issue.id
                        ? 'border-teal-700 bg-teal-50/70 shadow-sm'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900">
                          {issue.className}
                        </span>
                        {issue.isUrgent && (
                          <span className="text-rose-700 font-black text-xs">
                            · 緊急優先
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-xs font-black ${
                          issue.status === 'resolved'
                            ? 'text-emerald-700'
                            : issue.status === 'processing'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {issue.status === 'resolved' ? '✓ 已解決' : issue.status === 'processing' ? '處理中' : '待派人'}
                      </span>
                    </span>

                    <span className="block text-xs sm:text-sm text-slate-800 font-bold leading-relaxed">
                      {issue.content}
                    </span>

                    <span className="text-[11px] text-slate-600 font-bold flex items-center justify-between">
                      <span className="font-mono tabular-nums">{new Date(issue.createdAt).toLocaleTimeString('zh-TW')} 通報</span>
                      {issue.reply && <span className="text-teal-800 font-black">已回覆派遣</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 右邊：一鍵派遣大按鈕面板 */}
            <div className="lg:col-span-6 bg-white rounded-2xl sm:rounded-3xl border border-teal-200 p-4 sm:p-6 shadow-sm flex flex-col justify-between space-y-5">
              {isReplying && <p role="status" className="text-sm font-bold text-teal-900">正在儲存通報處理結果…</p>}
              {replyFeedback && replyFeedback.issueId === selectedIssueId && <p role={replyFeedback.error ? 'alert' : 'status'}
                className={`rounded-xl p-3 text-sm font-bold ${replyFeedback.error ? 'bg-rose-50 text-rose-900' : 'bg-teal-50 text-teal-900'}`}>{replyFeedback.text}</p>}
              {selectedIssueId ? (
                (() => {
                  const issue = data.issues.find((i) => i.id === selectedIssueId);
                  if (!issue) return null;

                  return (
                    <div className="space-y-4 sm:space-y-5">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-xs font-black text-teal-800 block mb-0.5">正在處置案件：</span>
                        <h3 className="text-lg sm:text-xl font-black text-slate-900">
                          {issue.className} 考場突發狀況
                        </h3>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-xs font-bold text-slate-600 block mb-1">監考老師回報文字：</span>
                        <p className="text-sm sm:text-base font-black text-slate-900 leading-relaxed">
                          {issue.content}
                        </p>
                      </div>

                      {/* 一鍵派遣 4 大按鈕 */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-slate-800 block">
                          請先依校內方式聯絡支援人員；以下只回覆監考老師，不會通知健康中心、巡堂或總務。
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isReplying}
                            onClick={() =>
                              handleQuickDispatch(
                                issue.id,
                                '教務處已聯絡健康中心請求協助；到場時間待確認。',
                                'processing'
                              )
                            }
                            className="min-h-[48px] p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 text-rose-950 font-black text-xs sm:text-sm text-left transition-all cursor-pointer flex items-center gap-2"
                          >
                            <HeartPulse className="w-5 h-5 text-rose-700 shrink-0" />
                            <span>我已聯絡健康中心，回覆老師</span>
                          </button>

                          <button
                            type="button"
                            disabled={isReplying}
                            onClick={() =>
                              handleQuickDispatch(
                                issue.id,
                                '教務處已聯絡巡堂組協助補送試卷；到場時間待確認。',
                                'processing'
                              )
                            }
                            className="min-h-[48px] p-3.5 rounded-2xl bg-teal-50 hover:bg-teal-100 border-2 border-teal-300 text-teal-950 font-black text-xs sm:text-sm text-left transition-all cursor-pointer flex items-center gap-2"
                          >
                            <FileText className="w-5 h-5 text-teal-700 shrink-0" />
                            <span>我已聯絡巡堂補卷，回覆老師</span>
                          </button>

                          <button
                            type="button"
                            disabled={isReplying}
                            onClick={() =>
                              handleQuickDispatch(
                                issue.id,
                                '教務處已聯絡總務處請求維修；到場時間待確認。',
                                'processing'
                              )
                            }
                            className="min-h-[48px] p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 text-amber-950 font-black text-xs sm:text-sm text-left transition-all cursor-pointer flex items-center gap-2"
                          >
                            <Wrench className="w-5 h-5 text-amber-600 shrink-0" />
                            <span>我已聯絡總務，回覆老師</span>
                          </button>

                          <button
                            type="button"
                            disabled={isReplying}
                            onClick={() =>
                              handleQuickDispatch(
                                issue.id,
                                '教務處已確認處置完畢，紀錄於段考考務日誌。',
                                'resolved'
                              )
                            }
                            className="min-h-[48px] p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-300 text-emerald-950 font-black text-xs sm:text-sm text-left transition-all cursor-pointer flex items-center gap-2"
                          >
                            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>處置完成（結案）</span>
                          </button>
                        </div>
                      </div>

                      {issue.reply && (
                        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs sm:text-sm font-bold text-teal-950">
                          <span>目前已傳送給老師的回覆：</span>
                          <div className="mt-1 font-black text-teal-950">{issue.reply}</div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-12 text-slate-600 font-bold">
                  請先在通報清單選擇案件；沒有案件時無須操作。
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="official-report-view space-y-5">
            <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-950">A4 正式報表預覽</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">篩選只影響考場明細與缺席清冊。總表、公告及通報採全校資料。</p>
                </div>
                <button type="button" onClick={() => window.print()}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#10243d] px-4 text-sm font-bold text-white hover:bg-[#1b3b51] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  <Printer size={17} aria-hidden="true" />列印正式報表 (A4)
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    明細年級
                    <select aria-label="明細年級" value={reportGradeFilter} onChange={(event) => setReportGradeFilter(event.target.value)}
                      className="min-h-10 rounded-xl border border-slate-300 bg-white px-2 focus-visible:outline-2 focus-visible:outline-teal-700">
                      <option value="all">全部年級</option>
                      {grades.map((grade) => <option key={grade} value={grade}>{gradeName(grade)}</option>)}
                    </select>
                  </label>
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={reportOnlyAbsent} onChange={(event) => setReportOnlyAbsent(event.target.checked)} className="size-4 accent-teal-800" />
                    僅列有缺席考場
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={exportAttendanceCSV} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-teal-900 hover:bg-teal-50">
                    <Download size={16} aria-hidden="true" />全校彙總＋目前篩選明細 CSV
                  </button>
                  <button type="button" onClick={exportAbsentRosterCSV} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-teal-900 hover:bg-teal-50">
                    <FileText size={16} aria-hidden="true" />目前篩選缺席清冊 CSV
                  </button>
                </div>
              </div>
            </div>

            <OfficialExamReport
              data={data}
              classrooms={reportFilteredClassrooms}
              detailScope={`${reportGradeFilter === 'all' ? '全部年級' : gradeName(Number(reportGradeFilter))} · ${reportOnlyAbsent ? '僅有缺席考場' : '全部考場'}`}
              audienceLabel={getTargetAudienceLabel}
              issueLabel={getIssueCategoryLabel}
            />
          </div>
        )}

        {activeTab === 'logs' && <AuditLogView />}

        {activeTab === 'settings' && (
          <div className="min-w-0 space-y-4">
            <AdminSettingsNavigation active={activeSettingsPage} onNavigate={onSettingsPageChange} />
            {activeSettingsPage === 'schedule' && <ExamScheduleSettings data={sourceData} />}
            {activeSettingsPage === 'grades' && <GradeSettings data={sourceData} />}
            {activeSettingsPage === 'basics' && (
              <div className="max-w-4xl space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    考試基本資料
                  </h3>
                  <p className="text-xs text-slate-600 font-bold mt-0.5">
                    修改後將即時同步至全校各班「電子黑板」與「頁首資訊列」
                  </p>
                </div>

                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs font-black text-slate-700">
                      學校名稱
                      <input
                        type="text"
                        disabled={savingConfig} value={configForm.schoolName}
                        onChange={(e) => updateConfigDraft({ ...configForm, schoolName: e.target.value })}
                        className="mt-1 w-full text-sm font-black p-2.5 rounded-xl border border-slate-300"
                      />
                    </label>
                    <label className="block text-xs font-black text-slate-700">
                      學年度與學期
                      <input
                        type="text"
                        disabled={savingConfig} value={configForm.academicYear}
                        onChange={(e) => updateConfigDraft({ ...configForm, academicYear: e.target.value })}
                        className="mt-1 w-full text-sm font-black p-2.5 rounded-xl border border-slate-300"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-black text-slate-700">
                    段考名稱
                    <input type="text" disabled={savingConfig} value={configForm.examName}
                      onChange={(e) => updateConfigDraft({ ...configForm, examName: e.target.value })}
                      className="mt-1 w-full text-sm font-black p-2.5 rounded-xl border border-slate-300" />
                  </label>

                  <label className="block text-xs font-black text-slate-700">
                    考場守則（每行一項）
                    <textarea
                      rows={3}
                      disabled={savingConfig} value={configForm.rulesNotes.join('\n')}
                      onChange={(e) => updateConfigDraft({ ...configForm, rulesNotes: e.target.value.split('\n') })}
                      className="mt-1 w-full text-sm font-black p-2.5 rounded-xl border border-slate-300"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="w-full min-h-[48px] py-3 bg-teal-800 hover:bg-teal-900 text-white font-black rounded-xl text-sm cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingConfig ? '儲存中…' : '儲存考務設定'}
                  </button>
                  {configSaveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900">{configSaveError}</p>}
                  {configSaved && (
                    <div role="status" className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-black text-emerald-700 text-center">
                      考試基本資料已儲存。
                    </div>
                  )}
                </form>
              </div>

            )}
            {activeSettingsPage === 'classrooms' && (
              <ClassroomSettings data={sourceData} onManageInvigilation={() => setActiveTab('assign')} />
            )}
            {activeSettingsPage === 'credentials' && <AdminAccountsSettings />}
          </div>
        )}

        {/* TAB 5: 全校監考教師名冊匯入與獨立帳號管理 (獨立頁面 /admin/teachers) */}
        {activeTab === 'teachers' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-teal-200 p-4 sm:p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">
                      全校監考教師名冊匯入與獨立帳號管理
                    </h3>
                    <p className="text-xs text-slate-600 font-bold mt-0.5">
                      建立與匯入全校教師專屬的獨立登入帳號與密碼（考場排班指派請至「監考指派」頁面操作）
                    </p>
                  </div>
                </div>

                <label className="block text-sm font-bold">匯入方式（檔案與貼上共用；每次上限 50 筆）
                  <select value={batchImportMode} onChange={(e) => setBatchImportMode(e.target.value as 'merge' | 'replace')} className="ml-2 rounded border p-2">
                    <option value="merge">合併新增／更新</option><option value="replace">覆蓋名冊（未列入者將移除）</option>
                  </select>
                </label>
                {/* 批次匯入、範本下載與前往指派頁操作列 */}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openTeacherForm()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 text-xs font-black text-white hover:bg-teal-900 sm:text-sm">
                    <UserPlus size={17} aria-hidden="true" />新增教師帳號與出題指派
                  </button>
                  <label className="min-h-[40px] px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700">
                    <Upload className="w-4 h-4" />
                    <span>上傳 CSV / TXT 匯入全校教師</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      disabled={Boolean(teacherPending)}
                      onChange={handleFileUploadImport}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowBatchImportBox(!showBatchImportBox)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer border transition-colors ${
                      showBatchImportBox
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-teal-50 hover:bg-teal-100 text-teal-900 border-teal-200'
                    }`}
                  >
                    <FileEdit className="w-4 h-4" />
                    <span>{showBatchImportBox ? '收合貼上匯入區' : '貼上名單批次匯入'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={downloadTeacherTemplateCSV}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>下載匯入範本</span>
                  </button>

                  <button
                    type="button"
                    onClick={exportCurrentTeachersCSV}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-800" />
                    <span>匯出教師名冊</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('assign')}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>前往監考指派 →</span>
                  </button>
                </div>
              </div>

              {teacherPending && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{teacherPending}</p>}
              {teacherFeedback && (
                <div
                  role={teacherFeedback.type === 'ok' ? 'status' : 'alert'}
                  className={`p-3 rounded-xl border text-xs sm:text-sm font-black flex items-center justify-between ${
                    teacherFeedback.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span>{teacherFeedback.msg}</span>
                </div>
              )}

              {/* 展開式：貼上 CSV / Excel 文字批次匯入區 */}
              {showBatchImportBox && (
                <div className="p-4 sm:p-5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-teal-950">
                        批次貼上全校教師名單與獨立帳密
                      </h4>
                      <p className="text-xs font-bold text-teal-900/80 mt-0.5">
                        每行一位老師，欄位以逗號或 Tab 分隔：
                        <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-teal-200 ml-1">
                          教師姓名,獨立登入帳號,登入密碼,任教科別
                        </code>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-teal-200 text-xs font-black">
                      <button
                        type="button"
                        onClick={() => setBatchImportMode('merge')}
                        className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                          batchImportMode === 'merge'
                            ? 'bg-teal-800 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        合併新增/更新現有名冊
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchImportMode('replace')}
                        className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                          batchImportMode === 'replace'
                            ? 'bg-rose-700 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        覆蓋重設全校名冊
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={batchImportText}
                    onChange={(e) => setBatchImportText(e.target.value)}
                    aria-label="要匯入的教師名冊"
                    placeholder="教師姓名,獨立登入帳號,獨立登入密碼,任教科別,指派班級代號（選填）"
                    className="w-full p-3 rounded-xl border border-teal-300 bg-white text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBatchImportBox(false)}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-700 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(teacherPending)}
                      onClick={() => void importTeacherText(batchImportText)}
                      className="px-5 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-black cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      預覽並確認匯入教師名冊
                    </button>
                  </div>
                </div>
              )}

              <dialog ref={teacherDialog} aria-labelledby="teacher-form-title"
                onClose={() => setTchPassForm('')}
                onCancel={(event) => { if (savingTeacher) event.preventDefault(); }}
                className="no-print fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/65"
              >
                <form onSubmit={handleSaveSingleTeacher} className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
                  <header className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
                    <h3 id="teacher-form-title" className="flex items-center gap-2 text-lg font-black">
                      <UserPlus size={20} className="shrink-0 text-teal-800" aria-hidden="true" />
                      {editingTeacherId ? '編輯教師帳號與出題指派' : '新增教師帳號與出題指派'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">管理教師登入資料，並從已儲存的考程表選擇出題科目。</p>
                  </header>
                  <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                    <fieldset disabled={savingTeacher} className="min-w-0 space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="admin-tch-name-form" className="block text-[11px] font-black text-slate-600 mb-1">
                            教師姓名 *
                          </label>
                          <input id="admin-tch-name-form"
                            type="text" required
                            value={tchNameForm}
                            onChange={(e) => setTchNameForm(e.target.value)}
                            placeholder="請輸入教師姓名"
                            className="w-full text-xs sm:text-sm font-black p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label htmlFor="admin-tch-dept-form" className="block text-[11px] font-black text-slate-600 mb-1">
                            任教科別
                          </label>
                          <input id="admin-tch-dept-form"
                            type="text"
                            value={tchDeptForm}
                            onChange={(e) => setTchDeptForm(e.target.value)}
                            placeholder="例如：數學科"
                            className="w-full text-xs sm:text-sm font-black p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label htmlFor="admin-tch-user-form" className="block text-[11px] font-black text-slate-600 mb-1">
                            獨立登入帳號 *
                          </label>
                          <input id="admin-tch-user-form"
                            type="text" required
                            value={tchUserForm}
                            onChange={(e) => setTchUserForm(e.target.value)}
                            placeholder="請輸入登入帳號"
                            className="w-full text-xs sm:text-sm font-mono font-black p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                        <div>
                          <label htmlFor="admin-tch-pass-form" className="block text-[11px] font-black text-slate-600 mb-1">
                            {editingTeacherId ? '重設登入密碼' : '獨立登入密碼 *'}
                          </label>
                          <input id="admin-tch-pass-form"
                            type="password"
                            required={!editingTeacherId}
                            autoComplete="new-password"
                            minLength={MIN_TEACHER_PASSWORD_LENGTH}
                            maxLength={256}
                            value={tchPassForm}
                            onChange={(e) => setTchPassForm(e.target.value)}
                            placeholder={editingTeacherId ? '留空沿用；重設至少 12 字元' : '至少 12 字元，建議使用長密語'}
                            className="w-full text-xs sm:text-sm font-mono font-black p-2 rounded-xl border border-slate-300 bg-white"
                          />
                        </div>

                      </div>
                      <fieldset className="min-w-0 space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                        <legend className="px-1 text-sm font-black text-teal-950">出題科目與年級</legend>
                        <p className="text-xs leading-5 text-teal-900">教師可為指派的科目與年級提交試題更正，教務核准後才會發布。</p>
                        {tchAuthorAssignments.map((assignment, index) => (
                          <div key={index} className="grid items-end gap-2 rounded-lg border border-teal-100 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <label className="min-w-0 text-xs font-bold text-slate-700">第 {index + 1} 項出題科目
                              <select required value={assignment.subject}
                                onChange={(event) => updateAuthorAssignment(index, { subject: event.target.value })}
                                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-950">
                                <option value="">選擇考程表科目</option>
                                {assignment.subject && !examSubjects.includes(assignment.subject) && (
                                  <option value={assignment.subject}>{assignment.subject}（目前考程未列）</option>
                                )}
                                {examSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                              </select>
                            </label>
                            <label className="min-w-0 text-xs font-bold text-slate-700">第 {index + 1} 項年級
                              <select required value={grades.includes(assignment.grade) ? assignment.grade : ''}
                                onChange={(event) => {
                                  const grade = Number(event.target.value);
                                  const retainSubject = examSubjects.includes(assignment.subject) ||
                                    originalAuthorAssignments.current.some((item) => item.subject === assignment.subject && item.grade === grade);
                                  updateAuthorAssignment(index, { grade, subject: retainSubject ? assignment.subject : '' });
                                }}
                                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-950">
                                <option value="">選擇年級</option>
                                {grades.map((grade) => <option key={grade} value={grade}>{gradeLabel(sourceData.config, grade)}</option>)}
                              </select>
                            </label>
                            <button type="button" aria-label={`移除第 ${index + 1} 項出題指派`}
                              onClick={() => setTchAuthorAssignments((current) => current.filter((_, row) => row !== index))}
                              className="min-h-10 rounded-lg px-3 text-xs font-bold text-rose-800 hover:bg-rose-50">移除</button>
                          </div>
                        ))}
                        {tchAuthorAssignments.length === 0 && <p className="text-xs text-slate-700">尚未指派出題科目與年級。</p>}
                        {!examSubjects.length && <p className="text-xs font-bold text-teal-900">考程表尚無科目。請先到「考務設定 → 考程表」新增並儲存考試節次。</p>}
                        <button type="button" disabled={!examSubjects.length || !grades.length || tchAuthorAssignments.length >= MAX_EXAM_AUTHOR_ASSIGNMENTS}
                          onClick={() => setTchAuthorAssignments((current) => [...current, { subject: '', grade: 0 }])}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 text-xs font-bold text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                          <Plus size={15} aria-hidden="true" />新增出題指派
                        </button>
                      </fieldset>
                    </fieldset>
                  </div>
                  <footer className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3 sm:px-6">
                    {teacherFormError && <p role="alert" className="text-sm font-bold text-rose-800">{teacherFormError}</p>}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" disabled={savingTeacher} onClick={() => teacherDialog.current?.close()}
                        className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">取消</button>
                      <button type="submit" disabled={savingTeacher} className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
                        {savingTeacher ? '儲存中…' : editingTeacherId ? '儲存教師帳號設定' : '新增教師帳號'}
                      </button>
                    </div>
                  </footer>
                </form>
              </dialog>

              {/* 全校教師清冊搜尋與篩選列 */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTeacherAssignFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
                      teacherAssignFilter === 'all'
                        ? 'bg-white text-teal-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全校教師 ({teachersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherAssignFilter('assigned')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
                      teacherAssignFilter === 'assigned'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    已排班教師 ({teachersList.filter(hasAssignment).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherAssignFilter('unassigned')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
                      teacherAssignFilter === 'unassigned'
                        ? 'bg-white text-amber-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    待命教師 ({teachersList.filter((t) => !hasAssignment(t)).length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      aria-label="搜尋教師姓名、帳號或科別"
                      placeholder="搜尋教師姓名、帳號或科別..."
                      className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:outline-none focus:border-teal-700"
                    />
                  </div>

                </div>
              </div>

              <p className="text-sm font-bold">符合條件 {visibleTeachers.length} / {teachersList.length} 位教師</p>
              {/* 全校教師獨立帳號清冊表格 (純名冊與帳密管理) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 text-[11px] sm:text-xs font-black text-slate-600">
                      <tr>
                        <th className="py-2.5 px-4">教師姓名</th>
                        <th className="py-2.5 px-4">任教科別</th>
                        <th className="py-2.5 px-4">獨立登入帳號</th>
                        <th className="py-2.5 px-4">目前排班狀態</th>
                        <th className="py-2.5 px-4 text-right">帳密操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 text-xs sm:text-sm bg-white">
                      {!visibleTeachers.length && <tr><td colSpan={5} className="p-6 text-center">
                        {teachersList.length ? '沒有符合條件的教師。' : '尚未建立教師名冊，請新增帳號或匯入名單。'}
                        <button type="button" onClick={() => { setTeacherSearch(''); setTeacherAssignFilter('all'); }} className="ml-2 underline">清除篩選</button>
                      </td></tr>}
                      {visibleTeachers
                        .map((t) => {
                          const assignedClass = data.classrooms.find(
                            (c) => c.classId === t.assignedClassId
                          );
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/90 transition-colors">
                              <td className="py-2.5 px-4 font-black text-slate-900">
                                {t.name}
                                {!!t.examAuthorAssignments?.length && (
                                  <ul aria-label="出題科目與年級" className="mt-1 flex flex-wrap gap-1">
                                    {t.examAuthorAssignments.map((item) => (
                                      <li key={JSON.stringify(item)} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-950 [overflow-wrap:anywhere]">{authorAssignmentLabel(item)}</li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-slate-600">
                                {t.department || '專任教師'}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-mono font-black text-slate-800">
                                  {t.username}
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                {assignedClass ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>
                                      預設考場：{assignedClass.classId} {assignedClass.className}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">
                                    {hasAssignment(t) ? '已有分節監考' : '未排班（待命）'}
                                  </span>
                                )}
                                <details className="mt-2"><summary>有效監考節次：{teacherSlots(t).length}</summary><ul>{teacherSlots(t).map((slot) => <li key={slot}>{slot}</li>)}</ul></details>
                              </td>
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openTeacherForm(t)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 font-black text-xs cursor-pointer transition-colors"
                                  >
                                    編輯教師
                                  </button>
                                  <button
                                    type="button"
                                    disabled={Boolean(teacherPending)}
                                    onClick={() => handleDeleteTeacherAccount(t)}
                                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-700 text-rose-700 hover:text-white cursor-pointer transition-colors"
                                    title="刪除此教師帳號"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assign' && <InvigilatorAssignments data={data} onManageTeachers={() => setActiveTab('teachers')}
          onOpenSchedule={onSettingsPageChange ? () => onSettingsPageChange('schedule') : undefined} />}

      </div>
    </div>
  );
};
