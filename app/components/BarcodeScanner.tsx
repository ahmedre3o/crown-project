'use client';

import React, { useEffect, useRef, useState } from 'react';

type BarcodeScannerProps = {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
  onError?: (message: string) => void;
};

type DetectedBarcode = { rawValue: string };

export function BarcodeScanner({ open, onClose, onDetected, onError }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const start = async () => {
      try {
        setError(null);
        const Detector = (window as any).BarcodeDetector as
          | (new (options?: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]> })
          | undefined;

        if (!Detector) {
          const msg = 'Barcode detector not supported in this browser';
          setError(msg);
          onError?.(msg);
          // Close immediately so scanner-gun input fields can take focus.
          onClose();
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new Detector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e'],
        });

        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              onDetected(barcodes[0].rawValue);
              onClose();
              return;
            }
          } catch (err) {
            const msg = 'Unable to read barcode';
            setError(msg);
            onError?.(msg);
            return;
          }
          if (active) requestAnimationFrame(scan);
        };

        requestAnimationFrame(scan);
      } catch (err: any) {
        const msg = err?.message || 'Camera access denied';
        setError(msg);
        onError?.(msg);
      }
    };

    start();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#0b1220] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-cyan-200 font-semibold">Scan Barcode / QR</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-white">
            ✕
          </button>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/20">
          <video ref={videoRef} className="h-72 w-full object-cover" muted playsInline />
        </div>
        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}
        <p className="mt-3 text-xs text-slate-400">
          Align the code inside the frame. Scanner guns are supported by typing into barcode fields.
        </p>
      </div>
    </div>
  );
}
