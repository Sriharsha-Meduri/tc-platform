'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Loader2, AlertCircle, CheckCircle, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ManualPlacementField {
  documentId: string;
  fieldId: string;
  fieldLabel: string;
  fieldType: 'signature' | 'initials' | 'date' | 'name' | 'checkbox' | 'text';
  docuSignTabType: string;
  recommendedRecipientRole: string;
  formCode: string;
  pageNumber: number;
  confidence: 'low';
}

export interface PlacedField {
  field: ManualPlacementField;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  placed: PlacedField[];
  onPlace: (placed: PlacedField[]) => void;
  documentId: string;
  formCode: string;
  totalPages: number;
  pageImageUrl: (pageNum: number) => string;
  transactionId: string;
  fields: ManualPlacementField[];
}

const TAB_SIZES: Record<string, { w: number; h: number }> = {
  signHere: { w: 200, h: 32 },
  initialHere: { w: 80, h: 24 },
  dateSigned: { w: 120, h: 24 },
  fullName: { w: 200, h: 24 },
  checkbox: { w: 20, h: 20 },
  text: { w: 200, h: 24 },
};

export default function ManualPlacementModal({
  open,
  onClose,
  placed,
  onPlace,
  documentId,
  formCode,
  totalPages,
  pageImageUrl,
  fields,
  transactionId,
}: Props) {
  const [currentPage, setCurrentPage] = useState(fields[0]?.pageNumber ?? 1);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentField = fields[currentFieldIndex];
  const tabSize = TAB_SIZES[currentField?.docuSignTabType ?? 'signHere'];

  const getImageCoords = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;

    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Convert from image pixels to PDF points (150 DPI → 72 DPI)
    const dpiScale = 72 / 150;
    return {
      x: Math.round(x * dpiScale),
      y: Math.round(y * dpiScale),
    };
  }, []);

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    if (!currentField) return;
    const coords = getImageCoords(e.clientX, e.clientY);
    if (!coords) return;

    const newPlaced = [...placed];
    const existingIndex = newPlaced.findIndex((p) => p.field.fieldId === currentField.fieldId);
    const entry: PlacedField = {
      field: currentField,
      x: coords.x,
      y: coords.y,
      width: tabSize.w,
      height: tabSize.h,
    };

    if (existingIndex >= 0) {
      newPlaced[existingIndex] = entry;
    } else {
      newPlaced.push(entry);
    }

    onPlace(newPlaced);

    // Advance to next field or finish
    if (currentFieldIndex < fields.length - 1) {
      const next = fields[currentFieldIndex + 1];
      setCurrentFieldIndex(currentFieldIndex + 1);
      setCurrentPage(next.pageNumber);
    }
  }, [currentField, currentFieldIndex, fields, placed, onPlace, getImageCoords, tabSize]);

  const handleSaveSharedCoordinates = async () => {
    if (placed.length === 0) return;
    setSaving(true);
    setSaveError(null);

    try {
      for (const entry of placed) {
        await fetch('/api/v1/docusign/coordinates/shared', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formCode: entry.field.formCode,
            pageNumber: currentPage,
            fieldLabel: entry.field.fieldLabel,
            fieldType: entry.field.fieldType,
            docuSignTabType: entry.field.docuSignTabType,
            recipientRole: entry.field.recommendedRecipientRole,
            xPosition: entry.x,
            yPosition: entry.y,
            width: entry.width,
            height: entry.height,
          }),
        });
      }
      setSaved(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const placedField = placed.find((p) => p.field.fieldId === currentField?.fieldId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-2xl bg-white shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Manual Field Placement</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {formCode} — Click on the signature line for each field
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex">
          {/* Sidebar: field list */}
          <div className="w-64 shrink-0 border-r border-gray-100 p-4 space-y-1.5 max-h-[calc(94vh-80px)] overflow-y-auto">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Fields ({fields.length})
            </p>
            {fields.map((f, i) => {
              const isPlaced = placed.some((p) => p.field.fieldId === f.fieldId);
              const isActive = i === currentFieldIndex;
              return (
                <button
                  key={f.fieldId}
                  onClick={() => {
                    setCurrentFieldIndex(i);
                    setCurrentPage(f.pageNumber);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                    isActive
                      ? 'bg-blue-50 border border-blue-200 text-blue-800'
                      : isPlaced
                        ? 'bg-green-50 border border-green-200 text-green-800'
                        : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {isPlaced ? (
                      <CheckCircle size={12} className="text-green-600 shrink-0" />
                    ) : (
                      <AlertCircle size={12} className="text-amber-600 shrink-0" />
                    )}
                    <span className="font-medium">{f.fieldLabel}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {f.recommendedRecipientRole} · Page {f.pageNumber}
                  </div>
                </button>
              );
            })}

            {/* Save button */}
            {placed.length > 0 && !saved && (
              <button
                onClick={handleSaveSharedCoordinates}
                disabled={saving}
                className="w-full mt-4 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-1">
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </span>
                ) : (
                  `Save ${placed.length} Coordinate${placed.length > 1 ? 's' : ''}`
                )}
              </button>
            )}

            {saved && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle size={12} />
                  Saved to shared library
                </p>
              </div>
            )}

            {saveError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs text-red-700">{saveError}</p>
              </div>
            )}
          </div>

          {/* Main: page viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(1, currentPage - 1);
                    setCurrentPage(next);
                  }}
                  disabled={currentPage <= 1}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-gray-600 font-medium">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(totalPages, currentPage + 1);
                    setCurrentPage(next);
                  }}
                  disabled={currentPage >= totalPages}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-xs text-gray-500 w-10 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            </div>

            {/* Page image */}
            <div
              ref={containerRef}
              className="flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-4 relative"
              style={{ cursor: currentField ? 'crosshair' : 'default' }}
              onClick={handleImageClick}
            >
              {!imageLoaded && !imageError && (
                <div className="flex items-center gap-2 py-16 text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading page...</span>
                </div>
              )}

              {imageError && (
                <div className="flex items-center gap-2 py-16 text-red-500">
                  <AlertCircle size={16} />
                  <span className="text-sm">Unable to load page preview</span>
                </div>
              )}

              <div className="relative" style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}>
                <img
                  ref={imgRef}
                  src={pageImageUrl(currentPage)}
                  alt={`Page ${currentPage}`}
                  className="max-w-full shadow-lg"
                  style={{ opacity: imageLoaded ? 1 : 0 }}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                  draggable={false}
                />

                {/* Render placed markers */}
                {placed
                  .filter((p) => p.field.pageNumber === currentPage)
                  .map((p, i) => {
                    // Convert PDF points back to image pixels for overlay
                    const dpiScale = 150 / 72;
                    const px = p.x * dpiScale;
                    const py = p.y * dpiScale;
                    const pw = p.width * dpiScale;
                    const ph = p.height * dpiScale;

                    const isActive = p.field.fieldId === currentField?.fieldId;

                    return (
                      <div
                        key={p.field.fieldId}
                        className={cn(
                          'absolute border-2 rounded pointer-events-none',
                          isActive ? 'border-blue-500 bg-blue-500/20' : 'border-green-500 bg-green-500/10',
                        )}
                        style={{
                          left: px,
                          top: py,
                          width: pw,
                          height: ph,
                        }}
                      >
                        <span
                          className={cn(
                            'absolute -top-5 left-0 text-[9px] font-semibold whitespace-nowrap px-1 rounded',
                            isActive ? 'bg-blue-500 text-white' : 'bg-green-500 text-white',
                          )}
                        >
                          {p.field.fieldLabel}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Current field instruction */}
            {currentField && (
              <div className="px-4 py-2 border-t border-gray-100 bg-blue-50 flex items-center gap-2">
                <AlertCircle size={14} className="text-blue-600 shrink-0" />
                <span className="text-xs text-blue-800">
                  Click anywhere on the page to place{' '}
                  <strong>{currentField.fieldLabel}</strong>{' '}
                  for <strong>{currentField.recommendedRecipientRole}</strong>
                  {placedField && ' (repositioned)'}
                </span>
              </div>
            )}

            {!currentField && (
              <div className="px-4 py-2 border-t border-gray-100 bg-green-50 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-600 shrink-0" />
                <span className="text-xs text-green-800">
                  All {fields.length} field{fields.length > 1 ? 's' : ''} placed. Review and close when done.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
