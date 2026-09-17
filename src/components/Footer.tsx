import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, Copy, Check, Navigation, ChevronDown } from 'lucide-react';
import {
  smartParseCoordinateInput,
  convertWGS84ToTargetCRS,
  SmartCoordinateResult,
} from '../utils/coordinateParser';

export type DisplayCRSMode = '4326' | '3405' | '3406';

interface FooterProps {
  cursorLocation?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
  zoomLevel?: number | null;
  mapScale?: number | null;
  selectedCRS?: DisplayCRSMode;
  onCRSChange?: (crs: DisplayCRSMode) => void;
  onGoToCoordinate?: (lat: number, lng: number, crsMode?: DisplayCRSMode) => void;
}

export const Footer: React.FC<FooterProps> = ({
  cursorLocation,
  userLocation,
  zoomLevel,
  mapScale,
  selectedCRS: parentSelectedCRS,
  onCRSChange,
  onGoToCoordinate,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [inputError, setInputError] = useState<boolean>(false);

  // Selected display CRS: '4326' (WGS84) | '3405' (VN-2000 z48) | '3406' (VN-2000 z49)
  const [activeCRS, setActiveCRS] = useState<DisplayCRSMode>(parentSelectedCRS || '4326');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [smartStatus, setSmartStatus] = useState<SmartCoordinateResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<any>(null);

  const activeLoc = cursorLocation || userLocation;

  // Sync external CRS changes if controlled from parent
  useEffect(() => {
    if (parentSelectedCRS && parentSelectedCRS !== activeCRS) {
      setActiveCRS(parentSelectedCRS);
    }
  }, [parentSelectedCRS]);

  const updateActiveCRS = (newCRS: DisplayCRSMode) => {
    setActiveCRS(newCRS);
    if (onCRSChange) {
      onCRSChange(newCRS);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When not editing, format active cursor or user location based on current activeCRS
  useEffect(() => {
    if (!isEditing) {
      if (activeLoc) {
        const converted = convertWGS84ToTargetCRS(activeLoc.lat, activeLoc.lng, activeCRS);
        setInputText(converted.formatted);
        // Sync badge state with current CRS
        if (activeCRS === '4326') {
          setSmartStatus({
            crs: '4326',
            status: 'wgs84',
            badgeLabel: 'WGS84',
            badgeColorClass: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-400 font-semibold',
            textColorClass: 'text-emerald-400',
            lat: activeLoc.lat,
            lng: activeLoc.lng,
            formattedDisplay: converted.formatted,
          });
        } else if (activeCRS === '3405') {
          setSmartStatus({
            crs: '3405',
            status: 'vn2000_z48',
            badgeLabel: 'VN-2000 z48',
            badgeColorClass: 'border-amber-500/40 bg-amber-950/50 text-amber-400 font-semibold',
            textColorClass: 'text-amber-400',
            lat: activeLoc.lat,
            lng: activeLoc.lng,
            formattedDisplay: converted.formatted,
          });
        } else {
          setSmartStatus({
            crs: '3406',
            status: 'vn2000_z49',
            badgeLabel: 'VN-2000 z49',
            badgeColorClass: 'border-amber-500/40 bg-amber-950/50 text-amber-400 font-semibold',
            textColorClass: 'text-amber-400',
            lat: activeLoc.lat,
            lng: activeLoc.lng,
            formattedDisplay: converted.formatted,
          });
        }
      } else {
        setInputText('');
        setSmartStatus(null);
      }
      setInputError(false);
    }
  }, [activeLoc, isEditing, activeCRS]);

  // Real-time smart detection while the user types in the input box
  const handleInputChange = (val: string) => {
    setInputText(val);
    setInputError(false);

    if (!val.trim()) {
      setSmartStatus(null);
      return;
    }

    const detected = smartParseCoordinateInput(val);
    setSmartStatus(detected);

    // If successfully recognized unequivocally, auto-switch active CRS
    if (detected.crs === '4326') {
      updateActiveCRS('4326');
    } else if (detected.crs === '3405') {
      updateActiveCRS('3405');
    } else if (detected.crs === '3406') {
      updateActiveCRS('3406');
    }
  };

  const handleCopyCoordinates = () => {
    let coordString = '';
    if (inputText) {
      coordString = inputText;
    } else if (activeLoc) {
      const converted = convertWGS84ToTargetCRS(activeLoc.lat, activeLoc.lng, activeCRS);
      coordString = converted.formatted;
    }

    if (!coordString) return;

    navigator.clipboard.writeText(coordString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setIsEditing(true);
    setInputError(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCoordinates();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputError(false);
      setIsMenuOpen(false);
      if (activeLoc) {
        const converted = convertWGS84ToTargetCRS(activeLoc.lat, activeLoc.lng, activeCRS);
        setInputText(converted.formatted);
      }
      inputRef.current?.blur();
    }
  };

  const submitCoordinates = (forcedZone?: '3405' | '3406') => {
    const parsed = smartParseCoordinateInput(inputText, forcedZone);
    setSmartStatus(parsed);

    if (parsed.crs === 'unknown') {
      setInputError(true);
      return;
    }

    if (parsed.crs === 'ambiguous_vn2000' && !forcedZone) {
      // Both z48 and z49 are valid. Stay on ambiguous state, highlight red text & show quick [48] [49] buttons right at input box
      setInputError(true);
      return;
    }

    // Success! Update active system and format text
    const effectiveCRS: DisplayCRSMode = parsed.crs === '3406' ? '3406' : parsed.crs === '3405' ? '3405' : '4326';
    updateActiveCRS(effectiveCRS);
    setInputError(false);
    setIsEditing(false);
    setIsMenuOpen(false);

    if (parsed.lat !== null && parsed.lng !== null) {
      const converted = convertWGS84ToTargetCRS(parsed.lat, parsed.lng, effectiveCRS);
      setInputText(converted.formatted);
      inputRef.current?.blur();

      if (onGoToCoordinate) {
        onGoToCoordinate(parsed.lat, parsed.lng, effectiveCRS);
      }
    }
  };

  const handleSelectAmbiguousZone = (zone: '3405' | '3406') => {
    submitCoordinates(zone);
  };

  const handleBlur = () => {
    // If the CRS dropdown menu is open, DO NOT reset or exit edit mode
    if (isMenuOpen) {
      return;
    }

    blurTimeoutRef.current = setTimeout(() => {
      setIsEditing(false);
      if (inputError && activeLoc) {
        const converted = convertWGS84ToTargetCRS(activeLoc.lat, activeLoc.lng, activeCRS);
        setInputText(converted.formatted);
        setInputError(false);
      }
    }, 250);
  };

  /**
   * Handle user picking a CRS from dropdown.
   * If there is coordinate input currently typed, convert/parse it using the selected CRS!
   * Do NOT wipe out the typed coordinate.
   * Do NOT force focus or select all text.
   */
  const handleSelectCRS = (newCRS: DisplayCRSMode) => {
    updateActiveCRS(newCRS);
    setIsMenuOpen(false);

    // If user has input text, try parsing with the chosen CRS
    if (inputText.trim()) {
      const parsed = smartParseCoordinateInput(
        inputText,
        newCRS === '4326' ? '4326' : newCRS
      );

      if (parsed.crs !== 'unknown' && parsed.lat !== null && parsed.lng !== null) {
        // Successfully parsed in this chosen CRS! Keep coordinates and format to this CRS
        setSmartStatus(parsed);
        setInputError(false);
        const converted = convertWGS84ToTargetCRS(parsed.lat, parsed.lng, newCRS);
        setInputText(converted.formatted);
        return;
      }
    }

    // If input is empty or just cursor location, format cursor location
    if (activeLoc) {
      const converted = convertWGS84ToTargetCRS(activeLoc.lat, activeLoc.lng, newCRS);
      setInputText(converted.formatted);
    }
  };

  // Determine current badge presentation
  const getBadgeDetails = () => {
    if (isEditing && smartStatus) {
      return {
        label: smartStatus.badgeLabel,
        colorClass: smartStatus.badgeColorClass,
        textColorClass: smartStatus.textColorClass,
      };
    }

    // Default or active state
    if (activeCRS === '4326') {
      return {
        label: 'WGS84',
        colorClass: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-400 font-semibold',
        textColorClass: 'text-emerald-400',
      };
    } else if (activeCRS === '3405') {
      return {
        label: 'VN-2000 z48',
        colorClass: 'border-amber-500/40 bg-amber-950/60 text-amber-400 font-semibold',
        textColorClass: 'text-amber-400',
      };
    } else {
      return {
        label: 'VN-2000 z49',
        colorClass: 'border-amber-500/40 bg-amber-950/60 text-amber-400 font-semibold',
        textColorClass: 'text-amber-400',
      };
    }
  };

  const badge = getBadgeDetails();

  return (
    <footer className="min-h-[28px] h-auto py-1 sm:py-0 bg-slate-900 text-slate-200 border-t border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between px-2 sm:px-4 gap-y-1 gap-x-2 text-[10px] sm:text-[11px] shrink-0 z-[3000] font-medium w-full">
      {/* Left side: Coordinates */}
      <div className="flex items-center w-full sm:w-auto">
        {/* Cursor Coordinates Interactive Input */}
        <div
          className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded border transition-colors w-full sm:w-auto ${
            inputError || badge.label.includes('?')
              ? 'bg-red-950/40 border-red-500/80 text-red-200 ring-1 ring-red-500/40'
              : isEditing
              ? 'bg-slate-800 border-blue-500 text-white ring-1 ring-blue-500/50'
              : 'bg-slate-800/80 border-slate-700/60 text-slate-200'
          }`}
        >
          <Crosshair
            className={`w-3.5 h-3.5 shrink-0 ${
              badge.label.includes('?')
                ? 'text-red-400'
                : activeCRS === '4326'
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          />
          <span className="text-[10px] text-slate-400 uppercase font-semibold hidden sm:inline shrink-0">
            Tọa độ:
          </span>

          <div className="relative flex items-center min-w-0 flex-1 sm:flex-none">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Nhập WGS84 hoặc VN-2000..."
              className={`font-mono text-[10px] sm:text-[11px] font-bold bg-transparent outline-none w-full sm:w-[220px] transition-colors min-w-[120px] ${
                inputError || badge.label.includes('?')
                  ? 'text-red-400 placeholder-red-400/60'
                  : badge.textColorClass
              }`}
              title="Tự động nhận diện: WGS84 hoặc VN-2000. Có thể nhập hậu tố ' 48' hoặc ' 49'. Nhấn Enter để bay tới."
            />

            {/* In-line Quick Zone Selector Buttons [48] [49] right at the input box when ambiguous */}
            {smartStatus?.candidates && (
              <div className="flex items-center gap-1 ml-1 shrink-0 animate-in fade-in duration-150">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectAmbiguousZone('3405')}
                  className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded border border-amber-300 transition shadow-sm cursor-pointer"
                  title="Chọn múi 48 (Kinh tuyến trục 105°)"
                >
                  [48]
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectAmbiguousZone('3406')}
                  className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded border border-amber-300 transition shadow-sm cursor-pointer"
                  title="Chọn múi 49 (Kinh tuyến trục 111°)"
                >
                  [49]
                </button>
              </div>
            )}
          </div>

          {/* Interactive CRS Selector Button & Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onMouseDown={(e) => {
                // Prevent input from losing focus / blurring immediately
                e.preventDefault();
              }}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 select-none ${badge.colorClass}`}
              title="Click để chọn hoặc chuyển đổi nhanh giữa WGS84, VN-2000 z48, VN-2000 z49"
            >
              <span>{badge.label}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-80" />
            </button>

            {/* Dropdown Menu (only shows pure CRS options, NO ambiguous zone choices here) */}
            {isMenuOpen && (
              <div
                onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking inside menu
                className="absolute left-0 sm:left-auto sm:right-0 bottom-full mb-1.5 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 text-[11px] animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                  Chọn hệ toạ độ
                </div>

                {/* Option 1: WGS84 */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectCRS('4326')}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-slate-700/70 transition cursor-pointer ${
                    activeCRS === '4326' ? 'text-emerald-400 font-bold bg-slate-700/40' : 'text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    WGS-84 (Long/Lat)
                  </span>
                  {activeCRS === '4326' && <Check className="w-3 h-3 text-emerald-400" />}
                </button>

                {/* Option 2: VN-2000 z48 */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectCRS('3405')}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-slate-700/70 transition cursor-pointer ${
                    activeCRS === '3405' ? 'text-amber-400 font-bold bg-slate-700/40' : 'text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    VN-2000 (Múi 48)
                  </span>
                  {activeCRS === '3405' && <Check className="w-3 h-3 text-amber-400" />}
                </button>

                {/* Option 3: VN-2000 z49 */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectCRS('3406')}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-slate-700/70 transition cursor-pointer ${
                    activeCRS === '3406' ? 'text-amber-400 font-bold bg-slate-700/40' : 'text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    VN-2000 (Múi 49)
                  </span>
                  {activeCRS === '3406' && <Check className="w-3 h-3 text-amber-400" />}
                </button>
              </div>
            )}
          </div>

          {/* Jump Button when editing */}
          {isEditing && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                submitCoordinates();
              }}
              className="p-0.5 text-blue-400 hover:text-white hover:bg-blue-600 rounded transition cursor-pointer shrink-0"
              title="Di chuyển đến tọa độ này (Enter)"
            >
              <Navigation className="w-3 h-3 fill-current" />
            </button>
          )}

          {/* Copy Coordinates Button */}
          {(activeLoc || inputText) && !isEditing && (
            <button
              type="button"
              onClick={handleCopyCoordinates}
              className="ml-0.5 p-0.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition cursor-pointer flex items-center gap-0.5 shrink-0"
              title="Sao chép chuỗi tọa độ vào Clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400 font-bold px-0.5 hidden sm:inline">Đã chép</span>
                </>
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right side: Scale & Copyright */}
      <div className="flex gap-2 sm:gap-4 items-center text-[9px] sm:text-[10px] text-slate-400 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
        <span>
          {mapScale ? (
            <>
              Tỷ lệ 1:{mapScale.toLocaleString('vi-VN')}
              {zoomLevel !== undefined && zoomLevel !== null && (
                <span className="ml-1 text-slate-400 font-mono">(Zoom: {zoomLevel})</span>
              )}
            </>
          ) : zoomLevel !== undefined && zoomLevel !== null ? (
            `Zoom: ${zoomLevel}`
          ) : (
            'Tỷ lệ 1:5.000'
          )}
        </span>
        <span className="truncate">© 2026 Ban Bản đồ/Phòng Tác chiến QK5</span>
      </div>
    </footer>
  );
};
