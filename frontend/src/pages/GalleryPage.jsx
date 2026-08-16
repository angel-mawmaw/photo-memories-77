import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import Header from "../components/Header";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function GalleryPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalSrc, setModalSrc] = useState(null);

  useEffect(() => {
    if (!token) {
      // No token = show empty state (Gallery main page)
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${API}/gallery/${token}`);
        setGallery(res.data);
      } catch (e) {
        if (e?.response?.status === 404) {
          navigate("/gallery-not-found", { replace: true });
        } else {
          toast.error("Could not load gallery.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token, navigate]);

  const photoUrl = (p) => `${BACKEND_URL}${p.url}`;

  const downloadOne = async (p, idx) => {
    try {
      const res = await axios.get(photoUrl(p), { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `photo-${p.type}-${idx + 1}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error("Download failed.");
    }
  };

  const downloadAll = async () => {
    if (!gallery) return;
    for (let i = 0; i < gallery.photos.length; i++) {
      await downloadOne(gallery.photos[i], i);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  // No token: show hint page
  if (!token) {
    return (
      <>
        <Header />
        <section className="container gallery-page" data-testid="gallery-hint-page">
          <div className="hero" style={{ paddingTop: 15 }}>
            <div>
              <div className="kicker">Photo Library</div>
              <h1>Your <em>gallery</em>.</h1>
              <p>Photo libraries are private and accessible only through your unique QR code. Scan yours from the photobooth session to open your library.</p>
            </div>
          </div>
          <div className="gallery-empty">
            <div style={{ fontSize: 42, marginBottom: 10 }}>📱</div>
            <strong>No gallery link</strong>
            <span>Complete a session and choose <b>Soft Copy</b> to receive a QR code linked to your personal library.</span>
            <div style={{ marginTop: 20 }}>
              <Link to="/" className="btn btn-primary" style={{ display: "inline-block", padding: "10px 20px", textDecoration: "none" }}>Go to booth</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header />
        <section className="container gallery-page">
          <div className="gallery-empty"><strong>Loading your photos...</strong></div>
        </section>
      </>
    );
  }

  if (!gallery) return null;

  const finalPhoto = gallery.photos.find((p) => p.type === "final");
  const captures = gallery.photos.filter((p) => p.type === "capture");

  return (
    <>
      <Header />
      <section className="container gallery-page" data-testid="gallery-page">
        <div className="hero" style={{ paddingTop: 15 }}>
          <div>
            <div className="kicker">Photo Library</div>
            <h1 style={{ fontSize: "clamp(36px,5vw,58px)" }}>{gallery.event_name}</h1>
            {gallery.section_name && <p><b>{gallery.section_name}</b></p>}
            <p>Your private photo library. Tap any photo to view or download.</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={downloadAll} data-testid="download-all-btn">⬇ Download all</button>
          {finalPhoto && (
            <button className="btn btn-gold" onClick={() => downloadOne(finalPhoto, 0)} data-testid="download-final-btn">⬇ Download final composition</button>
          )}
        </div>

        <div className="gallery-grid">
          {finalPhoto && (
            <article className="gallery-item final" style={{ gridColumn: "1 / -1", maxWidth: 380, margin: "0 auto 8px" }} data-testid="gallery-final">
              <div style={{ fontSize: 10, fontWeight: 900, color: "#b98511", letterSpacing: ".14em", padding: "6px 4px" }}>FINAL COMPOSITION</div>
              <img src={photoUrl(finalPhoto)} alt="Final composition" onClick={() => setModalSrc(photoUrl(finalPhoto))} style={{ cursor: "zoom-in" }} />
              <div className="gallery-actions">
                <button onClick={() => setModalSrc(photoUrl(finalPhoto))}>View</button>
                <button onClick={() => downloadOne(finalPhoto, 0)}>Download</button>
              </div>
            </article>
          )}

          {captures.map((p, i) => (
            <article className="gallery-item" key={p.id} data-testid={`gallery-photo-${i}`}>
              <img src={photoUrl(p)} alt={`Photo ${i + 1}`} onClick={() => setModalSrc(photoUrl(p))} style={{ cursor: "zoom-in" }} />
              <div className="gallery-actions">
                <button onClick={() => setModalSrc(photoUrl(p))}>View</button>
                <button onClick={() => downloadOne(p, i)}>Download</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {modalSrc && (
        <div className="modal open" onClick={() => setModalSrc(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalSrc(null)}>×</button>
            <img src={modalSrc} alt="Full size" />
          </div>
        </div>
      )}
    </>
  );
}


