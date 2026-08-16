import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import HomePage from "./pages/HomePage";
import GalleryPage from "./pages/GalleryPage";
import AboutPage from "./pages/AboutPage";
import GalleryNotFound from "./pages/GalleryNotFound";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:token" element={<GalleryPage />} />
        <Route path="/gallery-not-found" element={<GalleryNotFound />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <Toaster position="bottom-center" richColors />
    </BrowserRouter>
  );
}


