export interface ParsedCoordinate {
  lat: number;
  lng: number;
}

/**
 * Intelligent Coordinate Parser supporting:
 * - Decimal Degrees with N/S, E/W or signs: 16.047079° N, 108.206230° E
 * - DMS (Degrees, Minutes, Seconds): 16° 02' 49.5" N, 108° 12' 22.4" E
 * - Degrees Decimal Minutes: 16° 02.825' N, 108° 12.373' E
 * - Raw pairs: 16.047079, 108.206230 or 108.206230, 16.047079 (Auto-detects Lat vs Lng)
 */
export function parseCoordinates(input: string): ParsedCoordinate | null {
  if (!input || !input.trim()) return null;

  let str = input.trim();

  // Normalize degree/minute/second symbols and whitespace
  str = str
    .replace(/[º˚˚°]/g, '°')
    .replace(/[′'’`\u2018\u2019]/g, "'")
    .replace(/[″"”\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ');

  // 1. Check if both N/S and E/W direction tags exist
  const hasLatDir = /[NS]/i.test(str);
  const hasLngDir = /[EW]/i.test(str);

  if (hasLatDir && hasLngDir) {
    const latMatch = str.match(/([+-]?\d+[\d\s°'".dms-]*\s*[NS])/i);
    const lngMatch = str.match(/([+-]?\d+[\d\s°'".dms-]*\s*[EW])/i);

    if (latMatch && lngMatch) {
      const latVal = parseSingleCoordPart(latMatch[1]);
      const lngVal = parseSingleCoordPart(lngMatch[1]);

      if (latVal !== null && lngVal !== null && isValidLatLng(latVal, lngVal)) {
        return { lat: latVal, lng: lngVal };
      }
    }
  }

  // 2. Try splitting by common delimiters: comma, semicolon, slash, or pipe
  const parts = str.split(/[,;\/|]+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 2) {
    const val1 = parseSingleCoordPart(parts[0]);
    const val2 = parseSingleCoordPart(parts[1]);

    if (val1 !== null && val2 !== null) {
      return resolveLatArray(val1, val2);
    }
  }

  // 3. Fallback: extract all numbers in the string
  const numberTokens = str.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number);
  if (numberTokens && numberTokens.length > 0) {
    if (numberTokens.length === 2) {
      // e.g. [16.047079, 108.206230]
      return resolveLatArray(numberTokens[0], numberTokens[1]);
    } else if (numberTokens.length === 6) {
      // 6 numbers e.g. [16, 2, 49.5, 108, 12, 22.4] -> DMS
      const latVal = dmsToDecimal(numberTokens[0], numberTokens[1], numberTokens[2]);
      const lngVal = dmsToDecimal(numberTokens[3], numberTokens[4], numberTokens[5]);
      return resolveLatArray(latVal, lngVal);
    } else if (numberTokens.length === 4) {
      // 4 numbers e.g. [16, 2.825, 108, 12.373] -> DDM
      const latVal = dmsToDecimal(numberTokens[0], numberTokens[1], 0);
      const lngVal = dmsToDecimal(numberTokens[2], numberTokens[3], 0);
      return resolveLatArray(latVal, lngVal);
    }
  }

  return null;
}

function parseSingleCoordPart(part: string): number | null {
  if (!part) return null;
  const clean = part.trim();
  const dirMatch = clean.match(/[NSEW]/i);
  const dir = dirMatch ? dirMatch[0].toUpperCase() : null;

  // Remove N/S/E/W chars for numeric parsing
  const numPart = clean.replace(/[NSEW]/gi, '').trim();

  // Pattern A: DMS (16°02'49.5" or 16 02 49.5 or 16d 02m 49.5s)
  const dmsRegex = /^([+-]?\d+)[°d\s-]+(\d+)[′'m\s-]+(\d+(?:\.\d+)?)[″"s]?$/i;
  const dmsMatch = numPart.match(dmsRegex);
  let decimalVal: number | null = null;

  if (dmsMatch) {
    const d = parseFloat(dmsMatch[1]);
    const m = parseFloat(dmsMatch[2]);
    const s = parseFloat(dmsMatch[3]);
    decimalVal = dmsToDecimal(d, m, s);
  } else {
    // Pattern B: DDM (16°02.825')
    const ddmRegex = /^([+-]?\d+)[°d\s-]+(\d+(?:\.\d+)?)[′'m]?$/i;
    const ddmMatch = numPart.match(ddmRegex);
    if (ddmMatch) {
      const d = parseFloat(ddmMatch[1]);
      const m = parseFloat(ddmMatch[2]);
      decimalVal = dmsToDecimal(d, m, 0);
    } else {
      // Pattern C: Plain float (16.047079 or -16.047079)
      const numMatch = numPart.match(/[+-]?\d+(?:\.\d+)?/);
      if (numMatch) {
        decimalVal = parseFloat(numMatch[0]);
      }
    }
  }

  if (decimalVal === null || isNaN(decimalVal)) return null;

  if (dir === 'S' || dir === 'W') {
    decimalVal = -Math.abs(decimalVal);
  } else if (dir === 'N' || dir === 'E') {
    decimalVal = Math.abs(decimalVal);
  }

  return decimalVal;
}

function dmsToDecimal(deg: number, min: number, sec: number): number {
  const sign = deg < 0 || Object.is(deg, -0) ? -1 : 1;
  const absDeg = Math.abs(deg);
  return sign * (absDeg + min / 60 + sec / 3600);
}

function resolveLatArray(val1: number, val2: number): ParsedCoordinate | null {
  // Case 1: val1 is clearly Longitude (> 90 or < -90) and val2 is Latitude
  if (Math.abs(val1) > 90 && Math.abs(val1) <= 180 && Math.abs(val2) <= 90) {
    return { lat: val2, lng: val1 };
  }

  // Case 2: val2 is clearly Longitude (> 90 or < -90) and val1 is Latitude
  if (Math.abs(val2) > 90 && Math.abs(val2) <= 180 && Math.abs(val1) <= 90) {
    return { lat: val1, lng: val2 };
  }

  // Case 3: Both are <= 90. Default order [lat, lng]
  if (isValidLatLng(val1, val2)) {
    return { lat: val1, lng: val2 };
  }

  return null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function formatDisplayCoordinate(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}
