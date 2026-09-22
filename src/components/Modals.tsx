import { useState, useEffect } from 'react';
import { useViewer } from '../context/ViewerContext';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { GpuStatusModal } from './GpuStatusModal';
import { InfoModal } from './InfoModal';
import { dataURIToBlob, safeOpenWindow } from '../lib/utils';

export function Modals() {
  const { activeModal, setActiveModal, filename, loadedUrl, isEmpty, resetWorkspace } = useViewer();

  // URL Modal state
  const [urlInput, setUrlInput] = useState('');

  // Share state based on preview mode (blob) vs deployed
  const [shareVal, setShareVal] = useState('');
  const [isSandbox, setIsSandbox] = useState(false);

  // Snapshot modal states
  const [snapRes, setSnapRes] = useState('medium');
  const [snapW, setSnapW] = useState(1000);
  const [snapH, setSnapH] = useState(1000);
  const [snapTrans, setSnapTrans] = useState(false);
  const [snap360, setSnap360] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [captured360, setCaptured360] = useState<{ angle: number; dataUrl: string }[]>([]);
  const [isCapturing360, setIsCapturing360] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');

  useEffect(() => {
    if (activeModal === 'share') {
      let baseUrl = window.location.href.split('#')[0].split('?')[0];
      const isSandboxUrl = baseUrl.startsWith('blob:') || baseUrl.includes('.webcomponent.local') || window.location.hostname === 'localhost' || window.location.hostname.includes('.run.app');
      setIsSandbox(isSandboxUrl);
      
      if (!isEmpty && loadedUrl) {
         if (isSandboxUrl) {
           setShareVal(`https://ajaxlau.github.io/New3DViewer/#model=${encodeURIComponent(loadedUrl)}`);
         } else {
           setShareVal(`${baseUrl}#model=${encodeURIComponent(loadedUrl)}`);
         }
      } else {
         setShareVal('');
      }
    }
    
    if (activeModal === 'snapshot' && window._viewerManagerInstance && !isEmpty) {
      // Create a quick preview render
      const container = document.getElementById('viewer-container');
      if (container) {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const dataUrl = window._viewerManagerInstance.captureSnapshot(cw, ch, false);
          if (dataUrl) setPreviewSrc(dataUrl);
      }
      setCaptured360([]);
      setIsCapturing360(false);
      setSnap360(false);
      setShareFeedback('');
    }
  }, [activeModal, loadedUrl, isEmpty]);

  const handleLoadUrl = () => {
    if (urlInput.trim() && window._viewerManagerInstance) {
      window._viewerManagerInstance.loadUrl(urlInput.trim());
      setUrlInput('');
      setActiveModal(null);
    }
  };

  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch (err) {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '-999999px';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        console.warn("Failed to copy", e);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!window._viewerManagerInstance) return;
    let targetW = 1920, targetH = 1080;
    if (snapRes === 'small') { targetW = 1280; targetH = 720; }
    else if (snapRes === 'large') { targetW = 2560; targetH = 1440; }
    else if (snapRes === 'custom') { targetW = snapW; targetH = snapH; }
    
    const dataUrl = window._viewerManagerInstance.captureSnapshot(targetW, targetH, snapTrans);
    if (!dataUrl) return;

    try {
      const blob = dataURIToBlob(dataUrl);
      const dlName = filename || 'snapshot';
      const file = new File([blob], `${dlName.replace(/\.[^/.]+$/, "")}_snapshot.png`, { type: 'image/png' });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file]
        });
      } else {
        // Fallback for desktops: download the image and redirect to WhatsApp Web
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        safeOpenWindow('https://wa.me/');
      }
    } catch (e) {
      console.warn('Error sharing to WhatsApp', e);
    }
    setActiveModal(null);
  };

  const handleCapture360Sequence = async () => {
    if (!window._viewerManagerInstance) return;
    setIsCapturing360(true);
    setCaptured360([]);
    setShareFeedback('');
    
    // Let the component update and render the loading screen
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    try {
      let targetW = 1920, targetH = 1080;
      if (snapRes === 'small') { targetW = 1280; targetH = 720; }
      else if (snapRes === 'medium') { targetW = 1920; targetH = 1080; }
      else if (snapRes === 'large') { targetW = 2560; targetH = 1440; }
      else if (snapRes === 'custom') { targetW = snapW; targetH = snapH; }
      
      const snapshots = window._viewerManagerInstance.capture360Snapshots(targetW, targetH, snapTrans);
      if (snapshots && snapshots.length > 0) {
        setCaptured360(snapshots);
      }
    } catch (err) {
      console.error("Failed capturing 360 sequence", err);
    } finally {
      setIsCapturing360(false);
    }
  };

  const handleDownloadAll360Individual = async () => {
    if (captured360.length === 0) return;
    const dlBaseName = (filename || 'snapshot').replace(/\.[^/.]+$/, "");
    for (let i = 0; i < captured360.length; i++) {
      const snap = captured360[i];
      const link = document.createElement('a');
      link.href = snap.dataUrl;
      link.download = `${dlBaseName}_${snap.angle}deg.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Wait brief amount between trigger actions to avoid browser blockage
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    setActiveModal(null);
  };

  const handleDownloadAll360ZIP = async () => {
    if (captured360.length === 0) return;
    const dlBaseName = (filename || 'snapshot').replace(/\.[^/.]+$/, "");
    try {
      const zip = new JSZip();
      captured360.forEach((snap) => {
        const base64Data = snap.dataUrl.split(',')[1];
        zip.file(`${dlBaseName}_${snap.angle}deg.png`, base64Data, { base64: true });
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${dlBaseName}_360_snapshots.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    } catch (err) {
      console.error("Failed to generate or download 360 ZIP in memory", err);
    }
    setActiveModal(null);
  };

  const handleWhatsAppShare360 = async () => {
    if (captured360.length === 0) return;
    const dlBaseName = (filename || 'snapshot').replace(/\.[^/.]+$/, "");
    setShareFeedback('');

    try {
      const files: File[] = captured360.map((snap) => {
        const blob = dataURIToBlob(snap.dataUrl);
        return new File([blob], `${dlBaseName}_${snap.angle}deg.png`, { type: 'image/png' });
      });

      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          files
        });
        setActiveModal(null);
      } else {
        setShareFeedback("Multiple file-sharing not fully supported. Downloading views separately and opening WhatsApp link...");
        await handleDownloadAll360Individual();
        safeOpenWindow('https://wa.me/');
      }
    } catch (err) {
      console.warn("Error sharing 360 images to WhatsApp, falling back.", err);
      setShareFeedback("Error sharing: downloading views individually instead.");
      await handleDownloadAll360Individual();
    }
  };

  const handleCreateSnapshot = async () => {
    if (!window._viewerManagerInstance) return;
    let targetW = 1920, targetH = 1080;
    if (snapRes === 'small') { targetW = 1280; targetH = 720; }
    else if (snapRes === 'large') { targetW = 2560; targetH = 1440; }
    else if (snapRes === 'custom') { targetW = snapW; targetH = snapH; }
    
    const dlBaseName = (filename || 'snapshot').replace(/\.[^/.]+$/, "");

    const dataUrl = window._viewerManagerInstance.captureSnapshot(targetW, targetH, snapTrans);
    if (dataUrl) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${dlBaseName}_snapshot.png`;
        link.click();
    }
    setActiveModal(null);
  };

  if (!activeModal || activeModal === 'planning') return null;

  if (activeModal === 'info') {
    return <InfoModal onClose={() => setActiveModal(null)} />;
  }

  return (
    <div className="fixed inset-0 bg-zinc-900/60 z-[1000] flex items-center justify-center fade-in p-4">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-sm shadow-xl outline-none border border-zinc-200 dark:border-zinc-800" 
           style={{ width: activeModal === 'snapshot' ? '750px' : '450px', maxWidth: '100%' }}>
        
        {/* -- RESET WORKSPACE CONFIRMATION MODAL -- */}
        {activeModal === 'reset' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0 border border-red-200 dark:border-red-900/60">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
                  Reset Workspace
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  Clear all models & analytic items
                </p>
              </div>
            </div>
            
            <div className="bg-red-50/70 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/40 rounded p-3.5 mb-5 text-xs text-red-900 dark:text-red-200 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Confirm Workspace Reset:</strong> This will clear all loaded 3D models, custom anatomical planning items (measurements, planes, cylinders, curves), and restore the viewer to its initial clean state.
              </div>
            </div>

            <div className="flex justify-end items-center gap-3">
              <button 
                type="button"
                className="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition" 
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest bg-red-600 hover:bg-red-700 active:scale-95 text-white border-none shadow-sm transition flex items-center gap-2" 
                onClick={() => {
                  resetWorkspace();
                  setActiveModal(null);
                }}
              >
                <RotateCcw size={14} />
                <span>Reset Workspace</span>
              </button>
            </div>
          </>
        )}

        {/* -- URL MODAL -- */}
        {activeModal === 'url' && (
          <>
            <h3 className="text-[11px] uppercase tracking-widest font-bold mb-3 text-zinc-800 dark:text-zinc-200">Load from URL</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 font-mono">Input the URL of a 3D model (CORS Support Required):</p>
            <input 
              type="text" 
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="w-full p-3 mb-6 border border-zinc-300 dark:border-zinc-700 rounded-sm bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 font-mono text-sm" 
              placeholder="https://raw.githubusercontent.com/.../model.gltf"
              onKeyDown={(e) => e.key === 'Enter' && handleLoadUrl()}
            />
            <div className="flex justify-end gap-3">
              <button className="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 border-none" onClick={handleLoadUrl}>Load</button>
            </div>
          </>
        )}

        {/* -- SHARE MODAL -- */}
        {activeModal === 'share' && (
           <>
            <h3 className="text-[11px] uppercase tracking-widest font-bold mb-3 text-zinc-800 dark:text-zinc-200">Share Model</h3>
            {!loadedUrl ? (
                <p className="text-sm text-red-500 mb-5 font-mono">Please load a model from a URL first before sharing. Local files cannot be shared via link.</p>
            ) : (
                <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 font-mono">
                  {isSandbox && <><strong className="text-red-500">Preview Mode:</strong> You are in a temporary sandbox. Once deployed, it will look like this:<br/><br/></>}
                  Scan the QR code or copy the link below to share this model:
                </p>
                <div className="flex flex-col gap-4 mb-6">
                  <div className="bg-white p-4 rounded-md border border-zinc-200 dark:border-zinc-800 mx-auto shadow-sm flex items-center justify-center relative">
                    <QRCodeSVG 
                      value={shareVal} 
                      size={168} 
                      level={"H"} 
                      imageSettings={{
                        src: logoImg,
                        x: undefined,
                        y: undefined,
                        height: 38,
                        width: 38,
                        excavate: true,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <img 
                        src={logoImg} 
                        alt="3DPO Logo" 
                        className="w-[36px] h-[36px] object-contain"
                      />
                    </div>
                  </div>
                  <input readOnly value={shareVal} className="w-full p-3 border border-zinc-300 dark:border-zinc-700 rounded-sm bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-sm outline-none" />
                </div>
                </>
            )}
            <div className="flex justify-end items-center gap-3 mt-6 w-full">
              <button 
                className="flex-1 max-w-[120px] h-10 px-3 rounded-sm text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center text-center font-bold" 
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
              {loadedUrl && (
                <>
                  {activeModal === 'share' && (
                      <button 
                        className="flex-1 max-w-[130px] h-10 px-3 rounded-sm text-xs font-bold uppercase tracking-widest bg-green-600 text-white hover:bg-green-700 border-none shadow-sm transition-colors flex items-center justify-center gap-1.5 text-center font-bold" 
                        onClick={async () => {
                            let sharedOk = false;
                            const shareText = shareVal;
                            if (window._viewerManagerInstance) {
                                try {
                                    const dataUrl = window._viewerManagerInstance.captureSnapshot(1920, 1080, false);
                                    if (dataUrl && navigator.canShare) {
                                        const blob = dataURIToBlob(dataUrl);
                                        const dlName = filename || 'snapshot';
                                        const file = new File([blob], `${dlName.replace(/\.[^/.]+$/, "")}_snapshot.png`, { type: 'image/png' });
                                        if (navigator.canShare({ files: [file] })) {
                                            await navigator.share({
                                                title: '3D Model',
                                                text: shareText,
                                                files: [file]
                                            });
                                            sharedOk = true;
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Share with image failed', e);
                                }
                            }
                            if (!sharedOk) {
                                const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
                                safeOpenWindow(url);
                            }
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        <span className="truncate">WhatsApp</span>
                      </button>
                  )}
                  <button 
                    className="flex-1 max-w-[130px] h-10 px-3 rounded-sm text-xs font-bold uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 border-none shadow-sm transition-colors flex items-center justify-center text-center font-bold" 
                    onClick={() => copyToClipboard(shareVal)}
                  >
                    <span className="truncate">{copied ? "Copied!" : "Copy Link"}</span>
                  </button>
                </>
              )}
            </div>
           </>
        )}

        {/* -- SNAPSHOT MODAL -- */}
        {activeModal === 'snapshot' && (
          <>
            <h3 className="text-[11px] uppercase tracking-widest font-bold mb-3 text-zinc-800 dark:text-zinc-200">Create Snapshot</h3>
            {isEmpty ? (
              <p className="text-sm text-red-500 mb-5 font-mono">Please load a model first.</p>
            ) : (
              <div className="flex flex-wrap gap-6 mt-5 mb-7">
                {snap360 ? (
                  <div className="flex-1 min-w-[300px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-sm h-[320px] shadow-inner p-4 flex flex-col justify-center items-center overflow-y-auto">
                    {isCapturing360 ? (
                      <div className="flex flex-col items-center gap-3 text-center py-6">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Capturing 360° Views...</span>
                        <span className="text-xs text-zinc-400 font-mono">Rotating 60° increments around model axis</span>
                      </div>
                    ) : captured360.length > 0 ? (
                      <div className="w-full h-full flex flex-col">
                        <div className="flex items-center justify-between mb-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Captured Angles (In Memory)</span>
                          <button 
                            type="button"
                            onClick={handleCapture360Sequence}
                            className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                          >
                            🔄 Recapture All
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 overflow-y-auto flex-1 pr-1">
                          {captured360.map((snap) => (
                            <div key={snap.angle} className="relative aspect-video bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-sm overflow-hidden group shadow-sm flex items-center justify-center">
                               <img src={snap.dataUrl} className="max-w-full max-h-full object-contain" alt={`${snap.angle}°`}/>
                               <div className="absolute inset-x-0 bottom-0 bg-zinc-950/80 text-[10px] text-white font-mono py-0.5 text-center transition-all group-hover:bg-blue-950/90 font-medium">
                                 {snap.angle}° View
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-6 gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                        </div>
                        <div className="max-w-[280px]">
                          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-widest mb-1">Orbit Snapshot Sequencing</h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Captures 6 high-resolution pictures at 60-degree increments in browser memory.
                          </p>
                        </div>
                        <button 
                          type="button"
                          onClick={handleCapture360Sequence}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-all shadow"
                        >
                          Capture 360° Sequence
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 min-w-[250px] bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-sm flex items-center justify-center overflow-hidden h-[320px] shadow-inner">
                      {previewSrc ? (
                          <img src={previewSrc} className="max-w-[100%] max-h-[100%] object-contain" alt="Preview"/>
                      ) : null}
                  </div>
                )}
                <div className="w-[250px] flex flex-col gap-3 text-zinc-700 dark:text-zinc-300 text-sm justify-between">
                    <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name="res" value="small" checked={snapRes === 'small'} onChange={() => setSnapRes('small')} className="accent-blue-600 w-4 h-4" /> Small <span className="font-mono text-xs text-zinc-400 ml-auto">(1280x720)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name="res" value="medium" checked={snapRes === 'medium'} onChange={() => setSnapRes('medium')} className="accent-blue-600 w-4 h-4" /> Medium <span className="font-mono text-xs text-zinc-400 ml-auto">(1920x1080)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name="res" value="large" checked={snapRes === 'large'} onChange={() => setSnapRes('large')} className="accent-blue-600 w-4 h-4" /> Large <span className="font-mono text-xs text-zinc-400 ml-auto">(2560x1440)</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="radio" name="res" value="custom" checked={snapRes === 'custom'} onChange={() => setSnapRes('custom')} className="accent-blue-600 w-4 h-4" /> Custom
                        </label>
                        
                        <div className={`ml-7 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 flex flex-col gap-2 transition-opacity ${snapRes === 'custom' ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
                                <span>Width</span>
                                <input type="number" disabled={snapRes !== 'custom'} value={snapW} onChange={e => setSnapW(parseInt(e.target.value)||1)} className="w-20 p-1.5 border border-zinc-300 dark:border-zinc-700 rounded-sm bg-white dark:bg-zinc-900 outline-none font-mono text-zinc-800 dark:text-zinc-200" />
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
                                <span>Height</span>
                                <input type="number" disabled={snapRes !== 'custom'} value={snapH} onChange={e => setSnapH(parseInt(e.target.value)||1)} className="w-20 p-1.5 border border-zinc-300 dark:border-zinc-700 rounded-sm bg-white dark:bg-zinc-900 outline-none font-mono text-zinc-800 dark:text-zinc-200" />
                            </div>
                        </div>
                        
                        <hr className="border-t border-zinc-200 dark:border-zinc-800 my-2"/>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={snapTrans} onChange={(e) => setSnapTrans(e.target.checked)} className="accent-blue-600 w-4 h-4" /> Transparent background
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={snap360} onChange={(e) => {
                              setSnap360(e.target.checked);
                              setShareFeedback('');
                            }} className="accent-blue-600 w-4 h-4" /> Auto 360-degree capture
                        </label>
                    </div>

                    {shareFeedback && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded font-sans leading-relaxed">
                        ⚠️ {shareFeedback}
                      </div>
                    )}
                </div>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-5 mt-5">
              <button 
                type="button"
                className="h-10 px-5 rounded-sm text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-bold flex items-center justify-center animate" 
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </button>
              {!isEmpty && (
                <div className="flex items-center gap-2">
                  {snap360 ? (
                    <>
                      {captured360.length > 0 ? (
                        <>
                          <button 
                            type="button"
                            className="h-10 px-4 rounded-sm text-xs font-bold uppercase tracking-widest bg-green-600 text-white hover:bg-green-700 border-none shadow-sm transition-colors flex items-center justify-center gap-1.5" 
                            onClick={handleWhatsAppShare360}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            <span>Share WhatsApp</span>
                          </button>
                          
                          <button 
                            type="button"
                            className="h-10 px-4 rounded-sm text-xs font-bold uppercase tracking-widest border border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-bold flex items-center justify-center" 
                            onClick={handleDownloadAll360ZIP}
                          >
                            ZIP
                          </button>

                          <button 
                            type="button"
                            className="h-10 px-4 rounded-sm text-xs font-bold uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 border-none shadow-sm transition-colors font-bold flex items-center justify-center" 
                            onClick={handleDownloadAll360Individual}
                          >
                            Save All Images
                          </button>
                        </>
                      ) : (
                        <button 
                          type="button"
                          disabled
                          className="h-10 px-6 rounded-sm text-xs font-bold uppercase tracking-widest bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border-none flex items-center justify-center" 
                        >
                          Capture Sequence First
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button 
                          type="button"
                          className="h-10 px-5 rounded-sm text-xs font-bold uppercase tracking-widest bg-green-600 text-white hover:bg-green-700 border-none shadow-sm transition-colors flex items-center justify-center gap-2" 
                          onClick={handleShareWhatsApp}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                          <span>WhatsApp</span>
                      </button>
                      <button 
                        type="button"
                        className="h-10 px-6 rounded-sm text-xs font-bold uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 border-none shadow-sm transition-colors font-bold flex items-center justify-center" 
                        onClick={handleCreateSnapshot}
                      >
                        Save Image
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* -- GPU STATUS & HARDWARE ACCELERATION MODAL -- */}
        {activeModal === 'gpu-status' && (
          <GpuStatusModal onClose={() => setActiveModal(null)} />
        )}

      </div>
    </div>
  );
}
