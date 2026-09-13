/**
 * PdfImport.jsx — Spendly v1
 * ─────────────────────────────────────────────────────────────
 * Bank Statement PDF import interface. Gated behind Pro.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, FileUp } from 'lucide-react';
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
      title="Bank Statement Import"
      description="Import past expenses from a bank statement PDF. This is planned for Spendly Pro, which is not available yet."
    >
      <motion.div
        className="space-y-6 pb-6 p-4 max-w-lg mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-lime-400/15 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-lime-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Statement Import</h1>
              <p className="text-sm text-zinc-500">Auto-categorize transactions from PDFs</p>
            </div>
          </div>
        </header>

        {/* Supported Banks Info */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Supported Banks</p>
          <div className="flex flex-wrap gap-2">
            {['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'PNB'].map(bank => (
              <span key={bank} className="px-3 py-1 rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                {bank}
              </span>
            ))}
          </div>
          <div className="mt-4 text-xs text-zinc-500 bg-black/50 p-3 rounded-xl border border-zinc-800">
            <p><span className="font-bold text-lime-400">Privacy first:</span> Your PDF is processed securely and immediately deleted from our servers. We do not store your bank statements.</p>
          </div>
        </div>

        {/* Upload Area */}
        <div 
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-colors ${
            file ? 'border-lime-500 bg-lime-500/5' : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500'
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
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-lime-400 animate-spin" />
              <div>
                <p className="text-lime-400 font-bold">Processing PDF...</p>
                <p className="text-xs text-zinc-500 mt-1">Extracting and categorizing transactions</p>
              </div>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-lime-400/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-lime-400" />
              </div>
              <div>
                <p className="text-white font-bold">{file.name}</p>
                <p className="text-xs text-zinc-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <p className="text-xs text-lime-400 underline mt-2">Tap to change file</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <Upload className="w-6 h-6 text-zinc-400" />
              </div>
              <div>
                <p className="text-white font-bold">Tap to upload bank statement</p>
                <p className="text-xs text-zinc-500 mt-1">PDF format, up to 10MB</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl bg-lime-400/10 border border-lime-400/20">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-lime-400" />
              <p className="font-bold text-lime-400">Import Successful</p>
            </div>
            <div className="space-y-2 text-sm text-zinc-300">
              <div className="flex justify-between"><span>Bank:</span> <span className="font-bold text-white">{result.bankName}</span></div>
              <div className="flex justify-between"><span>New transactions added:</span> <span className="font-bold text-white">{result.imported}</span></div>
              {result.duplicatesSkipped > 0 && (
                <div className="flex justify-between"><span>Already in Spendly (skipped):</span> <span className="font-bold text-white">{result.duplicatesSkipped}</span></div>
              )}
              {result.invalidRowsSkipped > 0 && (
                <div className="flex justify-between"><span>Unreadable rows skipped:</span> <span className="font-bold text-white">{result.invalidRowsSkipped}</span></div>
              )}
              <div className="flex justify-between"><span>Total Amount:</span> <span className="font-mono text-white">₹{Number(result.totalAmount || 0).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span>Round-ups:</span> <span className="font-mono text-lime-400">+₹{Number(result.totalChillar || 0).toLocaleString('en-IN')}</span></div>
            </div>
          </motion.div>
        )}

        <motion.button
          whileTap={file && !loading ? { scale: 0.96 } : {}}
          onClick={handleUpload}
          disabled={!file || loading}
          className={`w-full py-4 rounded-2xl font-black transition-colors ${
            file && !loading
              ? 'bg-lime-400 text-black hover:bg-lime-300 shadow-[0_0_20px_rgba(163,230,53,0.3)]'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {loading ? 'Processing...' : 'Import Transactions'}
        </motion.button>
      </motion.div>
    </ProGate>
  );
}
