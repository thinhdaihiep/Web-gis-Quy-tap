import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker to use CDN version matching the installed pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfViewerModalProps {
  isOpen: boolean;
  fileUrl: string | null;
  title?: string;
  onClose: () => void;
}

interface PdfPageCanvasProps {
  pageNumber: number;
  pdfDoc: any;
  scale: number;
  rotation: number;
}

// Single Page Canvas Component that renders upon mount or viewport visibility
const PdfPageCanvas: React.FC<PdfPageCanvasProps> = React.memo(({ pageNumber, pdfDoc, scale, rotation }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let isCancelled = false;

    const render = async () => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (_) {}
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const viewport = page.getViewport({ scale, rotation });

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          transform,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!isCancelled) {
          setIsRendered(true);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Lỗi render trang PDF ${pageNumber}:`, err);
        }
      }
    };

    render();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  return (
    <div className="flex flex-col items-center my-3 relative shadow-2xl rounded border border-slate-700/80 bg-white">
      <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded font-mono z-10 pointer-events-none select-none">
        {pageNumber}
      </div>
      <canvas ref={canvasRef} className="block rounded" />
    </div>
  );
});

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  fileUrl,
  title = 'Hồ sơ trận đánh',
  onClose,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.15);
  const [rotation, setRotation] = useState<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fileName = fileUrl ? decodeURIComponent(fileUrl.split('/').pop() || 'HoSo.pdf') : 'HoSo.pdf';

  // Load PDF Document when fileUrl changes
  useEffect(() => {
    if (!isOpen || !fileUrl) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);
    setPdfDoc(null);
    setNumPages(0);

    const proxyUrl = `/api/battles/proxy-pdf?url=${encodeURIComponent(fileUrl)}`;

    const loadingTask = pdfjsLib.getDocument({
      url: proxyUrl,
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Lỗi khi nạp tài liệu PDF:', err);
        setErrorMessage(err.message || 'Không thể tải hoặc giải mã file PDF này.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      try {
        loadingTask.destroy();
      } catch (_) {}
    };
  }, [isOpen, fileUrl]);

  if (!isOpen || !fileUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Generate page list array [1, 2, ..., numPages]
  const pageList = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-[6000] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-1 sm:p-3 animate-in fade-in duration-200">
      <div
        className={`bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[92vh]'
        }`}
      >
        {/* Header */}
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h3 className="font-bold text-sm text-slate-100 truncate" title={title}>
                {title}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate" title={fileName}>
                {fileName} {numPages > 0 ? `(${numPages} trang)` : ''}
              </p>
            </div>
          </div>

          {/* Action buttons (Đã bỏ nút Mở tab mới theo yêu cầu) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Tải về */}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              title="Tải file PDF về máy tính"
            >
              <Download className="w-4 h-4" />
              <span>Tải về</span>
            </button>

            {/* Phóng to toàn màn hình modal */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Đóng */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Đóng cửa sổ xem hồ sơ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Floating / Embedded PDF Controls Bar */}
        {!isLoading && !errorMessage && numPages > 0 && (
          <div className="bg-slate-800/95 border-b border-slate-700/60 px-4 py-1.5 flex items-center justify-between text-xs text-slate-200 shrink-0 gap-2">
            <div className="text-[11px] text-slate-300 font-medium">
              Chế độ cuộn dọc: <span className="text-white font-bold">{numPages}</span> trang
            </div>

            {/* Zoom & Rotation Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="p-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-40 cursor-pointer transition"
                title="Thu nhỏ"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-[11px] px-1 min-w-[45px] text-center select-none font-bold">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="p-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-40 cursor-pointer transition"
                title="Phóng to"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-slate-700 mx-1" />
              <button
                type="button"
                onClick={handleRotate}
                className="p-1 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer transition"
                title="Xoay các trang 90 độ"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PDF Viewer Body: Cuộn dọc liên tục từ trang 1 đến N */}
        <div
          ref={scrollContainerRef}
          className="relative flex-1 bg-slate-950/90 overflow-y-auto overflow-x-auto p-4 flex flex-col items-center"
        >
          {isLoading && (
            <div className="my-auto flex flex-col items-center justify-center text-slate-300 gap-2 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Đang nạp các trang tài liệu PDF...</span>
            </div>
          )}

          {errorMessage && (
            <div className="my-auto flex flex-col items-center justify-center p-6 text-center max-w-md text-slate-300 gap-3">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-full">
                <FileText className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold">{errorMessage}</p>
              <p className="text-xs text-slate-400">Bạn có thể tải file về máy để mở trực tiếp.</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải về máy</span>
                </button>
              </div>
            </div>
          )}

          {/* Danh sách các trang cuộn dọc liên tục từ 1 đến N */}
          {!isLoading && !errorMessage && pdfDoc && (
            <div className="flex flex-col items-center w-full max-w-full pb-8">
              {pageList.map((pageNum) => (
                <PdfPageCanvas
                  key={`${pageNum}-${rotation}`}
                  pageNumber={pageNum}
                  pdfDoc={pdfDoc}
                  scale={scale}
                  rotation={rotation}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
