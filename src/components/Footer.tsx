import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, MapPin, Copy, Check, Navigation } from 'lucide-react';
import { parseCoordinates, formatDisplayCoordinate } from '../utils/coordinateParser';

interface FooterProps {
  cursorLocation?: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number; accuracy?: number } | null;
  zoomLevel?: number | null;
  mapScale?: number | null;
  onGoToCoordinate?: (lat: number, lng: number) => void;
}

export const Footer: React.FC<FooterProps> = ({
  cursorLocation,
  userLocation,
  zoomLevel,
  mapScale,
  onGoToCoordinate,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [inputError, setInputError] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const activeLoc = cursorLocation || userLocation;

  // Sync input text with active location when user is not typing
  useEffect(() => {
    if (!isEditing) {
      if (activeLoc) {
        setInputText(formatDisplayCoordinate(activeLoc.lat, activeLoc.lng));
      } else {
        setInputText('');
      }
      setInputError(false);
    }
  }, [activeLoc, isEditing]);

  const handleCopyCoordinates = () => {
    let coordString = '';
    if (activeLoc) {
      coordString = formatDisplayCoordinate(activeLoc.lat, activeLoc.lng);
    } else if (inputText) {
      coordString = inputText;
    }

    if (!coordString) return;

    navigator.clipboard.writeText(coordString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFocus = () => {
    setIsEditing(true);
    setInputError(false);
    setTimeout(() => {
      inputRef.current?.select();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCoordinates();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputError(false);
      if (activeLoc) {
        setInputText(formatDisplayCoordinate(activeLoc.lat, activeLoc.lng));
      }
      inputRef.current?.blur();
    }
  };

  const submitCoordinates = () => {
    const parsed = parseCoordinates(inputText);
    if (parsed) {
      setInputError(false);
      setIsEditing(false);
      setInputText(formatDisplayCoordinate(parsed.lat, parsed.lng));
      inputRef.current?.blur();

      if (onGoToCoordinate) {
        onGoToCoordinate(parsed.lat, parsed.lng);
      }
    } else {
      // Invalid format -> Highlight error & select all text
      setInputError(true);
      inputRef.current?.select();
    }
  };

  const handleBlur = () => {
    // If input is empty or invalid, revert to active location
    setTimeout(() => {
      setIsEditing(false);
      const parsed = parseCoordinates(inputText);
      if (parsed) {
        setInputText(formatDisplayCoordinate(parsed.lat, parsed.lng));
      } else if (activeLoc) {
        setInputText(formatDisplayCoordinate(activeLoc.lat, activeLoc.lng));
        setInputError(false);
      }
    }, 150);
  };

  return (
    <footer className="h-7 bg-slate-900 text-slate-200 border-t border-slate-800 flex items-center justify-between px-4 text-[11px] shrink-0 z-[3000] font-medium">
      {/* Left side: Coordinates */}
      <div className="flex items-center gap-4">
        {/* Cursor Coordinates Interactive Input */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors ${
            inputError
              ? 'bg-red-950/80 border-red-500/80 text-red-200'
              : isEditing
              ? 'bg-slate-800 border-blue-500 text-white ring-1 ring-blue-500/50'
              : 'bg-slate-800/80 border-slate-700/60 text-slate-200'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-[10px] text-slate-400 uppercase font-semibold hidden sm:inline shrink-0">
            Tọa độ:
          </span>

          <div className="relative flex items-center min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setInputError(false);
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tọa độ WGS84..."
              className={`font-mono text-[11px] font-bold bg-transparent outline-none w-[180px] sm:w-[280px] transition-colors ${
                inputError
                  ? 'text-red-300 placeholder-red-400/60'
                  : 'text-emerald-400 focus:text-white'
              }`}
              title="Nhấn Enter để di chuyển đến tọa độ. Hỗ trợ Độ thập phân & DMS."
            />
          </div>

          <span className="text-[9px] font-mono text-slate-300 bg-slate-700 px-1 rounded shrink-0 hidden sm:inline">
            WGS 84
          </span>

          {/* Jump Button when editing */}
          {isEditing && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent input blur before click
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
              title="Sao chép chuỗi tọa độ (bao gồm ° và N, E) vào Clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400 font-bold px-0.5">Đã chép</span>
                </>
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right side: Scale & Copyright */}
      <div className="flex gap-2 sm:gap-4 items-center text-[10px] text-slate-400 shrink-0">
        <span className="hidden sm:inline">
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
        <span className="hidden lg:inline">© 2026 Ban Bản đồ/Phòng Tác chiến Quân khu 5</span>
      </div>
    </footer>
  );
};
