import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { ToastHost } from "../../components/Toast";
import { useIsMobile } from "../../lib/hooks";
import { useAppointmentEvents } from "../../lib/realtime";
import { GALLERY_TYPES, TEAM_LABEL } from "../../lib/businessTypes";
import { addDaysKey, toMin, todayKey, weekStartOf } from "../../lib/datetime";
import { WeekCalendar, StoreHoursModal } from "./Calendar";
import { AppointmentModal } from "./Appointments";
import { ClientsView } from "./Clients";
import { ProvidersView, ProviderSelfView, ProviderHoursModal } from "./Staff";
import { ServicesView } from "./Services";
import { GalleryView, StaffGallery } from "./Gallery";
import { SettingsView } from "./Settings";
import { ScheduleEditor } from "./Scheduling";

export function StoreApp({ user, onSignOut, onUserChange }) {
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [shopName, setShopName] = useState("Salon Booking");
  const [businessType, setBusinessType] = useState("salon");
  const [showStaff, setShowStaff] = useState(true);
  const [showGallery, setShowGallery] = useState(true);
  const isProvider = user.role === "provider";
  const [view, setView] = useState("calendar"); // "calendar" | "clients" | "providers"
  // Providers only ever see their own calendar — lock the filter to themselves.
  const [selected, setSelected] = useState(isProvider ? user.providerId : "all");

  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(weekStartOf(todayKey()));
  const [selectedDay, setSelectedDay] = useState(todayKey());

  const [editing, setEditing] = useState(null); // null | {} | {…appt}
  const [storeHoursOpen, setStoreHoursOpen] = useState(false);
  const [hoursVersion, setHoursVersion] = useState(0); // bump → calendar refetches hours
  const [addReq, setAddReq] = useState(0); // bump to trigger the active tab's "add" modal

  const [mobileOpen, setMobileOpen] = useState(false); // drawer on small screens

  const loadProviders = useCallback(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then(data => Array.isArray(data) && setProviders(data));
  }, []);

  useEffect(() => {
    loadProviders();
    fetch("/api/shop-config")
      .then(r => r.json())
      .then(cfg => {
        if (Array.isArray(cfg.services)) setServices(cfg.services);
        if (cfg.shop?.name) setShopName(cfg.shop.name);
        if (cfg.shop?.businessType) setBusinessType(cfg.shop.businessType);
        setShowStaff(cfg.showStaff !== false);
        setShowGallery(cfg.showGallery !== false);
      })
      .catch(() => {});
    // Re-key on the signed-in shop so switching accounts (without a full
    // remount) refreshes the store name/config instead of showing stale data.
  }, [loadProviders, user.shopId]);

  const teamLabel = TEAM_LABEL[businessType] || TEAM_LABEL.generic;
  const isMobile = useIsMobile();

  const weekEnd = addDaysKey(weekStart, 6);

  // silent = background refresh (no loading spinner) so polling doesn't flicker.
  const loadAppts = useCallback((opts) => {
    if (!opts?.silent) setLoading(true);
    const p = new URLSearchParams({ from: weekStart, to: weekEnd });
    if (selected !== "all") p.set("providerId", selected);
    fetch(`/api/appointments?${p}`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setAppts(data))
      .finally(() => { if (!opts?.silent) setLoading(false); });
  }, [weekStart, weekEnd, selected]);

  useEffect(() => { loadAppts(); }, [loadAppts]);

  // Live updates: a booking made anywhere (the embed, another admin tab, a phone
  // booking) pushes an event over the socket and the calendar refetches instantly
  // — no manual reload. We refetch (silent) rather than merge so the current week
  // window and provider filter are always respected.
  useAppointmentEvents(useCallback(() => {
    if (view === "calendar") loadAppts({ silent: true });
  }, [view, loadAppts]));

  // Fallback refresh in case the socket drops (proxy hiccup, sleep/wake): a slow
  // poll plus a refresh when the tab regains focus. The socket carries the
  // real-time load; this is just a safety net.
  useEffect(() => {
    if (view !== "calendar") return;
    const refresh = () => { if (document.visibilityState === "visible") loadAppts({ silent: true }); };
    const id = setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [view, loadAppts]);

  async function saveAppt(id, payload) {
    const res = await fetch(id ? `/api/appointments/${id}` : "/api/appointments", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || "Could not save the appointment");
    }
    setEditing(null);
    loadAppts();
  }

  async function updateStatus(id, status, message) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, message }),
    });
    setAppts(prev => prev.map(a => a._id === id ? { ...a, status } : a));
    // Cancelling removes it from the calendar, so close the modal too.
    setEditing(e => {
      if (!e || e._id !== id) return e;
      return status === "cancelled" ? null : { ...e, status };
    });
  }

  const durationOf = useCallback((serviceName) => {
    const s = services.find(x => x.name === serviceName);
    return s?.durationMin || 45;
  }, [services]);

  const dayAppts = appts
    .filter(a => a.dateKey === selectedDay)
    .sort((a, b) => toMin(a.timeValue) - toMin(b.timeValue));

  function goToday() {
    const t = todayKey();
    setWeekStart(weekStartOf(t));
    setSelectedDay(t);
  }
  // Mobile shows one day; step by day and keep the week in sync.
  function stepDay(n) {
    const d = addDaysKey(selectedDay, n);
    setSelectedDay(d);
    setWeekStart(weekStartOf(d));
  }
  function newAt(dateKeyStr, min) {
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    setEditing({
      dateKey: dateKeyStr,
      timeValue: `${hh}:${mm}`,
      providerId: selected !== "all" ? selected : undefined,
    });
  }

  // Hours banner: prompt to add store/work hours until a schedule exists.
  const [hoursNeeded, setHoursNeeded] = useState(false);
  const [provHoursOpen, setProvHoursOpen] = useState(false);
  const hoursId = user.role === "owner" ? "shop" : user.providerId;
  const recheckHours = useCallback(() => {
    if (!hoursId) { setHoursNeeded(false); return; }
    fetch(`/api/availability/${hoursId}`).then(r => r.json()).then(av => {
      const open = av?.weekA?.some(d => d.enabled) || av?.weekB?.some(d => d.enabled);
      setHoursNeeded(!open);
    }).catch(() => {});
  }, [hoursId]);
  useEffect(() => { recheckHours(); }, [recheckHours]);
  const myProvider = providers.find(p => p._id === user.providerId);
  // Re-check the "hours needed" banner and force the calendar to refetch hours
  // (bumping hoursVersion). Called after any hours save, from any editor.
  const refreshHours = useCallback(() => { recheckHours(); setHoursVersion(v => v + 1); }, [recheckHours]);
  function openHours() {
    if (user.role === "owner") setStoreHoursOpen(true);
    else if (myProvider) setProvHoursOpen(true);
  }

  // Subscription: newer accounts must subscribe to turn on online booking. The
  // banner only shows for accounts flagged promptBilling (new signups). Clicking
  // Subscribe goes straight to Stripe Checkout — no in-app plan chooser.
  const [subscribed, setSubscribed] = useState(true);
  const [promptBilling, setPromptBilling] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  useEffect(() => {
    if (user.role !== "owner") { setSubscribed(true); return; }
    fetch("/api/billing").then(r => r.json())
      .then(d => { setSubscribed(!!d.subscribed); setPromptBilling(!!d.promptBilling); })
      .catch(() => {});
  }, [user.role]);
  const needsSubscribe = user.role === "owner" && !hoursNeeded && !subscribed && promptBilling;
  async function startCheckout() {
    setSubBusy(true);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setSubBusy(false);
    if (res.ok && d.url) window.location.href = d.url;
  }

  // Owner manages the whole shop; a provider gets a scoped set of tabs and a
  // "My profile" tab to self-manage their bio, services and hours.
  const galleryTab = GALLERY_TYPES.includes(businessType) && showGallery;
  const NAV = isProvider ? [
    { key: "calendar", label: "My calendar", icon: "calendar" },
    { key: "clients", label: "Clients", icon: "clients" },
    { key: "myprofile", label: "My profile", icon: "scissors" },
    ...(galleryTab ? [{ key: "mygallery", label: "My gallery", icon: "image" }] : []),
    { key: "settings", label: "Settings", icon: "settings" },
  ] : [
    { key: "calendar", label: "Calendar", icon: "calendar" },
    { key: "services", label: "Services", icon: "tag" },
    ...(galleryTab ? [{ key: "gallery", label: "Gallery", icon: "image" }] : []),
    { key: "clients", label: "Clients", icon: "clients" },
    // Staff/team tab hidden when the operator has turned staff off (e.g. auto shops).
    ...(showStaff ? [{ key: "providers", label: teamLabel, icon: "scissors" }] : []),
    { key: "settings", label: "Settings", icon: "settings" },
  ];
  const go = (v) => { setView(v); setMobileOpen(false); };

  // Context action shown fixed in the mobile top nav, per active tab.
  const topAction =
    view === "settings" ? null
    : view === "calendar" ? (isProvider ? { label: "My hours", onClick: openHours } : { label: "Store hours", onClick: () => setStoreHoursOpen(true) })
    : view === "myprofile" ? { label: "My hours", onClick: openHours }
    : view === "providers" ? { label: `Add ${teamLabel.replace(/s$/, "").toLowerCase()}`, onClick: () => setAddReq(n => n + 1) }
    : view === "services" ? { label: "Add service", onClick: () => setAddReq(n => n + 1) }
    : view === "gallery" || view === "mygallery" ? { label: "Add photos", onClick: () => setAddReq(n => n + 1) }
    : { label: "Add client", onClick: () => setAddReq(n => n + 1) };

  const hoursLabel = user.role === "owner" ? "store hours" : "work hours";

  return (
    <div className="viewport">
      <ToastHost />
      {hoursNeeded && (
        <div className="hoursbanner">
          <span>⚠️ Add your {hoursLabel} so clients can book — it only takes a minute.</span>
          <button className="hoursbanner__cta" onClick={openHours}>Add {hoursLabel}</button>
        </div>
      )}
      {needsSubscribe && (
        <div className="hoursbanner hoursbanner--sub">
          <span>💳 Set up your payment method to turn on online booking for your website.</span>
          <button className="hoursbanner__cta" onClick={startCheckout} disabled={subBusy}>{subBusy ? "Opening…" : "Subscribe"}</button>
        </div>
      )}
      <div className={`shell${mobileOpen ? " shell--open" : ""}`}>
      <div className="scrim" onClick={() => setMobileOpen(false)} />

      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="brand">
            <span className="brand__mark"><BrandLogo /></span>
            <span className="brand__name">StoreCal</span>
          </div>
          <div className="ws">{shopName}</div>
        </div>

        <nav className="navlist">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`navlink${view === n.key ? " navlink--on" : ""}`}
              onClick={() => go(n.key)}
              title={n.label}
            >
              <Icon name={n.icon} />
              <span className="navlink__txt">{n.label}</span>
              {n.badge > 0 && <span className="navbadge">{n.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar__spacer" />

        <button className="newbtn" onClick={() => { setEditing({ dateKey: selectedDay }); setMobileOpen(false); }} title="New appointment">
          <Icon name="plus" /><span className="navlink__txt">New appointment</span>
        </button>

        <div className="userprofile">
          {/* Account link disabled for now — Settings lives in the nav above.
              The store name + sign-out stay here. */}
          <div className="userprofile__acct userprofile__acct--static">
            <span className="userprofile__av">{(user.name || user.email).slice(0, 1).toUpperCase()}<span className="userprofile__dot" /></span>
            <span className="userprofile__meta">
              <span className="userprofile__name">{user.name || user.email}</span>
              <span className="userprofile__role">{user.role === "owner" ? "Owner" : "Staff"}</span>
            </span>
          </div>
          <button className="userprofile__out" onClick={onSignOut} title="Sign out" aria-label="Sign out">
            <Icon name="signout" />
          </button>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <button className="hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="topbar__title">{shopName}</span>
          {topAction
            ? <button className="topbar__cta" onClick={topAction.onClick}>{topAction.label}</button>
            : <span className="topbar__cta-spacer" />}
        </div>

        {view === "calendar" ? (
          <WeekCalendar
            weekStart={weekStart}
            selectedDay={selectedDay}
            appts={appts}
            loading={loading}
            providers={providers}
            providerId={selected}
            teamLabel={teamLabel}
            isMobile={isMobile}
            lockProvider={isProvider}
            hoursVersion={hoursVersion}
            onSelectProvider={setSelected}
            durationOf={durationOf}
            onPrev={() => isMobile ? stepDay(-1) : setWeekStart(w => addDaysKey(w, -7))}
            onNext={() => isMobile ? stepDay(1) : setWeekStart(w => addDaysKey(w, 7))}
            onToday={goToday}
            onSelectDay={setSelectedDay}
            onSelectAppt={a => setEditing(a)}
            onNewAt={newAt}
            hoursLabel={isProvider ? "My hours" : "Store hours"}
            onStoreHours={openHours}
          />
        ) : view === "myprofile" ? (
          <ProviderSelfView provider={myProvider} onChange={loadProviders} onEditHours={() => setProvHoursOpen(true)} />
        ) : view === "providers" ? (
          <ProvidersView onChange={loadProviders} teamLabel={teamLabel} addReq={addReq} user={user} onHoursSaved={refreshHours} />
        ) : view === "services" ? (
          <ServicesView providers={providers} teamLabel={teamLabel} onProvidersChange={loadProviders} addReq={addReq} businessType={businessType} />
        ) : view === "gallery" ? (
          <GalleryView addReq={addReq} />
        ) : view === "mygallery" ? (
          <StaffGallery providerId={myProvider?._id} addReq={addReq} standalone />
        ) : view === "settings" ? (
          <SettingsView user={user} onUserChange={onUserChange} onSignOut={onSignOut} />
        ) : (
          <ClientsView providers={providers} services={services} durationOf={durationOf} onApptSaved={loadAppts} addReq={addReq} businessType={businessType} />
        )}
      </main>

      {view === "calendar" && (
        <button className="fab" onClick={() => setEditing({ dateKey: selectedDay })} aria-label="New appointment">
          <Icon name="plus" />
        </button>
      )}

      {editing && (
        <AppointmentModal
          appt={editing}
          providers={providers}
          services={services}
          durationOf={durationOf}
          businessType={businessType}
          onClose={() => setEditing(null)}
          onSave={saveAppt}
          onStatusChange={updateStatus}
        />
      )}

      {storeHoursOpen && <StoreHoursModal onSaved={refreshHours} onClose={() => { setStoreHoursOpen(false); refreshHours(); }} />}
      {provHoursOpen && myProvider && (
        <ProviderHoursModal provider={myProvider} onSaved={refreshHours} onClose={() => { setProvHoursOpen(false); refreshHours(); }} />
      )}
      </div>
    </div>
  );
}

// ── Week calendar (Teams-style day × time grid) ─────────────────────────────


export function OnboardingHours({ user, onDone }) {
  const isOwner = user.role === "owner";
  const provider = isOwner ? { _id: "shop", name: "Store" } : { _id: user.providerId, name: user.name || "You" };
  return (
    <div className="authwrap authwrap--wide">
      <div className="authcard authcard--wide">
        <div className="authcard__brand">
          <span className="brand__mark"><BrandLogo /></span>
          <span className="brand__name">StoreCal</span>
        </div>
        <h1 className="authcard__title">Add your {isOwner ? "store" : "work"} hours</h1>
        <p className="authcard__sub">This is the most important step — clients can only book during these hours. You can change them anytime.</p>
        <div className="onboard__editor">
          <ScheduleEditor provider={provider} mode={isOwner ? "store" : "stylist"} />
        </div>
        <div className="authcard__foot authcard__foot--split">
          <button className="linkbtn" onClick={onDone}>Skip for now</button>
          <button className="btn" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
