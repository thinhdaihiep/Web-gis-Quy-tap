import proj4 from 'proj4';

// Ensure standard coordinate systems are registered
// EPSG:3857 - WGS 84 / Pseudo-Mercator
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs'
);

// EPSG:4326 - WGS 84 (Lon/Lat)
proj4.defs(
  'EPSG:4326',
  '+proj=longlat +datum=WGS84 +no_defs +type=crs'
);

// EPSG:3405 - VN-2000 / UTM zone 48N (Central Meridian 105°) with 7 transformation parameters
proj4.defs(
  'EPSG:3405',
  '+proj=utm +zone=48 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

// EPSG:3406 - VN-2000 / UTM zone 49N (Central Meridian 111°) with 7 transformation parameters
proj4.defs(
  'EPSG:3406',
  '+proj=utm +zone=49 +ellps=WGS84 +towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 +units=m +no_defs +type=crs'
);

proj4.defs('3405', proj4.defs('EPSG:3405'));
proj4.defs('3406', proj4.defs('EPSG:3406'));
proj4.defs('4326', proj4.defs('EPSG:4326'));

if (typeof window !== 'undefined') {
  (window as any).proj4 = proj4;
}

export type CoordinateSystemId = '4326' | '3405' | '3406' | 'ambiguous_vn2000' | 'unknown';

export interface SmartCoordinateResult {
  crs: CoordinateSystemId;
  status: 'wgs84' | 'vn2000_z48' | 'vn2000_z49' | 'ambiguous_vn2000' | 'unknown';
  badgeLabel: string;
  badgeColorClass: string;
  textColorClass: string;
  lat: number | null;
  lng: number | null;
  vnX?: number; // Northing (7 digits)
  vnY?: number; // Easting (6 digits)
  formattedDisplay: string;
  error?: string;
  // If ambiguous between z48 and z49, store candidate points for quick 1-click toggle
  candidates?: {
    z48: { lat: number; lng: number; X: number; Y: number };
    z49: { lat: number; lng: number; X: number; Y: number };
  };
}

/**
 * Format WGS84 coordinates to minimal clean display string:
 * long lat (6 decimal places)
 */
export function formatWGS84Display(lat: number, lng: number): string {
  return `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
}

/**
 * Format VN-2000 coordinates to minimal clean display string:
 * X Y (rounded to nearest meter, no decimals, no redundant labels)
 */
export function formatVN2000Display(X: number, Y: number, zoneLabel?: string): string {
  const roundX = Math.round(X);
  const roundY = Math.round(Y);
  return `${roundX}  ${roundY}`;
}

/**
 * Convert WGS84 point to target Coordinate System
 */
export function convertWGS84ToTargetCRS(
  lat: number,
  lng: number,
  targetCRS: '4326' | '3405' | '3406'
): { formatted: string; X?: number; Y?: number; lat: number; lng: number } {
  if (targetCRS === '4326') {
    return {
      formatted: formatWGS84Display(lat, lng),
      lat,
      lng,
    };
  }

  const epsg = targetCRS === '3405' ? 'EPSG:3405' : 'EPSG:3406';
  const zoneName = targetCRS === '3405' ? 'z48' : 'z49';
  try {
    const [east, north] = proj4('EPSG:4326', epsg, [lng, lat]);
    return {
      formatted: formatVN2000Display(north, east, `VN-2000 ${zoneName}`),
      X: north,
      Y: east,
      lat,
      lng,
    };
  } catch (e) {
    return {
      formatted: formatWGS84Display(lat, lng),
      lat,
      lng,
    };
  }
}

/**
 * Intelligent Coordinate Detector based purely on numeric values & projection physics
 */
export function smartParseCoordinateInput(input: string, forcedCRS?: '4326' | '3405' | '3406' | null): SmartCoordinateResult {
  if (!input || !input.trim()) {
    return {
      crs: 'unknown',
      status: 'unknown',
      badgeLabel: '?',
      badgeColorClass: 'border-red-500/50 bg-red-950/40 text-red-400',
      textColorClass: 'text-red-400',
      lat: null,
      lng: null,
      formattedDisplay: '',
    };
  }

  let str = input.trim();

  // Check for explicit zone suffix, e.g. " 48", " 49", "z48", "z49", "m48", "m49", "[48]", "[49]"
  let detectedSuffixZone: '3405' | '3406' | null = null;
  const zoneSuffixMatch = str.match(/(?:[\s,;_\-/\[(]|^)(?:z|m|múi|zone)?\s*(48|49)(?:[\])]|\s*$)/i);
  if (zoneSuffixMatch) {
    if (zoneSuffixMatch[1] === '48') {
      detectedSuffixZone = '3405';
    } else if (zoneSuffixMatch[1] === '49') {
      detectedSuffixZone = '3406';
    }
    // Remove suffix from str so it does not interfere with coordinate token extraction
    str = str.replace(zoneSuffixMatch[0], ' ').trim();
  }

  const effectiveForcedCRS = forcedCRS || detectedSuffixZone;

  // Normalize DMS/Degree characters
  str = str
    .replace(/[º˚˚°]/g, '°')
    .replace(/[′'’`\u2018\u2019]/g, "'")
    .replace(/[″"”\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ');

  // Check for explicit direction letters (N/S, E/W) -> WGS84
  const hasLatDir = /[NS]/i.test(str);
  const hasLngDir = /[EW]/i.test(str);

  if (hasLatDir && hasLngDir) {
    const latMatch = str.match(/([+-]?\d+[\d\s°'".dms-]*\s*[NS])/i);
    const lngMatch = str.match(/([+-]?\d+[\d\s°'".dms-]*\s*[EW])/i);
    if (latMatch && lngMatch) {
      const latVal = parseSingleCoordPart(latMatch[1]);
      const lngVal = parseSingleCoordPart(lngMatch[1]);
      if (latVal !== null && lngVal !== null && isValidLatLng(latVal, lngVal)) {
        return buildWGS84Result(latVal, lngVal);
      }
    }
  }

  // Pre-process thousands separators in survey coordinates: e.g. "1,750,234.50" or "580,123.40"
  // Remove comma or period if followed by 3 digits and then another separator or end/space, but not decimal point
  // A clean way: replace commas between digits where comma is thousands separator
  const cleanedStr = str
    // Remove "X:", "Y:", "x=", "y=", "m"
    .replace(/[XYxy]\s*[:=]/g, ' ')
    .replace(/\b[m|M]\b/g, ' ')
    // Replace comma inside numbers like 1,750,234 into 1750234 (comma between 3-digit groups)
    .replace(/(\d+),(\d{3})(?=,\d{3}|\.\d+|\s|$)/g, '$1$2')
    .replace(/(\d+),(\d{3})(?=\.\d+|\s|$)/g, '$1$2');

  // Extract numeric tokens
  // Support decimal tokens or numbers separated by space, commas, semicolons, tabs, etc.
  const rawTokens = cleanedStr.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!rawTokens || rawTokens.length < 2) {
    return buildUnknownResult('?');
  }

  const tokens = rawTokens.map(Number).filter((n) => !isNaN(n));
  if (tokens.length < 2) {
    return buildUnknownResult('?');
  }

  let num1: number;
  let num2: number;

  if (tokens.length === 6) {
    // 6 tokens -> DMS (lat d-m-s, lng d-m-s)
    num1 = dmsToDecimal(tokens[0], tokens[1], tokens[2]);
    num2 = dmsToDecimal(tokens[3], tokens[4], tokens[5]);
  } else if (tokens.length === 4) {
    // 4 tokens -> DDM
    num1 = dmsToDecimal(tokens[0], tokens[1], 0);
    num2 = dmsToDecimal(tokens[2], tokens[3], 0);
  } else {
    // Extract first two significant coordinate numbers
    num1 = tokens[0];
    num2 = tokens[1];
  }

  if (isNaN(num1) || isNaN(num2)) {
    return buildUnknownResult('?');
  }

  // 1. RULE: If both x, y < 1000 => WGS84
  if (Math.abs(num1) < 1000 && Math.abs(num2) < 1000) {
    // Automatic recognition of Long / Lat without binding user order:
    // In Vietnam, Longitude is always larger than Latitude (Long: 102°..111° > Lat: 8°..24°)
    // More generally, Math.abs(Long) > Math.abs(Lat) when inside Vietnam or standard geographic bounds
    let lng: number;
    let lat: number;

    if (Math.max(num1, num2) >= 100 && Math.max(num1, num2) <= 180 && Math.min(num1, num2) <= 90) {
      lng = Math.max(num1, num2);
      lat = Math.min(num1, num2);
    } else if (isValidLatLng(num1, num2)) {
      // If neither is > 100, check absolute orientation or default
      if (Math.abs(num1) > 90 && Math.abs(num2) <= 90) {
        lng = num1;
        lat = num2;
      } else if (Math.abs(num2) > 90 && Math.abs(num1) <= 90) {
        lng = num2;
        lat = num1;
      } else {
        // Lat, Lng order by default if both <= 90
        lat = num1;
        lng = num2;
      }
    } else {
      return buildUnknownResult('?');
    }

    if (!isValidLatLng(lat, lng)) {
      return buildUnknownResult('?');
    }

    return buildWGS84Result(lat, lng);
  }

  // 2. RULE: If values >= 1000 => VN-2000
  // Identify X (Northing - 7 digits: ~900,000 to 2,650,000) and Y (Easting - 6 digits: ~150,000 to 850,000)
  const X = Math.max(num1, num2); // Larger number is Northing (X in VN survey convention)
  const Y = Math.min(num1, num2); // Smaller number is Easting (Y in VN survey convention)

  // Quick sanity check for VN-2000 UTM bounds
  if (X < 800000 || X > 2800000 || Y < 100000 || Y > 900000) {
    return buildUnknownResult('?');
  }

  // If user explicitly forced a CRS mode or typed suffix (48 / 49), respect it directly
  if (effectiveForcedCRS === '3405') {
    return computeVN2000Direct(X, Y, '3405');
  }
  if (effectiveForcedCRS === '3406') {
    return computeVN2000Direct(X, Y, '3406');
  }

  // PURE NUMERIC HYPOTHESIS TESTING (No province/region names used)
  // Compute test transformation using Zone 48 (EPSG:3405)
  let pt48: [number, number];
  let pt49: [number, number];

  try {
    pt48 = proj4('EPSG:3405', 'EPSG:4326', [Y, X]); // [lng, lat]
  } catch (e) {
    return buildUnknownResult('?');
  }

  try {
    pt49 = proj4('EPSG:3406', 'EPSG:4326', [Y, X]); // [lng, lat]
  } catch (e) {
    pt49 = [0, 0];
  }

  const [lng48, lat48] = pt48;
  const [lng49, lat49] = pt49;

  // Mathematical validity checks for Vietnam land & waters
  // Zone 48 valid longitudes: 102° to 108°
  // Zone 49 valid longitudes: 108° to 114°
  const is48ValidInZone = lng48 >= 102.0 && lng48 <= 108.0 && lat48 >= 8.0 && lat48 <= 24.5;
  const is49ValidInZone = lng49 >= 108.0 && lng49 <= 114.0 && lat49 >= 8.0 && lat49 <= 24.5;

  // Clear-cut cases based purely on Northing (X):
  // Northern VN (X >= 2,000,000): Zone 49 projects into Gulf of Tonkin/Hainan deep ocean
  // Southern VN (X <= 1,200,000): Zone 49 projects deep into South China Sea (> 300km offshore)
  if (X >= 2050000 || X <= 1180000) {
    return buildVN2000Result('3405', lat48, lng48, X, Y);
  }

  // In the central corridor (1,180,000 < X < 2,050,000):
  // If only one zone produces a valid point on Vietnam land (102° - 110.5°):
  if (is48ValidInZone && !is49ValidInZone) {
    return buildVN2000Result('3405', lat48, lng48, X, Y);
  }
  if (is49ValidInZone && !is48ValidInZone) {
    return buildVN2000Result('3406', lat49, lng49, X, Y);
  }

  // If BOTH are valid candidates in their respective zones:
  // USER MANDATE: "nếu cả 2 kết quả chuyển đổi đều hợp lệ thì mình sẽ dừng lại ở trường hợp không nhận dạng được hệ toạ độ m48 hay m48 [VN-2000 ?]"
  // Text color must turn RED
  return {
    crs: 'ambiguous_vn2000',
    status: 'ambiguous_vn2000',
    badgeLabel: 'VN-2000 ?',
    badgeColorClass: 'border-red-500/60 bg-red-950/60 text-red-400 font-bold',
    textColorClass: 'text-red-400 font-bold',
    lat: lat48, // Default preview at z48
    lng: lng48,
    vnX: X,
    vnY: Y,
    formattedDisplay: formatVN2000Display(X, Y, 'VN-2000 ?'),
    candidates: {
      z48: { lat: lat48, lng: lng48, X, Y },
      z49: { lat: lat49, lng: lng49, X, Y },
    },
  };
}

function computeVN2000Direct(X: number, Y: number, crs: '3405' | '3406'): SmartCoordinateResult {
  const epsg = crs === '3405' ? 'EPSG:3405' : 'EPSG:3406';
  try {
    const [lng, lat] = proj4(epsg, 'EPSG:4326', [Y, X]);
    return buildVN2000Result(crs, lat, lng, X, Y);
  } catch (e) {
    return buildUnknownResult('?');
  }
}

function buildWGS84Result(lat: number, lng: number): SmartCoordinateResult {
  return {
    crs: '4326',
    status: 'wgs84',
    badgeLabel: 'WGS84',
    badgeColorClass: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-400 font-semibold',
    textColorClass: 'text-emerald-400',
    lat,
    lng,
    formattedDisplay: formatWGS84Display(lat, lng),
  };
}

function buildVN2000Result(crs: '3405' | '3406', lat: number, lng: number, X: number, Y: number): SmartCoordinateResult {
  const badgeLabel = crs === '3405' ? 'VN-2000 z48' : 'VN-2000 z49';
  return {
    crs,
    status: crs === '3405' ? 'vn2000_z48' : 'vn2000_z49',
    badgeLabel,
    badgeColorClass: 'border-amber-500/40 bg-amber-950/50 text-amber-400 font-semibold',
    textColorClass: 'text-amber-400',
    lat,
    lng,
    vnX: X,
    vnY: Y,
    formattedDisplay: formatVN2000Display(X, Y, badgeLabel),
  };
}

function buildUnknownResult(badgeLabel: string): SmartCoordinateResult {
  return {
    crs: 'unknown',
    status: 'unknown',
    badgeLabel,
    badgeColorClass: 'border-red-500/50 bg-red-950/50 text-red-400 font-bold',
    textColorClass: 'text-red-400 font-bold',
    lat: null,
    lng: null,
    formattedDisplay: '',
    error: 'Không nhận dạng được toạ độ hợp lệ',
  };
}

function parseSingleCoordPart(part: string): number | null {
  if (!part) return null;
  const clean = part.trim();
  const dirMatch = clean.match(/[NSEW]/i);
  const dir = dirMatch ? dirMatch[0].toUpperCase() : null;

  const numPart = clean.replace(/[NSEW]/gi, '').trim();

  // Pattern A: DMS
  const dmsRegex = /^([+-]?\d+)[°d\s-]+(\d+)[′'m\s-]+(\d+(?:\.\d+)?)[″"s]?$/i;
  const dmsMatch = numPart.match(dmsRegex);
  let decimalVal: number | null = null;

  if (dmsMatch) {
    const d = parseFloat(dmsMatch[1]);
    const m = parseFloat(dmsMatch[2]);
    const s = parseFloat(dmsMatch[3]);
    decimalVal = dmsToDecimal(d, m, s);
  } else {
    // Pattern B: DDM
    const ddmRegex = /^([+-]?\d+)[°d\s-]+(\d+(?:\.\d+)?)[′'m]?$/i;
    const ddmMatch = numPart.match(ddmRegex);
    if (ddmMatch) {
      const d = parseFloat(ddmMatch[1]);
      const m = parseFloat(ddmMatch[2]);
      decimalVal = dmsToDecimal(d, m, 0);
    } else {
      // Pattern C: Float
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

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
