import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardList,
  Globe2,
  Leaf,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
  X,
  TriangleAlert,
  RefreshCw,
} from "lucide-react";
import { api, auth, configured, usingEmulators } from "./firebase";
import { messages, type Language, type MessageKey } from "./i18n";
import type { Me, List, Shift, Report, Overview, Worker } from "./types";
import "./style.css";
const LanguageContext = createContext<{
  language: Language;
  t: (key: MessageKey) => string;
  toggle: () => void;
}>({ language: "en", t: (k) => messages.en[k], toggle: () => {} });
const useText = () => useContext(LanguageContext);
const Workspace = createContext<Me | null>(null);
const useWorkspace = () => useContext(Workspace)!;
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
const minutes = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;
function dateTime(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void api<T>(path)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error, loading, reload };
}
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
      <div>{children}</div>
    </div>
  );
}
function Loading() {
  const { t } = useText();
  return (
    <div className="loading" role="status">
      <RefreshCw className="spin" size={22} />
      {t("loading")}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={25} />
      <p>{children}</p>
    </div>
  );
}
function Failed({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useText();
  return (
    <Notice error>
      <p>{message}</p>
      <button className="text-button" onClick={retry}>
        {t("retry")} <RefreshCw size={14} />
      </button>
    </Notice>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Leaf size={23} />
      </span>
      FairShift<span className="brand-dot">.</span>
    </span>
  );
}
function LanguageButton() {
  const { language, t, toggle } = useText();
  return (
    <button
      className="language-button"
      onClick={toggle}
      aria-label={t("language")}
    >
      <Globe2 size={16} />
      {language === "en" ? "தமிழ்" : "English"}
    </button>
  );
}
function SignIn() {
  const { t } = useText();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
    } catch {
      setError(
        "Could not sign in. Check your email and password. / மின்னஞ்சல் மற்றும் கடவுச்சொல்லைச் சரிபார்க்கவும்.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">BETTER WORK, TOGETHER</span>
          <h1>
            Fair work.
            <br />
            Clear pay.
            <br />
            <em>People first.</em>
          </h1>
          <p>
            A little more clarity. A lot more confidence.
            <br />
            Your work, your records, and your voice — in one place.
          </p>
          <div className="story-lines">
            <span>
              <Clock3 size={20} /> Every hour, accounted for.
            </span>
            <span>
              <Wallet size={20} /> Earnings you can understand.
            </span>
            <span>
              <ShieldCheck size={20} /> A safer way to speak up.
            </span>
          </div>
        </div>
        <small>Built for decent work. Inspired by UN SDG 8.</small>
      </section>
      <section className="login-panel">
        <div className="login-tools">
          <LanguageButton />
        </div>
        <div className="login-card">
          <span className="small-icon">
            <Building2 size={25} />
          </span>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{t("signin")}</h2>
          <p className="muted">{t("signinHint")}</p>
          {usingEmulators && (
            <div className="local-label">
              Local test environment · synthetic accounts only
            </div>
          )}
          {!configured && (
            <Notice error>
              Firebase is not configured yet. Add the public Firebase web
              settings described in README to enable sign-in. Your work data
              will stay protected until configuration is complete.
            </Notice>
          )}
          {error && <Notice error>{error}</Notice>}
          <form onSubmit={submit}>
            <label>
              {t("email")}
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!configured}
              />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={!configured}
              />
            </label>
            <button
              className="button primary full"
              disabled={busy || !configured}
            >
              {busy ? t("loading") : t("signin")}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="demo-accounts-box">
            <div className="demo-accounts-header">
              <span className="demo-accounts-title">Demo Accounts (Click to Auto-fill)</span>
              <span className="demo-accounts-sub">Password: Fastforward1</span>
            </div>
            <div className="demo-accounts-grid">
              <button
                type="button"
                className="demo-account-btn"
                onClick={() => {
                  setEmail("worker.construction@fairshift.example");
                  setPassword("Fastforward1");
                  setError("");
                }}
              >
                <div className="demo-btn-top">
                  <span className="demo-badge worker">Worker</span>
                  <span className="demo-sector">Construction</span>
                </div>
                <span className="demo-email-text">worker.construction@fairshift.example</span>
              </button>

              <button
                type="button"
                className="demo-account-btn"
                onClick={() => {
                  setEmail("admin.construction@fairshift.example");
                  setPassword("Fastforward1");
                  setError("");
                }}
              >
                <div className="demo-btn-top">
                  <span className="demo-badge admin">Employer</span>
                  <span className="demo-sector">Construction</span>
                </div>
                <span className="demo-email-text">admin.construction@fairshift.example</span>
              </button>

              <button
                type="button"
                className="demo-account-btn"
                onClick={() => {
                  setEmail("worker.college@fairshift.example");
                  setPassword("Fastforward1");
                  setError("");
                }}
              >
                <div className="demo-btn-top">
                  <span className="demo-badge worker">Worker</span>
                  <span className="demo-sector">College</span>
                </div>
                <span className="demo-email-text">worker.college@fairshift.example</span>
              </button>

              <button
                type="button"
                className="demo-account-btn"
                onClick={() => {
                  setEmail("admin.college@fairshift.example");
                  setPassword("Fastforward1");
                  setError("");
                }}
              >
                <div className="demo-btn-top">
                  <span className="demo-badge admin">Employer</span>
                  <span className="demo-sector">College</span>
                </div>
                <span className="demo-email-text">admin.college@fairshift.example</span>
              </button>
            </div>
          </div>

          <p className="login-help">{t("forgot")}</p>
          <div className="privacy-note">
            <ShieldCheck size={16} /> Your organization’s records stay within
            your workspace.
          </div>
        </div>
        <footer>FairShift · Fair work. Clear pay. Safer workplaces.</footer>
      </section>
    </main>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function Status({ value }: { value: string }) {
  const { t } = useText();
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <span />
      {value === "COMPLETED"
        ? t("completed")
        : value === "ACTIVE"
          ? t("current")
          : value in messages.en
            ? t(value as MessageKey)
            : value}
    </span>
  );
}
function ShiftTable({ shifts }: { shifts: Shift[] }) {
  const { t } = useText();
  const { organization: org, user } = useWorkspace();
  const showWorker = user.role === "ADMIN";
  if (!shifts.length) return <Empty>{t("noShifts")}</Empty>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {showWorker && <th>Worker</th>}
            <th>{t("date")}</th>
            <th>{t("duration")}</th>
            <th>
              {t("regular")} / {t("overtime")}
            </th>
            <th>{t("amount")}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              {showWorker && (
                <td>
                  <span className="cell-strong">
                    {s.worker?.displayName || "Worker outside displayed roster"}
                  </span>
                  <small>{s.worker?.employeeCode || "—"}</small>
                </td>
              )}
              <td>
                <span className="cell-strong">
                  {dateTime(s.checkInAt, org.timeZone)}
                </span>
                <small>
                  {s.checkOutAt
                    ? dateTime(s.checkOutAt, org.timeZone)
                    : t("current")}
                </small>
              </td>
              <td>
                {s.status === "COMPLETED"
                  ? minutes(s.regularMinutes + s.overtimeMinutes)
                  : "—"}
                <small>
                  {s.breakMinutes} {t("minutes")} break
                </small>
              </td>
              <td>
                {minutes(s.regularMinutes)} / {minutes(s.overtimeMinutes)}
                <small>
                  {money(s.hourlyRatePaiseSnapshot)}/h · OT ×
                  {s.overtimeMultiplierSnapshot}
                </small>
              </td>
              <td className="cell-strong">
                {s.status === "COMPLETED" ? money(s.estimatedGrossPaise) : "—"}
                {s.status === "COMPLETED" && (
                  <small>
                    {money(s.regularPayPaise)} + {money(s.overtimePayPaise)}
                  </small>
                )}
              </td>
              <td>
                <Status value={s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function WorkerHome({ earningsOnly = false }: { earningsOnly?: boolean }) {
  const { t } = useText();
  const { user, organization: org } = useWorkspace();
  const resource = useResource<List<Shift>>("/me/shifts");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [breaks, setBreaks] = useState("0");
  const shifts = resource.data?.items || [];
  const active = shifts.find((s) => s.status === "ACTIVE");
  const completed = shifts.filter((s) => s.status === "COMPLETED");
  async function action() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(active ? "/shifts/check-out" : "/shifts/check-in", {
        method: "POST",
        body: JSON.stringify(active ? { breakMinutes: Number(breaks) } : {}),
      });
      setSuccess(t("shiftSaved"));
      resource.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error)
    return <Failed message={resource.error} retry={resource.reload} />;
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{org.name}</span>
          <h1>
            {earningsOnly
              ? t("earnings")
              : `${t("overview")}, ${user.displayName.split(" ")[0]}.`}
          </h1>
          <p>{earningsOnly ? t("estimateHint") : t("welcome")}</p>
        </div>
        <span className="workspace-chip">
          <span />
          {user.employeeCode} · {user.department}
        </span>
      </div>
      {error && <Notice error>{error}</Notice>}
      {success && <Notice>{success}</Notice>}
      {!earningsOnly && (
        <section className={`shift-banner ${active ? "on-shift" : ""}`}>
          <div className="shift-symbol">
            <Clock3 size={31} />
          </div>
          <div className="shift-copy">
            <span className="eyebrow">
              {active ? t("current") : t("attendance")}
            </span>
            <h2>{active ? t("active") : t("inactive")}</h2>
            <p>{active ? t("activeHint") : t("inactiveHint")}</p>
            {active && (
              <small>
                {dateTime(active.checkInAt, org.timeZone)} · {org.timeZone}
              </small>
            )}
          </div>
          <div className="shift-controls">
            {active && (
              <label>
                {t("breaks")}
                <input
                  type="number"
                  value={breaks}
                  min="0"
                  max="1440"
                  step="1"
                  onChange={(e) => setBreaks(e.target.value)}
                  required
                />
              </label>
            )}
            <button
              className="button primary"
              disabled={
                busy ||
                resource.loading ||
                (!!active &&
                  (!breaks ||
                    !Number.isInteger(Number(breaks)) ||
                    Number(breaks) < 0))
              }
              onClick={() => void action()}
            >
              {busy ? t("processing") : active ? t("checkout") : t("checkin")}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}
      <div className="stats-grid worker-stats">
        <Stat
          label={t("total")}
          value={money(
            completed.reduce((a, s) => a + s.estimatedGrossPaise, 0),
          )}
          detail={t("period")}
          icon={<Wallet size={19} />}
        />
        <Stat
          label={t("recorded")}
          value={completed.length}
          detail={t("completed")}
          icon={<ClipboardList size={19} />}
        />
        <Stat
          label={t("overtime")}
          value={minutes(completed.reduce((a, s) => a + s.overtimeMinutes, 0))}
          detail={t("period")}
          icon={<Clock3 size={19} />}
        />
      </div>
      <div className="estimate-note">
        <ShieldCheck size={19} />
        <div>
          <strong>{t("estimate")}</strong>
          <p>{t("estimateHint")}</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{earningsOnly ? t("earnings") : t("recent")}</h2>
            <p>
              {t("period")} · {org.timeZone}
            </p>
          </div>
          <span className="subtle-badge">{shifts.length} records</span>
        </div>
        <ShiftTable shifts={earningsOnly ? completed : shifts} />
        {resource.data?.limited && (
          <p className="panel-footnote">
            Showing the most recent 200 completed shifts.
          </p>
        )}
      </section>
      {!earningsOnly && (
        <NavLink className="report-callout" to="/worker/reports">
          <span className="small-icon">
            <ShieldCheck size={24} />
          </span>
          <div>
            <h3>{t("reportTitle")}</h3>
            <p>{t("reportSubtitle")}</p>
          </div>
          <ArrowUpRight size={23} />
        </NavLink>
      )}
    </>
  );
}
function CaseCard({
  report,
  admin,
  onUpdate,
}: {
  report: Report;
  admin?: boolean;
  onUpdate?: () => void;
}) {
  const { t } = useText();
  const { organization: org } = useWorkspace();
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function update(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: report.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED",
          note,
        }),
      });
      setNote("");
      onUpdate?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="case-card">
      <div className="case-top">
        <span className="case-category">
          <MessageSquare size={17} />
          {report.category}
        </span>
        <Status value={report.status} />
      </div>
      <p className="case-description">{report.description}</p>
      <div className="case-meta">
        <span>#{report.id}</span>
        <span>{dateTime(report.createdAt, org.timeZone)}</span>
        <span className={`priority priority-${report.severity.toLowerCase()}`}>
          {t(report.severity as MessageKey)}
        </span>
      </div>
      {report.history && report.history.length > 0 && (
        <div className="case-history">
          {report.history.map((h) => (
            <div key={h.id}>
              <CheckCircle2 size={15} />
              <div>
                <strong>{t(h.toStatus as MessageKey)}</strong>
                <p>{h.note}</p>
                <small>{dateTime(h.createdAt, org.timeZone)}</small>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <Notice error>{error}</Notice>}
      {admin && report.status !== "RESOLVED" && (
        <form className="case-update" onSubmit={update}>
          <label htmlFor={`note-${report.id}`}>
            Update note
            <input
              id={`note-${report.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={3}
              maxLength={1000}
              required
              placeholder="Explain the next step or resolution"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            {busy
              ? t("processing")
              : report.status === "OPEN"
                ? "Begin review"
                : "Resolve case"}
            <ChevronRight size={16} />
          </button>
        </form>
      )}
    </article>
  );
}
function Reports({ admin = false }: { admin?: boolean }) {
  const { t } = useText();
  const { organization: org } = useWorkspace();
  const resource = useResource<List<Report>>(
    admin ? "/admin/reports" : "/me/reports",
  );
  const [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<Report>("/reports", {
        method: "POST",
        body: JSON.stringify({
          category: f.get("category"),
          severity: f.get("severity"),
          description: f.get("description"),
        }),
      });
      setSuccess(`${t("reportSaved")} #${result.id}`);
      form.reset();
      resource.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reports = (resource.data?.items || []).filter(
    (r) => filter === "ALL" || r.status === filter,
  );
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {admin ? "LISTEN. RESPOND. RESOLVE." : t("reports")}
          </span>
          <h1>
            {admin ? "Every concern deserves a response." : t("reportTitle")}
          </h1>
          <p>
            {admin
              ? "Review confidential cases and keep people informed."
              : t("reportSubtitle")}
          </p>
        </div>
        <span className="workspace-chip">
          <ShieldCheck size={16} />
          {admin ? "Confidential case review" : t("worker")}
        </span>
      </div>
      {!admin && (
        <div className="estimate-note">
          <ShieldCheck size={20} />
          <p>{t("confidential")}</p>
        </div>
      )}
      {success && <Notice>{success}</Notice>}
      <div className={`reports-layout ${admin ? "admin-reports" : ""}`}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{admin ? "Organization cases" : t("history")}</h2>
              <p>
                {admin
                  ? "Reporter names and account IDs are excluded."
                  : t("reports")}
              </p>
            </div>
            <span className="subtle-badge">
              {resource.data?.items.length ?? "—"}
            </span>
          </div>
          <div className="filter-row" aria-label="Case status">
            {["ALL", "OPEN", "IN_PROGRESS", "RESOLVED"].map((v) => (
              <button
                key={v}
                className={filter === v ? "selected" : ""}
                onClick={() => setFilter(v)}
              >
                {v === "ALL" ? t("all") : t(v as MessageKey)}
              </button>
            ))}
          </div>
          {resource.loading ? (
            <Loading />
          ) : resource.error ? (
            <Failed message={resource.error} retry={resource.reload} />
          ) : reports.length ? (
            <div className="case-list">
              {reports.map((report) => (
                <CaseCard
                  key={report.id}
                  report={report}
                  admin={admin}
                  onUpdate={resource.reload}
                />
              ))}
            </div>
          ) : (
            <Empty>{t("noReports")}</Empty>
          )}
          {resource.data?.limited && (
            <p className="panel-footnote">Most recent 200 cases shown.</p>
          )}
        </section>
        {!admin && (
          <section className="panel report-form">
            <div className="panel-heading">
              <div>
                <span className="small-icon">
                  <Plus size={20} />
                </span>
                <h2>{t("newReport")}</h2>
              </div>
            </div>
            {error && <Notice error>{error}</Notice>}
            <form onSubmit={submit}>
              <label>
                {t("category")}
                <select
                  aria-label={t("category")}
                  name="category"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    — {t("category")} —
                  </option>
                  {org.reportCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("severity")}
                <select
                  aria-label={t("severity")}
                  name="severity"
                  defaultValue="MEDIUM"
                >
                  {["LOW", "MEDIUM", "HIGH"].map((p) => (
                    <option key={p} value={p}>
                      {t(p as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("description")}
                <textarea
                  name="description"
                  rows={6}
                  minLength={10}
                  maxLength={2000}
                  required
                  placeholder={t("reportHint")}
                  aria-describedby="report-help"
                />
              </label>
              <p className="field-help" id="report-help">
                {t("reportHint")}
              </p>
              <button className="button primary full" disabled={busy}>
                {busy ? t("processing") : t("submit")}
                <ArrowRight size={17} />
              </button>
            </form>
            <div className="report-reminder">
              <ShieldCheck size={17} />
              <p>{t("confidential")}</p>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
function AdminHome() {
  const { t } = useText();
  const { organization: org } = useWorkspace();
  const resource = useResource<Overview>("/admin/overview");
  if (resource.loading) return <Loading />;
  if (resource.error)
    return <Failed message={resource.error} retry={resource.reload} />;
  const d = resource.data!;
  const total = d.openCases + d.inProgressCases + d.resolvedCases;
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">YOUR PEOPLE. A CLEARER PICTURE.</span>
          <h1>
            Workplace overview<span className="heading-dot">.</span>
          </h1>
          <p>A pulse on your team, and the things that need your attention.</p>
        </div>
        <span className="workspace-chip">
          <span />
          {org.industry === "CONSTRUCTION" ? "Construction" : "College"}{" "}
          workspace
        </span>
      </div>
      <div className="overview-strip">
        <span>
          <Building2 size={19} />
          <strong>{org.name}</strong>
        </span>
        <span>
          {org.timeZone} <span className="dot-divider">·</span> Live
          organization records
        </span>
      </div>
      <div className="stats-grid">
        <Stat
          label="At work now"
          value={d.presentNow}
          detail={`${d.workers} active workers in your organization`}
          icon={<Users size={20} />}
        />
        <Stat
          label="Completed shifts"
          value={d.completedShifts}
          detail={`${d.estimatedShifts} with earnings estimates`}
          icon={<Clock3 size={20} />}
        />
        <Stat
          label="Needs a response"
          value={d.openCases}
          detail="Open confidential cases"
          icon={<MessageSquare size={20} />}
        />
        <Stat
          label="Cases resolved"
          value={d.resolvedCases}
          detail={`${d.inProgressCases} currently in review`}
          icon={<CheckCircle2 size={20} />}
        />
      </div>
      <div className="dashboard-columns">
        <section className="panel fairness-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NOTICE EARLY. ACT WITH CARE.</span>
              <h2>Fairness Monitor</h2>
              <p>Clear rules. Practical next steps.</p>
            </div>
            <span className="small-icon">
              <ShieldCheck size={23} />
            </span>
          </div>
          <div className="alert-list">
            {d.alerts.map((a, i) => (
              <article className="fairness-alert" key={a.key}>
                <span className={`alert-symbol ${a.count ? "attention" : ""}`}>
                  {a.count ? <TriangleAlert size={20} /> : <Check size={20} />}
                </span>
                <div>
                  <div className="alert-title">
                    <h3>
                      {
                        [
                          "Long shifts",
                          "Rest between shifts",
                          "Case follow-up",
                        ][i]
                      }
                    </h3>
                    <span className={a.count ? "alert-count" : "muted"}>
                      {a.count} {a.count === 1 ? "record" : "records"}
                    </span>
                  </div>
                  <p>{a.rule}</p>
                  <small>{a.action}</small>
                </div>
              </article>
            ))}
          </div>
          <p className="panel-footnote">{t("notMedical")}</p>
        </section>
        <section className="panel case-summary">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">A VOICE THAT REACHES SOMEONE</span>
              <h2>Confidential cases</h2>
              <p>From concern to resolution.</p>
            </div>
          </div>
          <div className="case-total">
            <strong>{total}</strong>
            <span>recorded cases</span>
          </div>
          <div className="case-bars">
            {[
              { name: "Open", value: d.openCases, key: "open" },
              {
                name: "In progress",
                value: d.inProgressCases,
                key: "progress",
              },
              { name: "Resolved", value: d.resolvedCases, key: "resolved" },
            ].map((row) => (
              <div key={row.key}>
                <div>
                  <span>{row.name}</span>
                  <strong>{row.value}</strong>
                </div>
                <div className="bar-track">
                  <span
                    className={row.key}
                    style={{
                      width: `${total ? (row.value / total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <NavLink className="button secondary full" to="/admin/reports">
            Review cases
            <ArrowUpRight size={17} />
          </NavLink>
        </section>
      </div>
      <div className="bottom-note">
        <BarChart3 size={18} />
        <span>
          {d.scope}{" "}
          {d.limited ? "At least one dataset reached its result limit." : ""}
        </span>
      </div>
      <section className="values-strip">
        <Leaf size={27} />
        <div>
          <h3>Better records. Fairer conversations.</h3>
          <p>
            Transparent estimates and constructive reporting support decent
            work, one shift at a time.
          </p>
        </div>
        <span>
          SDG 8 <ArrowUpRight size={14} />
        </span>
      </section>
    </>
  );
}
function Team() {
  const { t } = useText();
  const workers = useResource<List<Worker>>("/admin/workers");
  const shifts = useResource<List<Shift>>("/admin/shifts");
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">PEOPLE BEHIND THE WORK</span>
          <h1>People & attendance.</h1>
          <p>Your organization’s roster and latest recorded shifts.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Team directory</h2>
          <Users size={21} />
        </div>
        {workers.loading ? (
          <Loading />
        ) : workers.error ? (
          <Failed message={workers.error} retry={workers.reload} />
        ) : workers.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workers.data.items.map((w) => (
                  <tr key={w.id}>
                    <td className="cell-strong">{w.displayName}</td>
                    <td>{w.employeeCode}</td>
                    <td>{w.department}</td>
                    <td>{w.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{t("empty")}</Empty>
        )}
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Attendance records</h2>
          <Clock3 size={21} />
        </div>
        {shifts.loading ? (
          <Loading />
        ) : shifts.error ? (
          <Failed message={shifts.error} retry={shifts.reload} />
        ) : (
          <ShiftTable shifts={shifts.data?.items || []} />
        )}
      </section>
    </>
  );
}
function AccountModal({
  me,
  onClose,
  onSignOut,
}: {
  me: Me;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const { language, toggle, t } = useText();
  const admin = me.user.role === "ADMIN";

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account Settings"
    >
      <div
        className="account-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="account-modal-header">
          <div className="account-modal-user">
            <span className="avatar large">
              {me.user.displayName.slice(0, 1)}
            </span>
            <div>
              <h3>{me.user.displayName}</h3>
              <div className="account-tags">
                <span className="role-badge">
                  {admin ? "Administrator" : "Worker"}
                </span>
                <span className="code-badge">{me.user.employeeCode}</span>
              </div>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close account modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="account-modal-body">
          <div className="account-section">
            <h4>Workspace & Organization</h4>
            <div className="account-grid">
              <div className="account-field">
                <span className="field-label">Organization</span>
                <strong className="field-value">{me.organization.name}</strong>
              </div>
              <div className="account-field">
                <span className="field-label">Industry / Sector</span>
                <strong className="field-value">
                  {me.organization.industry === "CONSTRUCTION"
                    ? "Construction Operations"
                    : "Higher Education / College"}
                </strong>
              </div>
              <div className="account-field">
                <span className="field-label">Department</span>
                <strong className="field-value">
                  {admin ? "Management" : me.user.department}
                </strong>
              </div>
              <div className="account-field">
                <span className="field-label">Timezone</span>
                <strong className="field-value">{me.organization.timeZone}</strong>
              </div>
              {me.user.hourlyRatePaise !== undefined &&
                me.user.hourlyRatePaise > 0 && (
                  <div className="account-field">
                    <span className="field-label">Base Hourly Rate</span>
                    <strong className="field-value">
                      ₹{(me.user.hourlyRatePaise / 100).toFixed(2)}/hr
                    </strong>
                  </div>
                )}
              <div className="account-field">
                <span className="field-label">Regular Shift Limit</span>
                <strong className="field-value">
                  {me.organization.shiftLimitMinutes / 60} hours (
                  {me.organization.shiftLimitMinutes}m)
                </strong>
              </div>
              <div className="account-field">
                <span className="field-label">Overtime Multiplier</span>
                <strong className="field-value">
                  ×{me.organization.overtimeMultiplier}
                </strong>
              </div>
              <div className="account-field">
                <span className="field-label">Min. Rest Between Shifts</span>
                <strong className="field-value">
                  {me.organization.minRestMinutes / 60} hours (
                  {me.organization.minRestMinutes}m)
                </strong>
              </div>
            </div>
          </div>

          <div className="account-section">
            <h4>Language & Accessibility</h4>
            <div className="account-action-row">
              <div>
                <strong>Display Language</strong>
                <p>
                  {language === "en"
                    ? "English · Standard UI"
                    : "தமிழ் (Tamil) · தொழிலாளர் பார்வை"}
                </p>
              </div>
              <button
                className="button secondary small-btn"
                onClick={toggle}
              >
                <Globe2 size={16} />
                {language === "en" ? "தமிழ் மாற்றவும்" : "Switch to English"}
              </button>
            </div>
          </div>

          <div className="account-section">
            <h4>Authentication & Session</h4>
            <div className="account-action-row">
              <div>
                <strong>Active Account Email</strong>
                <p>{auth?.currentUser?.email || "Local Authenticated User"}</p>
              </div>
              <span className="status-pill active">Connected</span>
            </div>
          </div>
        </div>

        <div className="account-modal-footer">
          <button
            className="button danger-btn"
            onClick={onSignOut}
          >
            <LogOut size={16} />
            {t("signout")}
          </button>
          <button
            className="button secondary small-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ me, onProfileRetry }: { me: Me; onProfileRetry: () => void }) {
  const { t } = useText();
  const [open, setOpen] = useState(false),
    [showAccount, setShowAccount] = useState(false),
    [error, setError] = useState("");
  const location = useLocation();
  const admin = me.user.role === "ADMIN";
  const base = admin ? "/admin" : "/worker";
  useEffect(() => setOpen(false), [location.pathname]);
  const nav = admin
    ? [
        { path: "/admin", label: t("dashboard"), icon: BarChart3 },
        { path: "/admin/team", label: t("team"), icon: Users },
        { path: "/admin/reports", label: t("cases"), icon: MessageSquare },
      ]
    : [
        { path: "/worker", label: t("overview"), icon: BarChart3 },
        { path: "/worker/attendance", label: t("attendance"), icon: Clock3 },
        { path: "/worker/earnings", label: t("earnings"), icon: Wallet },
        { path: "/worker/reports", label: t("reports"), icon: ShieldCheck },
      ];
  return (
    <Workspace.Provider value={me}>
      <div className="app-layout">
        {open && (
          <button
            className="sidebar-overlay"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        {showAccount && (
          <AccountModal
            me={me}
            onClose={() => setShowAccount(false)}
            onSignOut={() => {
              setShowAccount(false);
              setError("");
              void signOut(auth!).catch(() =>
                setError("Could not sign out. Please try again."),
              );
            }}
          />
        )}
        <aside className={`sidebar ${open ? "is-open" : ""}`}>
          <div className="sidebar-brand">
            <Brand />
            <button
              className="icon-button mobile-only"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={21} />
            </button>
          </div>
          <div className="org-card">
            <span className="org-monogram">
              {me.organization.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{me.organization.name}</strong>
              <small>{admin ? t("admin") : t("worker")}</small>
            </div>
          </div>
          <span className="nav-caption">WORKSPACE</span>
          <nav aria-label="Main navigation">
            {nav.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                end
                to={path}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon size={19} />
                {label}
                <ChevronRight className="nav-chevron" size={15} />
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-message">
              <Leaf size={22} />
              <p>
                Fair work.
                <br />
                <strong>A shared responsibility.</strong>
              </p>
              <span>Supporting UN SDG 8</span>
            </div>
            <button
              className="nav-item signout"
              onClick={() => {
                setError("");
                void signOut(auth!).catch(() =>
                  setError("Could not sign out. Please try again."),
                );
              }}
            >
              <LogOut size={18} />
              {t("signout")}
            </button>
            <div
              className="sidebar-user"
              onClick={() => setShowAccount(true)}
              title="View Account Details"
              role="button"
              tabIndex={0}
            >
              <span className="avatar">{me.user.displayName.slice(0, 1)}</span>
              <div>
                <strong>{me.user.displayName}</strong>
                <small>{admin ? "Administrator" : me.user.department}</small>
              </div>
              <ShieldCheck size={16} />
            </div>
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <div>
              <button
                className="icon-button mobile-only"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={21} />
              </button>
              <span>{admin ? t("admin") : t("worker")}</span>
              <ChevronRight size={13} />
              <strong>
                {nav.find((n) => n.path === location.pathname)?.label ||
                  t("overview")}
              </strong>
            </div>
            <div>
              <span className="private-label">
                <ShieldCheck size={14} /> Private workspace
              </span>
              <LanguageButton />
              <button
                className="user-badge-button"
                onClick={() => setShowAccount(true)}
                title="Account Settings & Profile"
                aria-label="Account Settings & Profile"
              >
                <span className="avatar small">{me.user.displayName[0]}</span>
                <span className="user-name-label">{me.user.displayName}</span>
              </button>
            </div>
          </header>
          {usingEmulators && (
            <div className="emulator-banner">
              Local Firebase emulators · synthetic demo records
            </div>
          )}
          <main className="workspace-main" id="main-content">
            {error && <Notice error>{error}</Notice>}
            <Routes>
              {admin ? (
                <>
                  <Route path="/admin" element={<AdminHome />} />
                  <Route path="/admin/team" element={<Team />} />
                  <Route path="/admin/reports" element={<Reports admin />} />
                </>
              ) : (
                <>
                  <Route path="/worker" element={<WorkerHome />} />
                  <Route path="/worker/attendance" element={<WorkerHome />} />
                  <Route
                    path="/worker/earnings"
                    element={<WorkerHome earningsOnly />}
                  />
                  <Route path="/worker/reports" element={<Reports />} />
                </>
              )}
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </main>
          <footer className="workspace-footer">
            <span>© {new Date().getFullYear()} FairShift</span>
            <span>Fair work. Clear pay. Safer workplaces.</span>
            <button className="text-button" onClick={onProfileRetry}>
              Refresh workspace
            </button>
          </footer>
        </div>
      </div>
    </Workspace.Provider>
  );
}
export default function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [user, setUser] = useState<User | null>(null),
    [authLoading, setAuthLoading] = useState(!!auth),
    [me, setMe] = useState<Me | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMe(null);
      setAuthLoading(false);
      setError("");
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    setError("");
    void api<Me>("/me")
      .then((m) => {
        if (live) setMe(m);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [user, version]);
  const text = {
    language,
    t: (key: MessageKey) => messages[language][key] || messages.en[key],
    toggle: () => setLanguage((l) => (l === "en" ? "ta" : "en")),
  };
  return (
    <LanguageContext.Provider value={text}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {authLoading ? (
        <Loading />
      ) : !user ? (
        <SignIn />
      ) : error ? (
        <main className="auth-error">
          <Brand />
          <Failed message={error} retry={() => setVersion((v) => v + 1)} />
          <button
            className="button secondary"
            onClick={() => void signOut(auth!)}
          >
            Sign out
          </button>
        </main>
      ) : !me ? (
        <Loading />
      ) : (
        <Shell
          me={me}
          onProfileRetry={() => {
            setMe(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </LanguageContext.Provider>
  );
}
