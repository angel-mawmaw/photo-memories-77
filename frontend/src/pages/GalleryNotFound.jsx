import Header from "../components/Header";
import { Link } from "react-router-dom";

export default function GalleryNotFound() {
  return (
    <>
      <Header />
      <section className="container gallery-page" data-testid="gallery-not-found">
        <div className="gallery-empty">
          <div style={{ fontSize: 42, marginBottom: 10 }}>🔍</div>
          <strong>Gallery not found</strong>
          <span>This QR link may be invalid or has been removed. Please check with the photobooth operator.</span>
          <div style={{ marginTop: 20 }}>
            <Link to="/" className="btn btn-primary" data-testid="back-home-btn" style={{ display: "inline-block", padding: "10px 20px", textDecoration: "none" }}>
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}


