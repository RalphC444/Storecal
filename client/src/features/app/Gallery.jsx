import { useState, useEffect, useCallback, useRef } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { toast } from "../../components/Toast";
import { resizeImageDataUrl } from "../../lib/images";

export function GalleryView({ addReq }) {
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(() => {
    fetch("/api/gallery").then(r => r.json()).then(d => Array.isArray(d) && setImages(d)).catch(() => setImages([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Top-nav "Add photos" action opens the file picker.
  const addSeen = useRef(addReq);
  useEffect(() => { if (addReq !== addSeen.current) { addSeen.current = addReq; fileRef.current?.click(); } }, [addReq]);

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setErr("");
    for (const f of files) {
      try {
        const url = await resizeImageDataUrl(f);
        const res = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) setImages(list => [...(list || []), d]); // append (display order is manual)
        else setErr(d.error || "Couldn’t add that image");
      } catch { setErr("Couldn’t process an image"); }
    }
    setBusy(false); toast("Gallery updated");
  }

  async function remove(img) {
    setImages(list => {
      const next = list.filter(i => i._id !== img._id);
      // If the cover was removed, the newest remaining photo becomes cover (list is newest-first).
      if (img.cover && next.length) next[0] = { ...next[0], cover: true };
      return next;
    });
    const res = await fetch(`/api/gallery/${img._id}`, { method: "DELETE" });
    if (res.ok) toast("Photo removed"); else { setErr("Couldn’t remove photo"); load(); }
  }

  async function setCover(img) {
    setImages(list => list.map(i => ({ ...i, cover: i._id === img._id })));
    const res = await fetch(`/api/gallery/${img._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cover: true }) });
    if (res.ok) toast("Cover photo set"); else { setErr("Couldn’t set cover"); load(); }
  }

  // Drag-to-reorder (native HTML5 DnD). Reorder locally as you drag over a tile,
  // then persist the final order on drop. Best-effort: on failure, reload.
  const dragFrom = useRef(null);
  function onDragStart(i) { dragFrom.current = i; }
  function onDragOver(e, i) {
    e.preventDefault();
    const from = dragFrom.current;
    if (from === null || from === i) return;
    setImages(list => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragFrom.current = i;
  }
  async function onDrop() {
    dragFrom.current = null;
    const ids = (images || []).map(i => i._id);
    const res = await fetch("/api/gallery/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    if (res.ok) toast("Order saved"); else { setErr("Couldn’t save order"); load(); }
  }

  return (
    <div className="pageview">
      <div className="pageview__head">
        <h1 className="pageview__title">Gallery</h1>
        <button className="btn btn--new" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Uploading…" : "+ Add photos"}</button>
      </div>
      <div className="pageview__body">
        <p className="panel__hint">Photos shown in your website’s gallery. <b>Drag to reorder.</b> Mark one as the <b>cover</b> to feature it in the site hero (it won’t appear in the gallery grid). JPG or PNG, up to 40 images.</p>
        {err && <p className="form__error">{err}</p>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
        {!images ? <LoadingSpinner /> : (
          <div className="gallery-grid">
            <button type="button" className="gallery-add" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add photo">
              <span className="gallery-add__plus">+</span>
              <span className="gallery-add__t">{busy ? "Uploading…" : "Add photo"}</span>
            </button>
            {images.map((img, i) => (
              <div
                key={img._id}
                className={"gallery-item" + (img.cover ? " gallery-item--cover" : "")}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={onDrop}
                onDragEnd={() => { dragFrom.current = null; }}
              >
                <img src={img.url} alt={img.caption || ""} loading="lazy" draggable={false} />
                {img.cover
                  ? <span className="gallery-badge">★ Cover</span>
                  : <button className="gallery-cover-btn" onClick={() => setCover(img)}>Set as cover</button>}
                <button className="gallery-rm" onClick={() => remove(img)} aria-label="Remove photo">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Per-staff photo gallery (up to 15). The staff member manages their own from
// the "My gallery" tab (standalone), and it previews inside the booking widget
// and on the website when the operator has staff galleries enabled.
export function StaffGallery({ providerId, addReq, standalone }) {
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const MAX = 15;

  const load = useCallback(() => {
    if (!providerId) return;
    fetch(`/api/gallery?providerId=${providerId}`).then(r => r.json()).then(d => Array.isArray(d) && setImages(d)).catch(() => setImages([]));
  }, [providerId]);
  useEffect(() => { load(); }, [load]);

  // Top-nav "Add photos" action opens the file picker (ignore initial mount).
  const mounted = useRef(false);
  useEffect(() => { if (mounted.current) fileRef.current?.click(); else mounted.current = true; }, [addReq]);

  async function onFiles(e) {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length) return;
    setBusy(true); setErr("");
    for (const f of files) {
      try {
        const url = await resizeImageDataUrl(f);
        const res = await fetch("/api/gallery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, providerId }) });
        const d = await res.json().catch(() => ({}));
        if (res.ok) setImages(list => [d, ...(list || [])]);
        else setErr(d.error || "Couldn’t add that image");
      } catch { setErr("Couldn’t process an image"); }
    }
    setBusy(false); toast("Gallery updated");
  }
  async function remove(img) {
    setImages(list => list.filter(i => i._id !== img._id));
    const res = await fetch(`/api/gallery/${img._id}`, { method: "DELETE" });
    if (res.ok) toast("Photo removed"); else { setErr("Couldn’t remove photo"); load(); }
  }

  const count = images ? images.length : 0;
  const grid = !images ? <LoadingSpinner /> : (
    <div className="gallery-grid">
      {count < MAX && (
        <button type="button" className="gallery-add" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add photo">
          <span className="gallery-add__plus">+</span>
          <span className="gallery-add__t">{busy ? "Uploading…" : "Add photo"}</span>
        </button>
      )}
      {images.map(img => (
        <div key={img._id} className="gallery-item">
          <img src={img.url} alt={img.caption || ""} loading="lazy" />
          <button className="gallery-rm" onClick={() => remove(img)} aria-label="Remove photo">✕</button>
        </div>
      ))}
    </div>
  );

  const picker = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />;

  if (standalone) {
    return (
      <div className="pageview">
        <div className="pageview__head">
          <h1 className="pageview__title">My gallery</h1>
          <button className="btn btn--new" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Uploading…" : "Add photos"}</button>
        </div>
        <div className="pageview__body">
          <p className="panel__hint">Show off your work — these photos appear next to your name when clients book, and on the website. Up to {MAX} ({count}/{MAX} used).</p>
          {err && <p className="form__error">{err}</p>}
          {picker}
          {grid}
        </div>
      </div>
    );
  }

  return (
    <section className="panel__block">
      <h3 className="schedule__label">Gallery</h3>
      <p className="panel__hint">Photos of your work, shown on the website. Up to {MAX} — {count}/{MAX} used.</p>
      {err && <p className="form__error">{err}</p>}
      {picker}
      {grid}
    </section>
  );
}

