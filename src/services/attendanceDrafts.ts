const legacyPrefix = 'exam-attendance-draft:';
const draftPrefix = 'exam-attendance-draft-v2:';

const ownerPrefix = (owner: string) => `${draftPrefix}${encodeURIComponent(owner)}:`;

export function attendanceDraftKey(owner: string, classId: string, periodId: string) {
  return `${ownerPrefix(owner)}${JSON.stringify([classId, periodId])}`;
}

export function discardOtherAttendanceDrafts(owner?: string) {
  try {
    const storage = window.sessionStorage;
    const keep = owner ? ownerPrefix(owner) : undefined;
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && (key.startsWith(legacyPrefix) || (key.startsWith(draftPrefix) && (!keep || !key.startsWith(keep))))) {
        storage.removeItem(key);
      }
    }
  } catch { /* storage unavailable */ }
}
