/**
 * Utility functions to format and parse Date fields for GIS features
 * Ensures integers (timestamps like 1782864000000, or YYYYMMDD) are displayed
 * nicely as DD/MM/YYYY on the UI while preserving the numeric type when saving.
 */

/**
 * Checks if a property key or alias corresponds to a Date / Time field
 */
export function isDateField(key: string, aliasLabel?: string): boolean {
  if (!key) return false;
  const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanAlias = (aliasLabel || '').toLowerCase();

  const dateKeys = [
    'capnhat',
    'ngaycapnhat',
    'tgcapnhat',
    'thoigian',
    'ngaysinh',
    'ngaymat',
    'ngayhysinh',
    'hysinh',
    'namsinh',
    'thanhlap',
    'namthanhlap',
    'date',
    'datetime',
    'updatedat',
    'createdat',
  ];

  if (dateKeys.includes(cleanKey)) return true;

  if (
    cleanAlias.includes('tg cập nhật') ||
    cleanAlias.includes('cập nhật') ||
    cleanAlias.includes('ngày sinh') ||
    cleanAlias.includes('ngày mất') ||
    cleanAlias.includes('hy sinh') ||
    cleanAlias.includes('năm sinh') ||
    cleanAlias.includes('thời gian') ||
    cleanAlias.includes('thành lập')
  ) {
    return true;
  }

  return false;
}

/**
 * Formats integer dates, timestamps, or date strings for friendly display on UI (DD/MM/YYYY)
 */
export function formatDateForDisplay(val: any, fieldKey?: string, aliasLabel?: string): string {
  if (val === null || val === undefined || val === '') return '';

  const str = String(val).trim();
  if (!str) return '';

  const isExplicitDate = fieldKey ? isDateField(fieldKey, aliasLabel) : false;

  // 1. If it is already formatted like DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(str)) {
    return str.replace(/-/g, '/');
  }

  // 2. If it is an ISO Date string YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  // Check if numerical
  const num = Number(val);
  if (!isNaN(num)) {
    // A. 13-digit Unix timestamp in milliseconds (e.g. 1782864000000 -> 01/07/2026)
    if (num >= 1000000000000 && num <= 3000000000000) {
      const d = new Date(num);
      if (!isNaN(d.getTime())) {
        // Use UTC date if hours/minutes are 0 in UTC to prevent timezone day shift
        const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
        const day = String(isMidnightUtc ? d.getUTCDate() : d.getDate()).padStart(2, '0');
        const month = String((isMidnightUtc ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
        const year = isMidnightUtc ? d.getUTCFullYear() : d.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }

    // B. 10-digit Unix timestamp in seconds
    if (num >= 1000000000 && num <= 3000000000 && isExplicitDate) {
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) {
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      }
    }

    // C. 8-digit Integer YYYYMMDD (e.g., 19720430 -> 30/04/1972)
    if (num >= 10000101 && num <= 99991231) {
      const s = String(num);
      const year = s.substring(0, 4);
      const month = s.substring(4, 6);
      const day = s.substring(6, 8);
      const mNum = Number(month);
      const dNum = Number(day);
      if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
        return `${day}/${month}/${year}`;
      }
    }

    // D. 6-digit Integer YYYYMM (e.g., 197204 -> 04/1972)
    if (num >= 180001 && num <= 210012 && isExplicitDate) {
      const s = String(num);
      const year = s.substring(0, 4);
      const month = s.substring(4, 6);
      const mNum = Number(month);
      if (mNum >= 1 && mNum <= 12) {
        return `${month}/${year}`;
      }
    }

    // E. 4-digit Year YYYY (e.g., 1968)
    if (num >= 1800 && num <= 2100 && isExplicitDate) {
      return String(num);
    }
  }

  return str;
}

/**
 * Converts a date value (from input or display format) back to ISO string for standard <input type="date">
 */
export function toHtmlDateInputValue(val: any, fieldKey?: string, aliasLabel?: string): string {
  if (val === null || val === undefined || val === '') return '';

  const num = Number(val);
  if (!isNaN(num)) {
    // 13-digit ms
    if (num >= 1000000000000 && num <= 3000000000000) {
      const d = new Date(num);
      if (!isNaN(d.getTime())) {
        const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
        const day = String(isMidnightUtc ? d.getUTCDate() : d.getDate()).padStart(2, '0');
        const month = String((isMidnightUtc ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
        const year = isMidnightUtc ? d.getUTCFullYear() : d.getFullYear();
        return `${year}-${month}-${day}`;
      }
    }
    // 8-digit YYYYMMDD
    if (num >= 10000101 && num <= 99991231) {
      const s = String(num);
      return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
    }
  }

  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return '';
}

/**
 * Converts user-edited date string back to database storage value (preserving number/integer format).
 */
export function parseDateInputToStorageValue(
  inputVal: string,
  originalVal?: any,
  fieldKey?: string
): any {
  const trimmed = (inputVal || '').trim();
  if (!trimmed) return '';

  const cleanKey = (fieldKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isCapNhatField = cleanKey === 'capnhat' || cleanKey === 'ngaycapnhat' || cleanKey === 'tgcapnhat';

  // Check if input is YYYY-MM-DD (from datepicker)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yStr, mStr, dStr] = trimmed.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);

    // If original was timestamp ms (13-digit) or if it is CapNhat field:
    if (
      isCapNhatField ||
      (typeof originalVal === 'number' && originalVal >= 1000000000000) ||
      originalVal === 1782864000000 ||
      originalVal === 1767744000000
    ) {
      return Date.UTC(y, m - 1, d, 0, 0, 0);
    }

    // If original was 8-digit YYYYMMDD
    if (typeof originalVal === 'number' && originalVal >= 10000101 && originalVal <= 99991231) {
      return Number(`${yStr}${mStr}${dStr}`);
    }

    // If original was a number
    if (typeof originalVal === 'number') {
      return Date.UTC(y, m - 1, d, 0, 0, 0);
    }

    return trimmed;
  }

  // Check if input is DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [dStr, mStr, yStr] = trimmed.split('/');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);

    if (
      isCapNhatField ||
      (typeof originalVal === 'number' && originalVal >= 1000000000000) ||
      originalVal === 1782864000000 ||
      originalVal === 1767744000000
    ) {
      return Date.UTC(y, m - 1, d, 0, 0, 0);
    }

    if (typeof originalVal === 'number' && originalVal >= 10000101 && originalVal <= 99991231) {
      return Number(`${yStr}${mStr.padStart(2, '0')}${dStr.padStart(2, '0')}`);
    }

    if (typeof originalVal === 'number') {
      return Date.UTC(y, m - 1, d, 0, 0, 0);
    }

    return trimmed;
  }

  // If input is purely a number (like manually typing 1782864000000 or 19720430)
  if (!isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  return trimmed;
}
