import { Link, useLocation } from "react-router-dom";

export default function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isGallery = pathname.startsWith("/gallery");
  const isAbout = pathname === "/about";

  return (
    <header className="pb-header" data-testid="app-header">
      <div className="container nav">
        <Link to="/" className="brand" data-testid="brand-link">
          <div className="brand-mark">✦</div>
          <div className="brand-copy">
            <strong>PHOTOBOOTH</strong>
            <span>BEC • SCHOOL EVENTS</span>
          </div>
        </Link>
        <nav className="nav-links">
          <Link to="/" className={isHome ? "active" : ""} data-testid="nav-home">Home</Link>
          <Link to="/gallery" className={isGallery ? "active" : ""} data-testid="nav-gallery">Gallery</Link>
          <Link to="/about" className={isAbout ? "active" : ""} data-testid="nav-about">About</Link>
        </nav>
        <div className="event-pill">✦ CAPTURE THE MOMENT</div>
      </div>
    </header>
  );
}



