import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import axios from "axios";
import Header from "../components/Header";
import { layoutConfig, renderComposition } from "../lib/photobooth";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LAYOUTS = [
  { id: "strip4", name: "Four-photo strip", desc: "Classic vertical booth", thumb: "l1", cells: 4 },
  { id: "strip3", name: "Three-photo strip", desc: "Short vertical print", thumb: "l3", cells: 3 },
  { id: "single", name: "Single photo", desc: "One large portrait", thumb: "l5", cells: 1 },
];

const COLORS = [
  { key: "white", bg: "#fff" },
  { key: "black", bg: "#171519" },
  { key: "pink", bg: "#f49ab7" },
  { key: "lightpink", bg: "#f8d8e2" },
  { key: "purple", bg: "#b39ae8" },
  { key: "blue", bg: "#9ed6eb" },
  { key: "maroon", bg: "#73112f" },
  { key: "gold", bg: "#e7b83f" },
  { key: "gradient", bg: null },
];

const STICKERS = ["⭐", "💖", "✨", "🌸", "🦋", "🌈", "📷", "🏆", "⚽", "🎓", "🎀", "🌟"];

export default function HomePage() {
  const [layout, setLayout] = useState("strip4");
  const [frame, setFrame] = useState("white");
  const [flash, setFlash] = useState(true);
  const [facing, setFacing] = useState("user");
  const [photos, setPhotos] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [text, setText] = useState({ eventName: "BEC Intramurals 2026", caption: "", section: "", message: "" });
  const [format, setFormat] = useState("2x6");
  const [dpi, setDpi] = useState(240);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [countdown, setCountdown] = useState("");
  const [modalSrc, setModalSrc] = useState(null);
  const [finalizeResult, setFinalizeResult] = useState(null); // { token, qr_data_url, gallery_url }
  const [finalizing, setFinalizing] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const printRef = useRef(null);

  const slots = layoutConfig[layout].slots;

  // Start session on mount
useEffect(() => {
  (async () => {
    try {
      const res = await axios.post(`${API}/sessions`, { layout });
      setSessionId(res.data.session_id);
    } catch (e) {
      console.error(e);
    }
  })();

  return () => stopCamera();
}, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser does not support webcam access.");
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      setCameraReady(false);
      toast.error(err?.name === "NotAllowedError" ? "Camera permission denied" : "Camera could not be started");
    }
  };

  const flipCamera = async () => {
    setFacing((f) => (f === "user" ? "environment" : "user"));
    // startCamera called after facing state updates via effect
  };
  useEffect(() => {
  if (cameraReady) startCamera();
}, [facing]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const capturePhoto = async () => {
    if (!cameraReady) { toast("Enable the camera first."); return; }
    if (photos.length >= slots) { toast("Layout is full. Retake all or change layout."); return; }

    for (let n = 3; n >= 1; n--) {
      setCountdown(String(n));
      await sleep(700);
    }
    setCountdown("📸");
    await sleep(250);
    setCountdown("");

    if (flash) {
      document.body.animate(
        [{ filter: "brightness(1)" }, { filter: "brightness(3.5)" }, { filter: "brightness(1)" }],
        { duration: 230, easing: "ease-out" }
      );
    }

    const video = videoRef.current;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (facing === "user") { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    const data = canvas.toDataURL("image/jpeg", 0.95);
    setPhotos((prev) => [...prev, data]);
  };

  // Re-render preview whenever inputs change
  const doRender = useCallback(async () => {
    const src = await renderComposition({ layout, frame, photos, stickers, text, format, dpi: Number(dpi) });
    setPreviewSrc(src);
  }, [layout, frame, photos, stickers, text, format, dpi]);

  useEffect(() => { doRender(); }, [doRender]);

  // If layout changes, trim photos and reset finalize result
  useEffect(() => {
    setPhotos((p) => (p.length > slots ? p.slice(0, slots) : p));
    setFinalizeResult(null);
  }, [layout, slots]);

  const resetSession = async () => {
    setPhotos([]);
    setStickers([]);
    setFinalizeResult(null);
    try {
      const res = await axios.post(`${API}/sessions`, { layout });
      setSessionId(res.data.session_id);
      toast.success("New session started.");
    } catch (e) {
      toast.error("Could not start new session.");
    }
  };

  const retakePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setFinalizeResult(null);
  };

  const addSticker = (char) => {
    setStickers((prev) => [
      ...prev,
      { char, x: 0.5 + (Math.random() - 0.5) * 0.45, y: 0.18 + Math.random() * 0.55, size: 42 + Math.random() * 14, rotation: (Math.random() - 0.5) * 18 },
    ]);
    setFinalizeResult(null);
  };

  const downloadPNG = () => {
    if (!previewSrc) return toast("Create a preview first.");
    const a = document.createElement("a");
    a.href = previewSrc;
    a.download = `photobooth-${Date.now()}.png`;
    a.click();
  };

  const hardCopyPrint = () => {
    if (!previewSrc) return toast("Create a preview first.");
    if (printRef.current) printRef.current.src = previewSrc;
    window.print();
  };

  const softCopyFinalize = async () => {
    if (photos.length !== slots) return toast(`Take ${slots} photo${slots > 1 ? "s" : ""} first.`);
    if (finalizing) return;
    // Idempotent — if we already have a result, just reveal QR
    if (finalizeResult) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }

    if (!window.confirm("Create my Photo Library?\n\nThis finalizes your session and generates a QR code linked to your private gallery.")) return;

    setFinalizing(true);
    try {
      // Ensure preview is fresh
      const finalSrc = await renderComposition({ layout, frame, photos, stickers, text, format, dpi: Number(dpi) });
      setPreviewSrc(finalSrc);

      const payload = {
        layout,
        event_name: text.eventName || "",
        section_name: text.section || "",
        caption: text.caption || "",
        base_url: window.location.origin,
        photos: [
          ...photos.map((data_url) => ({ data_url, photo_type: "capture" })),
          { data_url: finalSrc, photo_type: "final" },
        ],
      };

      let sid = sessionId;
      if (!sid) {
        const s = await axios.post(`${API}/sessions`, { layout });
        sid = s.data.session_id;
        setSessionId(sid);
      }

      const res = await axios.post(`${API}/sessions/${sid}/finalize`, payload);
      setFinalizeResult(res.data);
      toast.success("Your photo library is ready!");
      setTimeout(() => document.getElementById("qr-section")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      console.error(e);
      toast.error("Could not create photo library. Please try again.");
    } finally {
      setFinalizing(false);
    }
  };

  const downloadQR = () => {
    if (!finalizeResult) return;
    const a = document.createElement("a");
    a.href = finalizeResult.qr_data_url;
    a.download = `photobooth-qr-${finalizeResult.token.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <>
      <Header />
      <section data-testid="home-page">
        <div className="container">
          {/* HERO */}
          <section className="hero">
            <div>
              <div className="kicker">School Event Photobooth</div>
              <h1>Capture the moment,<br/><em>keep the memories.</em></h1>
              <p>Pick a layout, take your shots, decorate your strip, and get a private QR-linked photo library students can open on their phone.</p>
            </div>
            <div className="hero-note">
              <strong>📸 Camera privacy</strong>
              <small>Your live camera feed stays on this device. Photos are only uploaded when you choose <b>Soft Copy</b> to create your library.</small>
            </div>
          </section>

          {/* WORKSPACE */}
          <section className="workspace">
            {/* LAYOUT */}
            <aside className="panel layout-panel">
              <div className="panel-head">
                <div className="step">01 • LAYOUT</div>
                <h2>Choose layout</h2>
                <div className="panel-sub">Number of photos taken matches the layout.</div>
              </div>
              <div className="panel-body">
                <div className="layout-list">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      className={`layout-card ${layout === l.id ? "selected" : ""}`}
                      onClick={() => setLayout(l.id)}
                      data-testid={`layout-${l.id}`}
                    >
                      <span className={`layout-thumb ${l.thumb}`}>
                        {Array.from({ length: l.cells }).map((_, i) => <i key={i} />)}
                      </span>
                      <span><b>{l.name}</b><span>{l.desc}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* CAMERA */}
            <section className="panel camera-panel">
              <div className="camera-top">
                <div className="camera-status">
                  <span className={`dot ${cameraReady ? "ready" : ""}`}></span>
                  <span data-testid="camera-status">{cameraReady ? "Camera ready • you look great" : "Camera permission is required"}</span>
                </div>
                <div className="camera-actions">
                  <button className={`icon-btn ${flash ? "active" : ""}`} onClick={() => setFlash((f) => !f)} data-testid="flash-btn">
                    ⚡ Flash {flash ? "on" : "off"}
                  </button>
                  <button className="icon-btn" onClick={flipCamera} data-testid="flip-btn">↻ Flip camera</button>
                </div>
              </div>

              <div className="video-wrap">
                <video ref={videoRef} className="video-el" autoPlay playsInline muted />
                {!cameraReady && (
                  <div className="camera-placeholder">
                    <div>
                      <div style={{ fontSize: 42, marginBottom: 10 }}>📷</div>
                      <strong>Ready for your photo?</strong>
                      <p>Allow camera access to start the booth. Your live preview stays on this device.</p>
                      <button className="btn btn-gold" onClick={startCamera} style={{ marginTop: 14 }} data-testid="enable-camera-btn">
                        Enable camera
                      </button>
                    </div>
                  </div>
                )}
                <div className="video-overlay">
                  <div className="counter" data-testid="photo-counter">{photos.length} / {slots} photos</div>
                  <div className={`countdown ${countdown ? "show" : ""}`}>{countdown}</div>
                  <div className="capture-row">
                    <button className="capture" onClick={capturePhoto} disabled={!cameraReady || photos.length >= slots} data-testid="capture-btn" aria-label="Take photo"></button>
                  </div>
                </div>
              </div>

              <div className="camera-footer">
                <div className="camera-tip">
                  {photos.length === slots ? "All photos captured! Customize and choose delivery below." : "Tip: look at the lens and make some memories."}
                </div>
                <button className="text-btn" onClick={resetSession} data-testid="new-session-btn">New session</button>
              </div>
            </section>

            {/* CUSTOMIZE */}
            <aside className="panel customize-panel">
              <div className="panel-head">
                <div className="step">03 • CUSTOMIZE</div>
                <h2>Make it yours</h2>
                <div className="panel-sub">Choose a frame, add stickers, and personalize.</div>
              </div>

              <div className="control-section">
                <div className="control-title">Frame color</div>
                <div className="colors">
                  {COLORS.map((c) => (
                    <button
                      key={c.key}
                      className={`color-dot ${frame === c.key ? "selected" : ""}`}
                      data-color={c.key}
                      style={c.bg ? { background: c.bg } : {}}
                      onClick={() => setFrame(c.key)}
                      title={c.key}
                      data-testid={`color-${c.key}`}
                    />
                  ))}
                </div>
              </div>

              <div className="control-section">
                <div className="control-title">Stickers</div>
                <div className="stickers">
                  {STICKERS.map((s, i) => (
                    <button key={i} className="sticker-btn" onClick={() => addSticker(s)} data-testid={`sticker-${i}`}>{s}</button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "#8a7e82", marginTop: 8 }}>Click a sticker to add it to the final composition.</div>
              </div>

              <div className="control-section">
                <div className="control-title">Add info (optional)</div>
                <div className="fields">
                  <div className="field"><label>Event name</label>
                    <input value={text.eventName} onChange={(e) => setText((t) => ({ ...t, eventName: e.target.value }))} maxLength={42} data-testid="event-name-input" />
                  </div>
                  <div className="field"><label>Caption</label>
                    <input value={text.caption} onChange={(e) => setText((t) => ({ ...t, caption: e.target.value }))} placeholder="Best day with my besties!" maxLength={48} />
                  </div>
                  <div className="field"><label>Section / class</label>
                    <input value={text.section} onChange={(e) => setText((t) => ({ ...t, section: e.target.value }))} placeholder="Grade 12 • ICT" maxLength={32} data-testid="section-input" />
                  </div>
                  <div className="field"><label>Short message</label>
                    <input value={text.message} onChange={(e) => setText((t) => ({ ...t, message: e.target.value }))} placeholder="Core memories ♡" maxLength={42} />
                  </div>
                </div>
              </div>
            </aside>
          </section>

          {/* PREVIEW */}
          <section className="preview-section" data-testid="preview-section">
            <div className="section-heading">
              <div>
                <div className="kicker">04 • FINAL RESULT</div>
                <h2>Photo strip preview</h2>
              </div>
              <p>{layoutConfig[layout].name} • {photos.length} captured</p>
            </div>

            <div className="preview-layout">
              <div className="preview-card">
                <div className="preview-stage">
                  {previewSrc && <img src={previewSrc} alt="Final photobooth preview" className="preview-img" data-testid="preview-image" />}
                </div>
              </div>

              <div className="preview-side">
                <div className="info-card">
                  <h3>Print & download</h3>
                  <p>Download a PNG of your final strip.</p>
                  <div className="action-grid">
                    <button className="btn btn-primary" onClick={downloadPNG} data-testid="download-png-btn">Download PNG</button>
                    <button className="btn btn-light" onClick={resetSession} data-testid="retake-all-btn">Retake all</button>
                  </div>
                </div>

                <div className="info-card">
                  <h3>Print size</h3>
                  <p>Choose a composition size for export or print.</p>
                  <div className="format-row">
                    <select value={format} onChange={(e) => setFormat(e.target.value)} data-testid="format-select">
                      <option value="2x6">2 × 6 in strip</option>
                      <option value="4x6">4 × 6 in photo</option>
                      <option value="a4">A4 portrait</option>
                    </select>
                    <select value={dpi} onChange={(e) => setDpi(e.target.value)} data-testid="quality-select">
                      <option value="300">300 DPI</option>
                      <option value="240">240 DPI</option>
                      <option value="150">150 DPI</option>
                    </select>
                  </div>
                </div>

                <div className="info-card">
                  <h3>Captured photos</h3>
                  <p>{photos.length ? `${photos.length} of ${slots} captured.` : "No photos yet."}</p>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(slots, 4)}, 1fr)`, gap: 6 }}>
                    {photos.map((src, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        <img src={src} alt={`Shot ${i + 1}`} style={{ width: "100%", height: 58, objectFit: "cover", borderRadius: 7, border: "1px solid #eadfe2" }} />
                        <button
                          onClick={() => retakePhoto(i)}
                          title={`Retake photo ${i + 1}`}
                          style={{ position: "absolute", right: 3, top: 3, width: 20, height: 20, border: 0, borderRadius: "50%", background: "#73112f", color: "#fff", fontWeight: 900, fontSize: 12, lineHeight: "20px", padding: 0 }}
                          data-testid={`retake-photo-${i}`}
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* DELIVERY */}
          <section className="delivery-section" data-testid="delivery-section">
            <div className="section-heading">
              <div>
                <div className="kicker">05 • DELIVERY</div>
                <h2>How would you like your photos?</h2>
              </div>
              <p>Choose one — hard copy prints instantly, soft copy creates a QR-linked library.</p>
            </div>

            <div className="delivery-grid">
              <div className="delivery-card" onClick={hardCopyPrint} data-testid="hardcopy-card" role="button" tabIndex={0}>
                <div className="icon">🖨️</div>
                <h3>Hard Copy</h3>
                <p>Print your photos directly using your device&rsquo;s printer. High-quality browser print with your selected size.</p>
                <button className="btn btn-gold" onClick={(e) => { e.stopPropagation(); hardCopyPrint(); }} data-testid="print-btn">Print my photos</button>
              </div>

              <div className="delivery-card" onClick={softCopyFinalize} data-testid="softcopy-card" role="button" tabIndex={0}>
                <div className="icon">📱</div>
                <h3>Soft Copy</h3>
                <p>Get a private QR code that opens your personal photo library on any phone. One QR per session.</p>
                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); softCopyFinalize(); }} disabled={finalizing || photos.length !== slots} data-testid="softcopy-btn">
                  {finalizing ? "Creating library..." : finalizeResult ? "View QR code" : "Get my photos with QR"}
                </button>
              </div>
            </div>
          </section>

          {/* QR RESULT */}
          {finalizeResult && (
            <section id="qr-section" className="preview-section" data-testid="qr-section">
              <div className="qr-panel">
                <div className="kicker">Your photos are ready! 🎉</div>
                <h2>Scan to open your library</h2>
                <p>Open your camera and point it at this code to access your photos on your phone.</p>
                <div className="qr-image">
                  <img src={finalizeResult.qr_data_url} alt="Gallery QR code" data-testid="qr-image" />
                </div>
                <div className="qr-url" data-testid="qr-url">{finalizeResult.gallery_url}</div>
                <div className="action-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <a className="btn btn-primary" href={`/gallery/${finalizeResult.token}`} target="_blank" rel="noreferrer" data-testid="open-library-btn" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
                    Open Photo Library
                  </a>
                  <button className="btn btn-gold" onClick={downloadQR} data-testid="download-qr-btn">Download QR</button>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>

      {modalSrc && (
        <div className="modal open" onClick={() => setModalSrc(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalSrc(null)}>×</button>
            <img src={modalSrc} alt="Preview" />
          </div>
        </div>
      )}

      <div className="print-area">
        <img ref={printRef} alt="Printable photobooth" />
      </div>
    </>
  );
}


