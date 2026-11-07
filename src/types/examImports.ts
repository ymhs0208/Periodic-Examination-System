export const examImports = {
  schedule: {
    title: '考程表',
    headers: ['考試日期', '開始時間', '結束時間', '考試科目', '年級代碼', '班級代號'],
    help: '日期填 YYYY-MM-DD，時間填 HH:MM。多個年級或班級以分號隔開，兩欄擇一，皆留空代表全校。只新增節次，完全相同的節次會略過。'
  },
  grades: {
    title: '年級管理',
    headers: ['年級代碼', '顯示名稱'],
    help: '以年級代碼新增或更新名稱，代碼須為 1 至 999 的整數。'
  },
  classrooms: {
    title: '考場班級與應到人數',
    headers: ['班級代號', '年級代碼', '班級名稱', '應到人數'],
    help: '以班級代號新增或更新考場。年級代碼須先在年級管理設定。'
  },
  invigilation: {
    title: '監考排班',
    headers: ['班級代號', '教師帳號', '考試日期', '開始時間', '考試科目'],
    help: '填教師的登入帳號。日期、開始時間與科目皆留空表示考場預設，三欄皆填則指派指定節次。教師帳號留空會解除該筆指派。'
  }
} as const;

export type ExamImportKind = keyof typeof examImports;
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 256 * 1024;

export interface ExamImportRow {
  line: number;
  action: '新增' | '更新' | '略過';
  summary: string;
}

export interface ExamImportPreview {
  version: string;
  rows: ExamImportRow[];
}
