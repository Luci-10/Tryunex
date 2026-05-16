import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import * as api from "../lib/api";

const TYPES = ["Top", "Bottom", "Shoes", "Layer", "Accessory"];

export default function Dashboard({ session }) {
  const [profile, setProfile] = useState(null);
  const [closets, setClosets] = useState([]);
  const [selectedClosetId, setSelectedClosetId] = useState(null);
  const [items, setItems] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("wardrobe");
  const [statusMsg, setStatusMsg] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const user = session.user;
  const selectedCloset = closets.find((c) => c.id === selectedClosetId);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (selectedClosetId) loadClosetData(selectedClosetId); }, [selectedClosetId]);

  async function loadAll() {
    setLoading(true);
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(prof);

    const { data: memberships } = await supabase
      .from("closet_members").select("closet_id").eq("user_id", user.id);
    if (!memberships?.length) { setLoading(false); return; }

    const ids = memberships.map((m) => m.closet_id);
    const { data: closetRows } = await supabase.from("closets").select("*").in("id", ids);
    setClosets(closetRows || []);
    setSelectedClosetId(closetRows?.[0]?.id || null);
    setLoading(false);
  }

  async function loadClosetData(closetId) {
    const [{ data: itemRows }, { data: outfitRows }, { data: memberRows }] = await Promise.all([
      supabase.from("items").select("*").eq("closet_id", closetId).order("created_at", { ascending: false }),
      supabase.from("outfits").select("*").eq("closet_id", closetId).order("created_at", { ascending: false }),
      supabase.from("closet_members")
        .select("user_id, profiles(id, name, email)")
        .eq("closet_id", closetId),
    ]);
    setItems(itemRows || []);
    setOutfits(outfitRows || []);
    setMembers(memberRows || []);
    await ensureWeeklyReset(closetId, itemRows || []);
  }

  async function ensureWeeklyReset(closetId, currentItems) {
    const closet = closets.find((c) => c.id === closetId);
    if (!closet) return;
    const sunday = mostRecentSunday();
    if (closet.last_laundry_reset === sunday) return;
    await Promise.all([
      supabase.from("closets").update({ last_laundry_reset: sunday }).eq("id", closetId),
      supabase.from("items").update({ status: "available" }).eq("closet_id", closetId),
    ]);
    setItems(currentItems.map((i) => ({ ...i, status: "available" })));
  }

  function mostRecentSunday() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }

  function flash(msg) {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 3500);
  }

  async function handleAddItem(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    let imageUrl = "";

    const file = fd.get("image");
    if (file instanceof File && file.size) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const { data: upload } = await supabase.storage.from("wardrobe").upload(path, file);
      if (upload) {
        const { data: { publicUrl } } = supabase.storage.from("wardrobe").getPublicUrl(upload.path);
        imageUrl = publicUrl;
      }
    }

    await supabase.from("items").insert({
      closet_id: selectedClosetId,
      name: fd.get("name").trim(),
      type: fd.get("type"),
      color: fd.get("color").trim(),
      notes: fd.get("notes").trim(),
      image_url: imageUrl,
    });
    e.target.reset();
    flash("Item added to wardrobe.");
    loadClosetData(selectedClosetId);
  }

  async function toggleStatus(item) {
    const newStatus = item.status === "available" ? "worn" : "available";
    await supabase.from("items").update({
      status: newStatus,
      last_worn_on: newStatus === "worn" ? new Date().toISOString().slice(0, 10) : item.last_worn_on,
    }).eq("id", item.id);
    loadClosetData(selectedClosetId);
  }

  async function deleteItem(item) {
    if (!confirm(`Remove "${item.name}"?`)) return;
    await supabase.from("items").delete().eq("id", item.id);
    flash("Item removed.");
    loadClosetData(selectedClosetId);
  }

  async function handlePlanOutfit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const itemIds = ["topId", "bottomId", "shoesId", "extraId"]
      .map((k) => fd.get(k)).filter(Boolean);
    if (!itemIds.length) { flash("Select at least one item."); return; }

    await Promise.all([
      supabase.from("outfits").insert({
        closet_id: selectedClosetId,
        occasion: fd.get("occasion").trim(),
        comment: fd.get("comment").trim(),
        chosen_by_user_id: user.id,
        item_ids: itemIds,
      }),
      supabase.from("items").update({ status: "worn", last_worn_on: new Date().toISOString().slice(0, 10) }).in("id", itemIds),
    ]);
    e.target.reset();
    flash("Outfit saved. Items moved to worn.");
    loadClosetData(selectedClosetId);
  }

  async function handleJoin(e) {
    e.preventDefault();
    const code = e.target.shareCode.value.trim().toUpperCase();
    const { data: closet } = await supabase.from("closets").select("*").eq("share_code", code).single();
    if (!closet) { flash("Share code not found."); return; }
    if (closets.some((c) => c.id === closet.id)) { flash("Already a member of that wardrobe."); return; }
    await supabase.from("closet_members").insert({ closet_id: closet.id, user_id: user.id });
    flash("Joined shared wardrobe!");
    e.target.reset();
    loadAll();
  }

  async function handleManualReset() {
    if (!confirm("Mark all clothes as washed and move them back to available?")) return;
    const sunday = mostRecentSunday();
    await Promise.all([
      supabase.from("closets").update({ last_laundry_reset: sunday }).eq("id", selectedClosetId),
      supabase.from("items").update({ status: "available" }).eq("closet_id", selectedClosetId),
    ]);
    flash("All clothes moved back to available.");
    loadClosetData(selectedClosetId);
  }

  async function handleAiSuggest(e) {
    e.preventDefault();
    const occasion = e.target.occasion.value.trim();
    const available = items.filter((i) => i.status === "available");
    if (!available.length) { flash("No available items for the AI to suggest from."); return; }
    setAiLoading(true);
    setAiResult(null);
    const data = await api.suggestOutfit(occasion, available);
    setAiLoading(false);
    if (!data.ok) { flash(data.error || "AI suggestion failed."); return; }
    setAiResult(data.suggestion);
    // Pre-fill outfit planner
    if (data.suggestion) {
      const find = (name) => items.find((i) => i.name === name)?.id || "";
      const s = data.suggestion;
      document.querySelector('[name="topId"]').value = find(s.top);
      document.querySelector('[name="bottomId"]').value = find(s.bottom);
      document.querySelector('[name="shoesId"]').value = find(s.shoes);
      document.querySelector('[name="extraId"]').value = find(s.extra);
      document.querySelector('[name="occasion"]').value = occasion;
      setActiveTab("planner");
      flash(`AI suggested an outfit (via ${data.source}). Check the planner tab.`);
    }
  }

  const filteredItems = items.filter((item) => {
    const matchFilter = filter === "all" || item.status === filter;
    const matchSearch = !search || [item.name, item.type, item.color, item.notes]
      .join(" ").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const availableItems = items.filter((i) => i.status === "available");

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">T</div>
          <strong>Tryunex</strong>
        </div>
        <div className="topbar-right">
          {closets.length > 1 && (
            <select
              className="closet-select"
              value={selectedClosetId || ""}
              onChange={(e) => setSelectedClosetId(e.target.value)}
            >
              {closets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Link to="/tryon" className="btn-ghost">Try-on AI</Link>
          <span className="user-pill">{profile?.name || user.email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </header>

      {statusMsg && <div className="status-bar">{statusMsg}</div>}

      <div className="tabs">
        {[
          ["wardrobe", "Wardrobe"],
          ["planner", "Outfit Planner"],
          ["ai", "AI Stylist"],
          ["share", "Share Closet"],
          ["history", "History"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`tab${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="main-content">
        {/* WARDROBE */}
        {activeTab === "wardrobe" && (
          <div className="wardrobe-layout">
            <section className="panel">
              <h3>Add clothing</h3>
              <form className="stack-form" onSubmit={handleAddItem}>
                <label className="field">
                  <span>Name</span>
                  <input name="name" type="text" placeholder="Black linen shirt" required />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>Type</span>
                    <select name="type" required>
                      <option value="">Select</option>
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Color</span>
                    <input name="color" type="text" placeholder="Black" required />
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <textarea name="notes" rows={2} placeholder="Office, gym, date..." />
                </label>
                <label className="field">
                  <span>Photo</span>
                  <input name="image" type="file" accept="image/*" />
                </label>
                <button className="btn-primary" type="submit">Add to wardrobe</button>
              </form>
            </section>

            <section className="panel closet-panel">
              <div className="closet-toolbar">
                <div className="filter-chips">
                  {["all", "available", "worn"].map((f) => (
                    <button
                      key={f}
                      className={`chip${filter === f ? " active" : ""}`}
                      onClick={() => setFilter(f)}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn-ghost" onClick={handleManualReset}>Reset as washed</button>
              </div>

              <div className="stats-row">
                <div className="stat-pill">
                  <strong>{items.filter((i) => i.status === "available").length}</strong>
                  <span>available</span>
                </div>
                <div className="stat-pill">
                  <strong>{items.filter((i) => i.status === "worn").length}</strong>
                  <span>worn</span>
                </div>
                <div className="stat-pill">
                  <strong>{outfits.length}</strong>
                  <span>outfits</span>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <p className="empty-state">No clothes match this filter yet.</p>
              ) : (
                <div className="clothes-grid">
                  {filteredItems.map((item) => (
                    <article key={item.id} className="item-card">
                      <div
                        className="item-image"
                        style={
                          item.image_url
                            ? { backgroundImage: `url(${item.image_url})` }
                            : { background: `hsl(${item.type.length * 42}, 60%, 80%)` }
                        }
                      />
                      <div className="item-body">
                        <div className="item-meta">
                          <span className="tag">{item.type}</span>
                          <span className={`status-pill ${item.status}`}>{item.status}</span>
                        </div>
                        <strong>{item.name}</strong>
                        <p>{item.notes || `${item.color} ${item.type.toLowerCase()}`}</p>
                        <div className="item-actions">
                          <button className="btn-sm" onClick={() => toggleStatus(item)}>
                            {item.status === "available" ? "Mark worn" : "Mark available"}
                          </button>
                          <button className="btn-sm danger" onClick={() => deleteItem(item)}>Remove</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* OUTFIT PLANNER */}
        {activeTab === "planner" && (
          <div className="single-panel">
            <section className="panel">
              <h3>Plan an outfit</h3>
              <form className="stack-form" onSubmit={handlePlanOutfit}>
                <label className="field">
                  <span>Going where?</span>
                  <input name="occasion" type="text" placeholder="Office, dinner, airport…" required />
                </label>
                {[["topId", "Top"], ["bottomId", "Bottom"], ["shoesId", "Shoes"], ["extraId", "Layer / Accessory"]].map(([name, label]) => (
                  <label key={name} className="field">
                    <span>{label}</span>
                    <select name={name}>
                      <option value="">Skip</option>
                      {availableItems
                        .filter((i) => name === "extraId"
                          ? i.type === "Layer" || i.type === "Accessory"
                          : i.type === label)
                        .map((i) => <option key={i.id} value={i.id}>{i.name} · {i.color}</option>)}
                    </select>
                  </label>
                ))}
                <label className="field">
                  <span>Comment</span>
                  <textarea name="comment" rows={2} placeholder="Picked by Tara for Friday dinner" />
                </label>
                <button className="btn-primary" type="submit">Save outfit and move to worn</button>
              </form>
            </section>
          </div>
        )}

        {/* AI STYLIST */}
        {activeTab === "ai" && (
          <div className="single-panel">
            <section className="panel">
              <h3>AI stylist</h3>
              <p className="panel-sub">
                Uses Gemma 3 via Ollama locally, or Groq free API as fallback. Make sure the backend is running.
              </p>
              <form className="stack-form" onSubmit={handleAiSuggest}>
                <label className="field">
                  <span>Where are you going?</span>
                  <input name="occasion" type="text" placeholder="Office, date night, airport…" required />
                </label>
                <button className="btn-primary" disabled={aiLoading}>
                  {aiLoading ? "Thinking…" : "Suggest outfit"}
                </button>
              </form>
              {aiResult && (
                <div className="ai-result">
                  <strong>Suggestion</strong>
                  <ul>
                    {Object.entries(aiResult)
                      .filter(([k, v]) => k !== "reason" && v)
                      .map(([k, v]) => <li key={k}><span className="tag">{k}</span> {v}</li>)}
                  </ul>
                  <p className="ai-reason">{aiResult.reason}</p>
                  <p className="ai-hint">The outfit planner tab has been pre-filled — review and save.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* SHARE CLOSET */}
        {activeTab === "share" && selectedCloset && (
          <div className="share-layout">
            <section className="panel">
              <h3>Your share code</h3>
              <div className="share-code-box">
                <span className="share-code">{selectedCloset.share_code}</span>
                <button
                  className="btn-ghost"
                  onClick={() => navigator.clipboard.writeText(selectedCloset.share_code)
                    .then(() => flash("Code copied!"))
                  }
                >
                  Copy
                </button>
              </div>
              <p className="panel-sub">Anyone can join this wardrobe using this code.</p>

              <h4>Members</h4>
              <div className="member-list">
                {members.map((m) => (
                  <div key={m.user_id} className="member-row">
                    <strong>{m.profiles?.name || "—"}</strong>
                    <small>{m.profiles?.email}</small>
                    {m.user_id === selectedCloset.owner_id && <span className="tag">Owner</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h3>Join a wardrobe</h3>
              <form className="stack-form" onSubmit={handleJoin}>
                <label className="field">
                  <span>Share code</span>
                  <input name="shareCode" type="text" placeholder="ABC123" required />
                </label>
                <button className="btn-primary" type="submit">Join wardrobe</button>
              </form>
            </section>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === "history" && (
          <div className="single-panel">
            <section className="panel">
              <h3>Outfit history</h3>
              {outfits.length === 0 ? (
                <p className="empty-state">No outfits planned yet.</p>
              ) : (
                <div className="history-list">
                  {outfits.map((outfit) => {
                    const outfitItems = outfit.item_ids
                      .map((id) => items.find((i) => i.id === id)?.name)
                      .filter(Boolean);
                    const chooser = members.find((m) => m.user_id === outfit.chosen_by_user_id);
                    return (
                      <article key={outfit.id} className="history-card">
                        <div className="history-top">
                          <strong>{outfit.occasion}</strong>
                          <span className="tag">{chooser?.profiles?.name || "You"}</span>
                        </div>
                        <p>{outfitItems.join(", ") || "No items"}</p>
                        {outfit.comment && <p className="history-comment">{outfit.comment}</p>}
                        <small>{new Date(outfit.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
