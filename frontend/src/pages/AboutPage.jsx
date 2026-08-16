import Header from "../components/Header";

export default function AboutPage() {
  return (
    <>
      <Header />
      <section className="container about-page" data-testid="about-page">
        <div className="about-card">
          <div className="kicker">About the booth</div>
          <h2>Made for school memories.</h2>
          <p>
            PhotoBooth is a browser-based event booth for school programs, intramurals,
            classroom celebrations, recognition days, and student organizations.
            Every session creates a private, QR-linked photo library students can open
            straight from their phones.
          </p>
          <div className="about-points">
            <div className="about-point"><strong>📷 Camera first</strong><span>Live webcam preview, countdown, camera flip, flash effect, and multi-shot sessions.</span></div>
            <div className="about-point"><strong>🎨 Customize</strong><span>Frames, stickers, event details, captions, and printable compositions.</span></div>
            <div className="about-point"><strong>📱 QR delivery</strong><span>Each session gets one secure QR that links to a mobile-first photo library.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}



