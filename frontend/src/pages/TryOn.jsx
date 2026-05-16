import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as api from "../lib/api";

export default function TryOn({ session }) {
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [personPreview, setPersonPreview] = useState("");
  const [personBase64, setPersonBase64] = useState("");
  const [resultImage, setResultImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const { data: memberships } = await supabase
      .from("closet_members").select("closet_id").eq("user_id", session.user.id);
    if (!memberships?.length) return;
    const ids = memberships.map((m) => m.closet_id);
    const { data } = await supabase.from("items").select("*").in("closet_id", ids);
    setItems(data || []);
  }

  function handlePersonPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPersonPreview(ev.target.result);
      setPersonBase64(ev.target.result);
      setResultImage("");
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!personBase64) { setError("Upload your photo first."); return; }
    if (!selectedItemId) { setError("Select a clothing item."); return; }

    const item = items.find((i) => i.id === selectedItemId);
    if (!item?.image_url) {
      setError("The selected item has no photo. Add a photo to the item first.");
      return;
    }

    setLoading(true);
    setError("");
    setResultImage("");

    // Fetch garment image and convert to base64
    let garmentBase64;
    try {
      const res = await fetch(item.image_url);
      const blob = await res.blob();
      garmentBase64 = await blobToBase64(blob);
    } catch {
      setError("Could not load the garment image.");
      setLoading(false);
      return;
    }

    const data = await api.generateTryOn(personBase64, garmentBase64, `${item.name} ${item.color} ${item.type}`);
    setLoading(false);

    if (!data.ok) { setError(data.error); return; }
    setResultImage(data.resultImage);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const selectedItem = items.find((i) => i.id === selectedItemId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">T</div>
          <strong>Tryunex</strong>
        </div>
        <div className="topbar-right">
          <Link to="/" className="btn-ghost">← Dashboard</Link>
        </div>
      </header>

      <main className="main-content">
        <div className="tryon-layout">
          <section className="panel">
            <h2>Virtual try-on</h2>
            <p className="panel-sub">
              Powered by IDM-VTON on HuggingFace — free, no GPU needed locally.
              Upload your photo and pick a clothing item from your wardrobe.
            </p>

            <div className="tryon-controls">
              <label className="field">
                <span>Your photo</span>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePersonPhoto} />
              </label>

              <label className="field">
                <span>Clothing item</span>
                <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
                  <option value="">Select an item</option>
                  {items.filter((i) => i.image_url).map((i) => (
                    <option key={i.id} value={i.id}>{i.name} · {i.type} · {i.color}</option>
                  ))}
                </select>
              </label>
              {items.filter((i) => i.image_url).length === 0 && (
                <p className="panel-sub">No items with photos yet. Add a photo when uploading clothes.</p>
              )}

              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={loading || !personBase64 || !selectedItemId}
              >
                {loading ? "Generating… (may take 30–60s)" : "Generate try-on"}
              </button>

              {error && <p className="auth-error">{error}</p>}
            </div>
          </section>

          <section className="panel tryon-preview-panel">
            <h3>Preview</h3>
            <div className="tryon-previews">
              <div className="tryon-slot">
                <p>You</p>
                {personPreview ? (
                  <img src={personPreview} alt="Your photo" className="tryon-img" />
                ) : (
                  <div className="tryon-placeholder">Upload your photo</div>
                )}
              </div>

              <div className="tryon-slot">
                <p>Garment</p>
                {selectedItem?.image_url ? (
                  <img src={selectedItem.image_url} alt={selectedItem.name} className="tryon-img" />
                ) : (
                  <div className="tryon-placeholder">Select a clothing item</div>
                )}
              </div>

              <div className="tryon-slot tryon-result">
                <p>Result</p>
                {loading ? (
                  <div className="tryon-placeholder">
                    <div className="loading-spinner" />
                    <small>HuggingFace is processing…</small>
                  </div>
                ) : resultImage ? (
                  <img src={resultImage} alt="Try-on result" className="tryon-img" />
                ) : (
                  <div className="tryon-placeholder">Result will appear here</div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
