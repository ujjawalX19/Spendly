/**
 * PdfImport.jsx — Vittova
 * ─────────────────────────────────────────────────────────────
 * Bank Statement PDF import interface. Gated behind Pro.
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ProGate from '../components/ProGate';
import { API_URL as API_BASE_URL } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const API_URL = API_BASE_URL;

export default function PdfImport() {
  const { session } = useAuth();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setError(null);
      setResult(null);
    } else if (selected) {
      setError('Please upload a valid PDF file.');
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !session?.access_token) return;

    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch(`${API_URL}/pdf-import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Server messages here are written for users (e.g. "larger than 10 MB").
        throw Object.assign(new Error(data.message || `Upload failed with status ${res.status}`), { status: res.status, data });
      }

      if (data.success) {
        setResult(data);
      } else {
        setError(data.message || 'Failed to process PDF.');
      }
    } catch (err) {
      setError(friendlyError(err, "We couldn't read that statement. Check it is a PDF and try again."));
    } finally {
      setLoading(false);
      setFile(null);
    }
  };

  return (
    <ProGate
      feature="pdf_import"
      title="Statement import"
      description="Import past expenses from a bank statement PDF. This is planned for Vittova Pro, which is not available yet."
    >
      <motion.div
        className="mx-auto max-w-lg space-y-6 pb-6 text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <header>
          <h1 className="text-2xl font-bold">Statement import</h1>
          <p className="mt-1 text-sm text-ink-2">Add past expenses from a bank statement PDF.</p>
        </header>

        {/* Supported Banks Info */}
        <div>
          <p className="v-label mb-2">Supported banks</p>
          <p className="text-sm text-ink-soft">SBI · HDFC · ICICI · Axis · Kotak · PNB</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">Your PDF is processed securely and immediately deleted from our servers. We do not store your bank statements.</p>
        </div>

        {/* Upload Area */}
        <div
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border border-dashed p-8 text-center transition-colors ${
            file ? 'border-accent bg-surface' : 'border-line-strong bg-surface'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={loading}
          />
          
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-ink-2" />
              <div>
                <p className="text-[15px] font-semibold text-ink">Reading your statement…</p>
                <p className="mt-1 text-xs text-ink-3">Finding the payments and sorting them into categories</p>
              </div>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <FileText className="h-6 w-6 text-ink-2" aria-hidden="true" />
              <div>
                <p className="break-all text-[15px] font-semibold text-ink">{file.name}</p>
                <p className="mt-1 text-xs text-ink-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <p className="text-xs text-ink-2 underline">Tap to change file</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3">
              <Upload className="h-6 w-6 text-ink-3" aria-hidden="true" />
              <div>
                <p className="text-[15px] font-semibold text-ink">Tap to choose a bank statement</p>
                <p className="mt-1 text-xs text-ink-3">PDF, up to 10 MB</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="v-error flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {result && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} role="status">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
              <CheckCircle className="h-4 w-4" aria-hidden="true" /> Import complete
            </p>
            <dl className="v-block v-rows px-4 text-sm text-ink-2">
              <div className="flex justify-between gap-3 py-3"><dt>Bank</dt><dd className="font-medium text-ink">{result.bankName}</dd></div>
              <div className="flex justify-between gap-3 py-3"><dt>New transactions added</dt><dd className="font-medium tabular-nums text-ink">{result.imported}</dd></div>
              {result.duplicatesSkipped > 0 && (
                <div className="flex justify-between gap-3 py-3"><dt>Already in Vittova (skipped)</dt><dd className="font-medium tabular-nums text-ink">{result.duplicatesSkipped}</dd></div>
              )}
              {result.invalidRowsSkipped > 0 && (
                <div className="flex justify-between gap-3 py-3"><dt>Unreadable rows skipped</dt><dd className="font-medium tabular-nums text-ink">{result.invalidRowsSkipped}</dd></div>
              )}
              <div className="flex justify-between gap-3 py-3"><dt>Total amount</dt><dd className="font-mono text-ink">₹{Number(result.totalAmount || 0).toLocaleString('en-IN')}</dd></div>
              <div className="flex justify-between gap-3 py-3"><dt>Round-ups</dt><dd className="font-mono text-ink">+₹{Number(result.totalChillar || 0).toLocaleString('en-IN')}</dd></div>
            </dl>
          </motion.section>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || loading}
          className="v-press v-btn-primary w-full"
        >
          {loading ? 'Reading…' : 'Import transactions'}
        </button>
      </motion.div>
    </ProGate>
  );
}
