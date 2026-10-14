import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { Upload } from "tus-js-client";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown,
  Bell, CircleHelp, Clapperboard, Clock3, CloudUpload, Film, FolderKanban, Gauge, LogOut,
  Mail, Menu, MessageSquare, Plus, Search, Settings, ShieldCheck, Sparkles, Users, Video,
  X, Play, LockKeyhole, LoaderCircle, ExternalLink, RefreshCw
} from "lucide-react";

type Profile = { id: string; full_name: string; phone: string | null; role: "admin" | "client"; email?: string };
type Project = { id: string; name: string; description: string | null; status: string; created_at: string; updated_at: string };
type VideoItem = { id: string; project_id: string; title: string; description: string | null; storage_path: string; version_number: number; mime_type: string; size_bytes: number; review_status: string; created_at: string; uploaded_by: string };
type CommentItem = { id: string; project_id: string; video_id: string | null; user_id: string; body: string; timestamp_seconds: number | null; parent_comment_id: string | null; created_at: string; profiles?: { full_name: string } };
type NotificationItem = { id: string; recipient_id: string; project_id: string | null; type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function formatTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  const seconds = Math.floor(value);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toLocaleString("es-MX", { maximumFractionDigits: 1 })} ${units[index]}`;
}
function statusLabel(status: string) {
  return ({ draft: "Borrador", in_review: "En revisión", changes_requested: "Cambios solicitados", approved: "Aprobado", archived: "Archivado", active: "Activo" } as Record<string, string>)[status] ?? status;
}
function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}><span />{statusLabel(value)}</span>;
}
function Brand({ small = false }: { small?: boolean }) {
  return <span className="brand-mark"><span className="brand-icon"><Clapperboard size={small ? 17 : 20} /></span>{!small && <span>smart<span className="brand-light">media</span><i>.</i></span>}</span>;
}
function Button({ children, onClick, type = "button", variant = "primary", disabled = false }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit"; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean }) {
  return <button className={`button button-${variant}`} type={type} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("id,full_name,phone,role").eq("id", userId).maybeSingle();
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (active) setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
      else window.setTimeout(() => { void loadProfile(nextSession.user.id); }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => {
    setError("");
  }, [location.pathname]);

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else { setNotice("Sesión cerrada correctamente."); navigate("/"); }
  }

  if (authLoading) return <div className="full-loader"><LoaderCircle className="spin" size={26} /><span>Preparando tu espacio…</span></div>;

  return <>
    {!isSupabaseConfigured && <div className="setup-banner"><CircleHelp size={16} /><span><b>Configuración pendiente:</b> conecta Supabase para activar autenticación y datos reales.</span><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir Supabase <ExternalLink size={13} /></a></div>}
    {notice && <div className="toast toast-success"><CheckCircle2 size={17} />{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {error && <div className="toast toast-error"><CircleHelp size={17} />{error}<button aria-label="Cerrar aviso" onClick={() => setError("")}><X size={16} /></button></div>}
    <Routes>
      <Route path="/" element={session ? <Navigate to={profile?.role === "admin" ? "/admin" : "/app"} replace /> : <Landing />} />
      <Route path="/login" element={session ? <Navigate to={profile?.role === "admin" ? "/admin" : "/app"} replace /> : <AuthPage mode="login" onNotice={setNotice} />} />
      <Route path="/registro" element={session ? <Navigate to="/app" replace /> : <AuthPage mode="register" onNotice={setNotice} />} />
      <Route path="/recuperar-contrasena" element={<AuthPage mode="recover" onNotice={setNotice} />} />
      <Route path="/restablecer-contrasena" element={<AuthPage mode="reset" onNotice={setNotice} />} />
      <Route path="/privacidad" element={<LegalPage type="privacy" />} />
      <Route path="/terminos" element={<LegalPage type="terms" />} />
      <Route path="/app/*" element={!session ? <Navigate to="/login" replace state={{ from: location.pathname }} /> : !profile ? <div className="full-loader"><LoaderCircle className="spin" size={26}/><span>Cargando perfil…</span></div> : profile.role === "admin" ? <Navigate to="/admin" replace /> : <Workspace profile={profile} session={session} onSignOut={signOut} onProfile={setProfile} />} />
      <Route path="/admin/*" element={!session ? <Navigate to="/login" replace /> : !profile ? <div className="full-loader"><LoaderCircle className="spin" size={26}/><span>Cargando perfil…</span></div> : profile.role === "admin" ? <Workspace profile={profile} session={session} onSignOut={signOut} onProfile={setProfile} /> : <Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>;
}

function Landing() {
  return <main className="landing">
    <nav className="public-nav wrap"><Link to="/" className="brand-link"><Brand /></Link><div className="nav-actions"><Link to="/login" className="text-link">Iniciar sesión</Link><Link to="/registro" className="button button-primary">Crear cuenta <ArrowRight size={16} /></Link></div></nav>
    <section className="hero wrap">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> TU ESPACIO CREATIVO, EN ORDEN</div>
        <h1>Tus videos, tus revisiones, <span>todo en un solo lugar.</span></h1>
        <p>Una forma más clara y profesional de compartir entregas, dejar comentarios precisos y aprobar proyectos audiovisuales.</p>
        <div className="hero-actions"><Link to="/registro" className="button button-primary button-large">Comenzar ahora <ArrowRight size={17} /></Link><Link to="/login" className="button button-secondary button-large">Ya tengo cuenta</Link></div>
        <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={16} /></span><span>Revisiones privadas por proyecto</span><span className="proof-divider" /><span>Comentarios con marca de tiempo</span></div>
      </div>
      <div className="preview-shell" aria-label="Vista previa ilustrativa de la sala de revisión">
        <div className="preview-window"><div className="preview-top"><div className="window-dots"><i/><i/><i/></div><span>MI ESPACIO / PROYECTOS</span><div className="preview-avatar">M</div></div>
          <div className="preview-content"><div className="preview-sidebar"><Brand small/><span className="side-active"><FolderKanban size={15}/></span><span><Video size={15}/></span><span><MessageSquare size={15}/></span><span><Settings size={15}/></span></div>
            <div className="preview-main"><div className="preview-heading"><div><small>MI ESPACIO</small><h3>Proyectos recientes</h3></div><span className="preview-add"><Plus size={14}/> Nuevo</span></div>
              <div className="preview-project"><div className="preview-thumbnail"><div className="play-ring"><Play size={18} fill="currentColor"/></div><span>00:48</span></div><div className="preview-project-info"><b>Campaña de verano</b><small>Actualizado hace 2 h</small><div className="preview-progress"><i/></div></div><span className="preview-badge">En revisión</span></div>
              <div className="preview-project"><div className="preview-thumbnail thumbnail-two"><div className="play-ring"><Play size={18} fill="currentColor"/></div><span>01:22</span></div><div className="preview-project-info"><b>Identidad de marca</b><small>Versión 03 · MP4</small><div className="preview-progress progress-two"><i/></div></div><span className="preview-badge badge-approved">Aprobado</span></div>
              <div className="preview-note"><div className="note-avatar">A</div><div><b>Comentario en <span>00:35</span></b><p>Podemos ajustar el ritmo de esta transición.</p></div><MessageSquare size={16}/></div>
            </div>
          </div>
        </div><div className="float-card float-secure"><ShieldCheck size={17}/><span><b>Acceso privado</b><small>Solo personas autorizadas</small></span></div><div className="float-card float-approved"><CheckCircle2 size={18}/><span><b>Entrega aprobada</b><small>Versión final · V3</small></span></div>
      </div>
    </section>
    <section className="features wrap"><div className="section-heading"><span className="eyebrow">UN FLUJO MÁS SIMPLE</span><h2>Menos vueltas. <span>Mejores entregas.</span></h2><p>Todo el proceso de revisión audiovisual, en un espacio privado y organizado.</p></div>
      <div className="feature-grid"><Feature icon={<LockKeyhole size={20}/>} title="Acceso privado" text="Cada cliente ve únicamente los proyectos que le han asignado."/><Feature icon={<MessageSquare size={20}/>} title="Feedback preciso" text="Deja comentarios en un instante específico del video."/><Feature icon={<RefreshCw size={20}/>} title="Versiones ordenadas" text="Conserva el historial y evita confusiones entre entregas."/><Feature icon={<CheckCircle2 size={20}/>} title="Aprobaciones claras" text="Registra cuándo y qué versión ha sido aprobada." /></div>
    </section>
    <section className="cta wrap"><div><Sparkles size={22}/><h2>Tu próximo proyecto, mejor organizado.</h2><p>Crea tu cuenta y accede a tu espacio de revisión.</p></div><Link to="/registro" className="button button-primary button-large">Crear mi cuenta <ArrowRight size={16}/></Link></section>
    <footer className="public-footer wrap"><Brand/><span>© {new Date().getFullYear()} Mi Marca. Revisión audiovisual privada.</span><div><Link to="/privacidad">Privacidad</Link><Link to="/terminos">Términos</Link></div></footer>
  </main>;
}
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="feature-card"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>;
}

function AuthPage({ mode, onNotice }: { mode: "login" | "register" | "recover" | "reset"; onNotice: (s: string) => void }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const navigate = useNavigate();
  const titles = { login: "Qué bueno tenerte de vuelta", register: "Crea tu espacio de trabajo", recover: "Recupera tu acceso", reset: "Crea una nueva contraseña" };
  const descriptions = { login: "Entra para continuar con tus proyectos.", register: "Regístrate para recibir acceso a tus proyectos asignados.", recover: "Te enviaremos un enlace para recuperar tu cuenta.", reset: "Elige una contraseña segura para tu cuenta." };
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    if (!supabase) { setError("Supabase aún no está configurado. Añade las variables de entorno indicadas en .env.example."); return; }
    if (mode === "register" && password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    if ((mode === "register" || mode === "reset") && password.length < 10) { setError("Utiliza al menos 10 caracteres en tu contraseña."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        navigate("/app");
      } else if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim(), phone: phone.trim() }, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (authError) throw authError;
        if (data.session) { onNotice("Cuenta creada. Tu acceso a proyectos depende de la asignación del administrador."); navigate("/app"); }
        else setMessage("Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.");
      } else if (mode === "recover") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/restablecer-contrasena` });
        if (authError) throw authError;
        setMessage("Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.");
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Ocurrió un error. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout"><Link to="/" className="auth-brand"><Brand/></Link><div className="auth-art"><div className="art-orb orb-one"/><div className="art-orb orb-two"/><div className="art-grid"/><div className="art-copy"><span className="eyebrow"><span className="live-dot"/> TU TRABAJO, BIEN CUIDADO</span><h2>La creatividad merece un proceso <span>extraordinario.</span></h2><p>Revisa, conversa y aprueba cada entrega con claridad.</p><div className="art-stats"><span><ShieldCheck size={16}/> Espacios privados</span><span><MessageSquare size={16}/> Feedback organizado</span></div></div><div className="art-decoration"><Clapperboard size={100} strokeWidth={0.7}/></div></div>
    <div className="auth-panel"><div className="auth-card"><Link to="/" className="back-link"><ArrowLeft size={15}/> Volver al inicio</Link><div className="auth-heading"><span className="auth-icon">{mode === "recover" ? <Mail/> : mode === "reset" ? <LockKeyhole/> : <Sparkles/>}</span><h1>{titles[mode]}</h1><p>{descriptions[mode]}</p></div>
      {message && <div className="inline-message success"><CheckCircle2 size={17}/>{message}</div>}{error && <div className="inline-message error"><CircleHelp size={17}/>{error}</div>}
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <><Field label="Nombre completo"><input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required placeholder="Tu nombre" maxLength={100}/></Field><Field label="Teléfono"><input type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} required pattern="[+0-9() -]{8,20}" placeholder="+52 477 000 0000"/></Field></>}
        {(mode === "login" || mode === "register" || mode === "recover") && <Field label="Correo electrónico"><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="tu@correo.com"/></Field>}
        {(mode === "login" || mode === "register" || mode === "reset") && <Field label="Contraseña" hint={mode !== "login" ? "Usa al menos 10 caracteres." : undefined}><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode === "login" ? 1 : 10} required placeholder={mode === "login" ? "Tu contraseña" : "Crea una contraseña segura"}/></Field>}
        {mode === "register" && <Field label="Confirmar contraseña"><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={10} required placeholder="Repite tu contraseña"/></Field>}
        {mode === "register" && <label className="check-field"><input type="checkbox" required/><span>He leído y acepto los <Link to="/terminos">términos de uso</Link> y el <Link to="/privacidad">aviso de privacidad</Link>.</span></label>}
        {mode === "login" && <div className="form-extra"><span>Acceso seguro</span><Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link></div>}
        <Button type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin"/> Procesando…</> : <>{mode === "login" ? "Iniciar sesión" : mode === "register" ? "Crear cuenta" : mode === "recover" ? "Enviar enlace" : "Actualizar contraseña"} <ArrowRight size={16}/></>}</Button>
      </form>
      <div className="auth-bottom">{mode === "login" ? <>¿Aún no tienes cuenta? <Link to="/registro">Regístrate</Link></> : mode === "register" ? <>¿Ya tienes una cuenta? <Link to="/login">Inicia sesión</Link></> : <Link to="/login">Volver al inicio de sesión</Link>}</div>
      <div className="auth-secure"><LockKeyhole size={13}/> Tus credenciales se gestionan mediante Supabase Auth.</div>
    </div></div>
  </main>;
}

function Workspace({ profile, session, onSignOut, onProfile }: { profile: Profile; session: Session; onSignOut: () => void; onProfile: (p: Profile) => void }) {
  const navigate = useNavigate(); const location = useLocation();
  const isAdmin = profile.role === "admin"; const base = isAdmin ? "/admin" : "/app";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]); const [videos, setVideos] = useState<VideoItem[]>([]); const [comments, setComments] = useState<CommentItem[]>([]); const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [clients, setClients] = useState<Profile[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(""); const [selectedProject, setSelectedProject] = useState("");
  const [activeVideoId, setActiveVideoId] = useState("");
  const [newName, setNewName] = useState(""); const [newDescription, setNewDescription] = useState(""); const [newClient, setNewClient] = useState("");
  const [uploadProject, setUploadProject] = useState(""); const [uploadTitle, setUploadTitle] = useState(""); const [uploadDescription, setUploadDescription] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0); const [uploading, setUploading] = useState(false);
  const [commentText, setCommentText] = useState(""); const [replyTo, setReplyTo] = useState(""); const [videoTime, setVideoTime] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState(""); const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [tab, setTab] = useState<"all"|"in_review"|"changes_requested"|"approved">("all");
  const [profileName, setProfileName] = useState(profile.full_name); const [profilePhone, setProfilePhone] = useState(profile.phone ?? "");
  const [saveBusy, setSaveBusy] = useState(false); const [localMessage, setLocalMessage] = useState(""); const [localError, setLocalError] = useState("");
  const activeProjectId = location.pathname.match(/\/proyectos\/([^/]+)/)?.[1];

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    try {
      const projectQuery = isAdmin
        ? supabase.from("projects").select("*").is("archived_at", null).order("updated_at", { ascending: false })
        : supabase.from("projects").select("*, project_members!inner(user_id)").eq("project_members.user_id", session.user.id).is("archived_at", null).order("updated_at", { ascending: false });
      const [p, v, c, n] = await Promise.all([
        projectQuery,
        supabase.from("videos").select("*").order("created_at", { ascending: false }),
        supabase.from("comments").select("id,project_id,video_id,user_id,body,timestamp_seconds,parent_comment_id,created_at,profiles(full_name)").order("created_at", { ascending: false }).limit(500),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      if (p.error) throw p.error;
      if (v.error) throw v.error;
      if (c.error) throw c.error;
      if (n.error) throw n.error;
      setProjects((p.data ?? []) as Project[]); setVideos((v.data ?? []) as VideoItem[]); setComments((c.data ?? []) as CommentItem[]); setNotifications((n.data ?? []) as NotificationItem[]);
      if (isAdmin) {
        const { data: clientData, error: clientError } = await supabase.from("profiles").select("id,full_name,phone,role").eq("role","client").order("full_name");
        if (clientError) throw clientError;
        setClients((clientData ?? []) as Profile[]);
      }
    } catch (e) { setLocalError(e instanceof Error ? e.message : "No se pudieron cargar los datos."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [isAdmin, session.user.id]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    setLocalError(""); setLocalMessage("");
  }, [location.pathname]);
  const filteredProjects = useMemo(() => projects.filter(p => {
    const matches = `${p.name} ${p.description ?? ""}`.toLocaleLowerCase("es-MX").includes(search.toLocaleLowerCase("es-MX"));
    const matchesTab = tab === "all" || videos.some(v => v.project_id === p.id && v.review_status === tab);
    return matches && matchesTab;
  }), [projects, search, tab, videos]);
  const project = projects.find(p => p.id === activeProjectId);
  const projectVideos = videos.filter(v => v.project_id === (activeProjectId || selectedProject));
  const selectedVideo = projectVideos.find(v => v.id === activeVideoId) ?? projectVideos[0];
  const projectComments = comments.filter(c => c.project_id === (activeProjectId || selectedProject));

  async function createProject(e: FormEvent) {
    e.preventDefault(); setLocalError(""); setLocalMessage("");
    if (!supabase || !newName.trim()) return;
    setSaveBusy(true);
    try {
      const { data, error: insertError } = await supabase.from("projects").insert({ name: newName.trim(), description: newDescription.trim() || null, created_by: session.user.id, status: "active" }).select().single();
      if (insertError) throw insertError;
      if (newClient) {
        const { error: memberError } = await supabase.from("project_members").insert({ project_id: data.id, user_id: newClient });
        if (memberError) throw memberError;
      }
      setNewName(""); setNewDescription(""); setNewClient(""); setLocalMessage("Proyecto creado correctamente."); await loadData(); navigate(`${base}/proyectos/${data.id}`);
    } catch (e) { setLocalError(e instanceof Error ? e.message : "No se pudo crear el proyecto."); }
    finally { setSaveBusy(false); }
  }
  async function assignClient(projectId: string, userId: string) {
    if (!supabase || !userId) return;
    const { error: assignError } = await supabase.from("project_members").upsert({ project_id: projectId, user_id: userId }, { onConflict: "project_id,user_id" });
    if (assignError) setLocalError(assignError.message); else { setLocalMessage("Cliente asignado."); await loadData(); }
  }
  async function uploadVideo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLocalError(""); setLocalMessage("");
    if (!supabase || !uploadProject) return;
    const form = e.currentTarget;
    const input = form.elements.namedItem("video-file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { setLocalError("Selecciona un archivo de video."); return; }
    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(file.type)) { setLocalError("Formato no permitido. Usa MP4, WebM o MOV si el bucket está configurado para aceptarlo."); return; }
    const maxBytes = 500 * 1024 * 1024;
    if (file.size > maxBytes) { setLocalError("El tamaño máximo configurado es de 500 MB. Ajusta también el límite del bucket en Supabase."); return; }
    setUploading(true); setUploadProgress(0);
    let path = "";
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError || !authData.session) throw authError ?? new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      if (!apiKey || !supabaseUrl) throw new Error("Falta configurar Supabase en las variables de entorno.");
      path = uploadProject + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const endpoint = supabaseUrl.replace(/\/$/, "") + "/storage/v1/upload/resumable";
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint,
          retryDelays: [0, 1000, 3000, 5000],
          headers: { authorization: "Bearer " + authData.session!.access_token, apikey: apiKey },
          metadata: { bucketName: "private-videos", objectName: path, contentType: file.type, cacheControl: "3600" },
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (uploaded, total) => setUploadProgress(total ? Math.min(99, Math.round(uploaded / total * 100)) : 0),
          onSuccess: resolve,
        });
        upload.start();
      });
      setUploadProgress(99);
      const nextVersion = Math.max(0, ...videos.filter(v => v.project_id === uploadProject).map(v => v.version_number)) + 1;
      const { error: metadataError } = await supabase.from("videos").insert({
        project_id: uploadProject, storage_path: path, title: uploadTitle.trim() || file.name,
        description: uploadDescription.trim() || null, version_number: nextVersion, mime_type: file.type,
        size_bytes: file.size, uploaded_by: session.user.id, review_status: "in_review",
      });
      if (metadataError) { await supabase.storage.from("private-videos").remove([path]); throw metadataError; }
      setUploadProgress(100); setLocalMessage("Video cargado y registrado."); setUploadTitle(""); setUploadDescription(""); form.reset(); await loadData();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "No se pudo subir el video.");
      if (path && supabase) await supabase.storage.from("private-videos").remove([path]);
    } finally { setUploading(false); window.setTimeout(() => setUploadProgress(0), 1200); }
  }
  async function openVideo(video: VideoItem) {
    if (!supabase) return;
    setLocalError(""); setVideoUrl("");
    const { data, error: urlError } = await supabase.storage.from("private-videos").createSignedUrl(video.storage_path, 300);
    if (urlError) { setLocalError(urlError.message); return; }
    setVideoUrl(data.signedUrl); setSelectedProject(video.project_id); setActiveVideoId(video.id);
    navigate(`${base}/proyectos/${video.project_id}`);
  }
  async function postComment(e: FormEvent) {
    e.preventDefault(); if (!supabase || !activeProjectId || !commentText.trim()) return;
    setSaveBusy(true); setLocalError("");
    try {
      const { error: insertError } = await supabase.from("comments").insert({
        project_id: activeProjectId, video_id: selectedVideo?.id ?? null, user_id: session.user.id,
        body: commentText.trim(), timestamp_seconds: videoTime, parent_comment_id: replyTo || null,
      });
      if (insertError) throw insertError;
      setCommentText(""); setVideoTime(null); setReplyTo(""); setLocalMessage("Comentario publicado."); await loadData();
    } catch (e) { setLocalError(e instanceof Error ? e.message : "No se pudo publicar el comentario."); }
    finally { setSaveBusy(false); }
  }
  async function updateStatus(video: VideoItem, status: string) {
    if (!supabase) return;
    setLocalError("");
    const { error: updateError } = await supabase.from("videos").update({ review_status: status }).eq("id", video.id);
    if (updateError) setLocalError(updateError.message);
    else {
      if (status === "approved") {
        const { error: approvalError } = await supabase.from("approvals").insert({ project_id: video.project_id, video_id: video.id, approved_by: session.user.id, version_number: video.version_number });
        if (approvalError) { setLocalError(approvalError.message); return; }
      }
      setLocalMessage(`Estado actualizado: ${statusLabel(status)}.`); await loadData();
    }
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); if (!supabase) return; setSaveBusy(true); setLocalError(""); setLocalMessage("");
    try {
      const { data, error: updateError } = await supabase.from("profiles").update({ full_name: profileName.trim(), phone: profilePhone.trim() || null }).eq("id", session.user.id).select("id,full_name,phone,role").single();
      if (updateError) throw updateError;
      onProfile(data as Profile); setLocalMessage("Perfil actualizado.");
    } catch (e) { setLocalError(e instanceof Error ? e.message : "No se pudo actualizar el perfil."); }
    finally { setSaveBusy(false); }
  }
  async function archiveProject(p: Project) {
    if (!supabase || !window.confirm(`¿Archivar “${p.name}”? El proyecto dejará de aparecer en la lista activa.`)) return;
    const { error: archiveError } = await supabase.from("projects").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", p.id);
    if (archiveError) setLocalError(archiveError.message); else { setLocalMessage("Proyecto archivado."); navigate(base); await loadData(); }
  }
  async function seekComment(seconds: number | null) { if (seconds !== null && videoElement) { videoElement.currentTime = seconds; await videoElement.play().catch(()=>undefined); } }

  const navItems = isAdmin
    ? [{to:base,label:"Resumen",icon:<Gauge size={17}/>},{to:base+"/proyectos",label:"Proyectos",icon:<FolderKanban size={17}/>},{to:base+"/clientes",label:"Clientes",icon:<Users size={17}/>},{to:base+"/videos",label:"Videos",icon:<Video size={17}/>},{to:base+"/comentarios",label:"Comentarios",icon:<MessageSquare size={17}/>},{to:base+"/notificaciones",label:"Notificaciones",icon:<Bell size={17}/>},{to:base+"/configuracion",label:"Configuración",icon:<Settings size={17}/>}]
    : [{to:base,label:"Mi espacio",icon:<Gauge size={17}/>},{to:base+"/proyectos",label:"Mis proyectos",icon:<FolderKanban size={17}/>},{to:base+"/videos",label:"Videos",icon:<Video size={17}/>},{to:base+"/comentarios",label:"Comentarios",icon:<MessageSquare size={17}/>},{to:base+"/notificaciones",label:"Notificaciones",icon:<Bell size={17}/>},{to:base+"/configuracion",label:"Mi perfil",icon:<Settings size={17}/>}];
  const activeNav = navItems.find(item => item.to === location.pathname) ?? navItems.find(item => item.to !== base && location.pathname.startsWith(item.to)) ?? navItems[0];

  return <div className="workspace">
    <aside className={`app-sidebar ${mobileOpen ? "sidebar-open" : ""}`}><Link to={base} className="sidebar-brand"><Brand/></Link><div className="workspace-label">ESPACIO DE TRABAJO</div><nav className="sidebar-nav">{navItems.map(item=><Link key={item.to} to={item.to} onClick={()=>setMobileOpen(false)} className={`sidebar-link ${activeNav.to===item.to?"selected":""}`}>{item.icon}<span>{item.label}</span>{item.label==="Comentarios" && comments.length>0 && <i className="nav-count">{comments.length}</i>}{item.label==="Notificaciones" && notifications.filter(n=>!n.read_at).length>0 && <i className="nav-count">{notifications.filter(n=>!n.read_at).length}</i>}</Link>)}</nav><div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={17}/><div><b>Espacio privado</b><small>Acceso protegido por cuenta</small></div></div><button className="sidebar-link logout-link" onClick={onSignOut}><LogOut size={17}/><span>Cerrar sesión</span></button><div className="sidebar-user"><div className="user-avatar">{(profile.full_name || "U").charAt(0).toUpperCase()}</div><div className="user-details"><b>{profile.full_name || "Usuario"}</b><small>{isAdmin ? "Administrador" : "Cliente"}</small></div><ChevronDown size={15}/></div></div></aside>
    {mobileOpen && <button className="mobile-overlay" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)}/>}
    <main className="app-main"><header className="app-topbar"><button className="mobile-menu" aria-label="Abrir menú" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="breadcrumbs"><span>Smart Media</span><ArrowRight size={13}/><b>{activeNav.label}</b></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat("es-MX",{dateStyle:"medium"}).format(new Date())}</span><button className="icon-button" aria-label="Actualizar datos" onClick={()=>void loadData()}><RefreshCw size={17} className={refreshing?"spin":""}/></button><div className="top-avatar">{(profile.full_name || "U").charAt(0).toUpperCase()}</div></div></header>
      <div className="page-content">
        {localError && <div className="inline-message error page-message"><CircleHelp size={17}/>{localError}<button onClick={()=>setLocalError("")}><X size={15}/></button></div>}
        {localMessage && <div className="inline-message success page-message"><CheckCircle2 size={17}/>{localMessage}<button onClick={()=>setLocalMessage("")}><X size={15}/></button></div>}
        {loading ? <div className="loading-card"><LoaderCircle size={23} className="spin"/> Cargando datos privados…</div> : <>
          {location.pathname === base && <Dashboard isAdmin={isAdmin} profile={profile} projects={projects} videos={videos} comments={comments} onOpen={p=>navigate(`${base}/proyectos/${p.id}`)} onCreate={()=>navigate(`${base}/proyectos/nuevo`)}/>}
          {location.pathname === `${base}/proyectos` && <ProjectsPage isAdmin={isAdmin} projects={filteredProjects} videos={videos} search={search} setSearch={setSearch} tab={tab} setTab={setTab} onOpen={p=>navigate(`${base}/proyectos/${p.id}`)} onCreate={()=>navigate(`${base}/proyectos/nuevo`)} onArchive={archiveProject}/>}
          {location.pathname === `${base}/proyectos/nuevo` && isAdmin && <section className="content-narrow"><PageHeading eyebrow="GESTIÓN DE PROYECTOS" title="Crear proyecto" subtitle="Organiza una nueva entrega y asigna acceso al cliente."/><form className="surface form-card" onSubmit={createProject}><Field label="Nombre del proyecto"><input value={newName} onChange={e=>setNewName(e.target.value)} required maxLength={120} placeholder="Ej. Campaña de lanzamiento"/></Field><Field label="Descripción"><textarea value={newDescription} onChange={e=>setNewDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Objetivo, entregables y contexto del proyecto…"/></Field><Field label="Asignar cliente (opcional)"><select value={newClient} onChange={e=>setNewClient(e.target.value)}><option value="">Asignar después</option>{clients.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field><div className="form-actions"><Button variant="secondary" onClick={()=>navigate(`${base}/proyectos`)}>Cancelar</Button><Button type="submit" disabled={saveBusy}>{saveBusy?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>} Crear proyecto</Button></div></form></section>}
          {location.pathname === `${base}/videos` && <VideosPage isAdmin={isAdmin} videos={videos} projects={projects} onOpen={openVideo} onUpload={()=>navigate(`${base}/videos/subir`)}/>}
          {location.pathname === `${base}/videos/subir` && isAdmin && <section className="content-narrow"><PageHeading eyebrow="BIBLIOTECA AUDIOVISUAL" title="Subir video" subtitle="Carga una versión nueva sin sobrescribir las anteriores."/><form className="surface form-card" onSubmit={uploadVideo}><Field label="Proyecto asociado"><select value={uploadProject} onChange={e=>setUploadProject(e.target.value)} required><option value="">Selecciona un proyecto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Título del video"><input value={uploadTitle} onChange={e=>setUploadTitle(e.target.value)} maxLength={160} placeholder="Ej. Spot principal · versión final"/></Field><Field label="Descripción o notas de la versión"><textarea value={uploadDescription} onChange={e=>setUploadDescription(e.target.value)} rows={3} maxLength={2000} placeholder="Qué cambió en esta versión…"/></Field><label className="drop-zone"><CloudUpload size={29}/><b>Selecciona tu archivo de video</b><span>MP4, WebM o MOV · máximo 500 MB</span><input name="video-file" type="file" accept="video/mp4,video/webm,video/quicktime" required/></label>{uploadProgress>0 && <div className="upload-progress"><div><span>Subiendo archivo…</span><b>{uploadProgress}%</b></div><i><span style={{width:`${uploadProgress}%`}}/></i></div>}<div className="form-actions"><Button variant="secondary" onClick={()=>navigate(`${base}/videos`)}>Cancelar</Button><Button type="submit" disabled={uploading || !uploadProject}>{uploading?<LoaderCircle size={16} className="spin"/>:<CloudUpload size={16}/>} {uploading?"Subiendo…":"Subir video"}</Button></div><p className="fine-print">La interfaz aplica una validación básica. Configura también los límites de tamaño y MIME del bucket privado en Supabase.</p></form></section>}
          {location.pathname === `${base}/clientes` && isAdmin && <ClientsPage clients={clients} projects={projects} onAssign={assignClient}/>}
          {location.pathname === `${base}/comentarios` && <CommentsPage comments={comments} projects={projects} videos={videos} onOpenProject={id=>navigate(`${base}/proyectos/${id}`)}/>}
          {location.pathname === `${base}/notificaciones` && <NotificationsPage notifications={notifications} projects={projects} onRead={async n=>{if(!supabase)return;const {error:readError}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);if(readError)setLocalError(readError.message);else await loadData();}} onOpenProject={id=>navigate(base+"/proyectos/"+id)}/>}
          {location.pathname === `${base}/configuracion` && <section className="content-narrow"><PageHeading eyebrow="CUENTA Y PREFERENCIAS" title={isAdmin?"Configuración":"Mi perfil"} subtitle="Mantén actualizados los datos asociados a tu cuenta."/><form className="surface form-card" onSubmit={saveProfile}><div className="profile-header"><div className="profile-big-avatar">{(profile.full_name || "U").charAt(0).toUpperCase()}</div><div><b>{profile.full_name}</b><span>{session.user.email}</span><small>{isAdmin?"Administrador":"Cliente"}</small></div></div><Field label="Nombre completo"><input value={profileName} onChange={e=>setProfileName(e.target.value)} required maxLength={100}/></Field><Field label="Teléfono"><input type="tel" value={profilePhone} onChange={e=>setProfilePhone(e.target.value)} pattern="[+0-9() -]{8,20}" placeholder="+52 477 000 0000"/></Field><Field label="Correo electrónico"><input value={session.user.email ?? ""} readOnly/><small>El correo se administra desde Supabase Auth.</small></Field><div className="form-actions"><Button type="submit" disabled={saveBusy}>{saveBusy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} Guardar cambios</Button></div></form>{isAdmin && <div className="surface settings-note"><ShieldCheck size={20}/><div><b>Seguridad y configuración</b><p>La marca, el aviso de privacidad, el proveedor de correo y las reglas del bucket deben configurarse antes de publicar el servicio.</p><Link to="/privacidad">Revisar aviso de privacidad <ArrowRight size={14}/></Link></div></div>}</section>}
          {location.pathname === `${base}/proyectos/${activeProjectId}` && project && <ProjectRoom project={project} videos={projectVideos} comments={projectComments} isAdmin={isAdmin} profile={profile} videoUrl={videoUrl} onOpenVideo={openVideo} onComment={postComment} commentText={commentText} setCommentText={setCommentText} replyTo={replyTo} setReplyTo={setReplyTo} videoTime={videoTime} setVideoTime={setVideoTime} setVideoElement={setVideoElement} videoElement={videoElement} onSeek={seekComment} onStatus={updateStatus} saveBusy={saveBusy} onBack={()=>navigate(`${base}/proyectos`)}/>}
          {location.pathname === `${base}/proyectos/${activeProjectId}` && !project && <EmptyState icon={<FolderKanban/>} title="Proyecto no disponible" text="No existe o tu cuenta no tiene acceso a este proyecto." action={<Button variant="secondary" onClick={()=>navigate(`${base}/proyectos`)}>Volver a proyectos</Button>}/>}
        </>}
      </div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Dashboard({ isAdmin, profile, projects, videos, comments, onOpen, onCreate }: { isAdmin: boolean; profile: Profile; projects: Project[]; videos: VideoItem[]; comments: CommentItem[]; onOpen: (p: Project)=>void; onCreate: ()=>void }) {
  const pending = videos.filter(v=>v.review_status==="in_review").length;
  const changes = videos.filter(v=>v.review_status==="changes_requested").length;
  const approved = videos.filter(v=>v.review_status==="approved").length;
  return <><PageHeading eyebrow={isAdmin?"PANEL DE ADMINISTRACIÓN":"TU ESPACIO DE TRABAJO"} title={`Hola, ${profile.full_name.split(" ")[0] || "bienvenido"}.`} subtitle={isAdmin?"Aquí tienes el estado de tus proyectos y revisiones.":"Este es el resumen de los proyectos que tu equipo comparte contigo."} action={isAdmin?<Button onClick={onCreate}><Plus size={16}/> Nuevo proyecto</Button>:undefined}/>
    <div className="stats-grid"><Stat icon={<FolderKanban/>} label={isAdmin?"Proyectos activos":"Mis proyectos"} value={projects.length} note="Proyectos disponibles"/><Stat icon={<Clock3/>} label="En revisión" value={pending} note="Esperando comentarios"/><Stat icon={<MessageSquare/>} label="Cambios solicitados" value={changes} note="Requieren seguimiento"/><Stat icon={<CheckCircle2/>} label="Aprobados" value={approved} note="Versiones aprobadas"/></div>
    <div className="section-row"><div><h2>{isAdmin?"Proyectos recientes":"Proyectos compartidos contigo"}</h2><p>Actividad y estado de las entregas.</p></div><Link to={isAdmin?"/admin/proyectos":"/app/proyectos"} className="text-link">Ver todos <ArrowRight size={15}/></Link></div>
    {projects.length ? <div className="project-grid">{projects.slice(0,6).map(p=><ProjectCard key={p.id} project={p} videos={videos.filter(v=>v.project_id===p.id)} comments={comments.filter(c=>c.project_id===p.id).length} onOpen={()=>onOpen(p)}/>)}</div> : <EmptyState icon={<FolderKanban/>} title={isAdmin?"Crea tu primer proyecto":"Todavía no tienes proyectos asignados"} text={isAdmin?"Crea un proyecto y asigna un cliente para comenzar a compartir entregas.":"Cuando tu equipo comparta un proyecto contigo, aparecerá aquí."} action={isAdmin?<Button onClick={onCreate}><Plus size={16}/> Crear proyecto</Button>:undefined}/>}
    <div className="section-row section-row-later"><div><h2>Actividad reciente</h2><p>Últimos comentarios registrados en tus proyectos.</p></div><Activity size={19} className="muted-icon"/></div>
    {comments.length ? <div className="surface activity-list">{comments.slice(0,5).map(c=><div className="activity-item" key={c.id}><div className="activity-avatar">{(c.profiles?.full_name||"U").charAt(0).toUpperCase()}</div><div className="activity-body"><b>{c.profiles?.full_name || "Usuario"} <span>comentó</span></b><p>{c.body}</p><small>{formatDate(c.created_at)}{c.timestamp_seconds!==null? ` · ${formatTime(c.timestamp_seconds)}`:""}</small></div><MessageSquare size={16}/></div>)}</div> : <div className="surface small-empty"><MessageSquare size={19}/><span>Aún no hay comentarios. Las conversaciones aparecerán aquí.</span></div>}
  </>;
}
function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: number; note: string }) {
  return <div className="surface stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><ArrowDownRight size={15} className="muted-icon"/></div><span className="stat-label">{label}</span><strong>{value.toLocaleString("es-MX")}</strong><small>{note}</small></div>;
}
function ProjectCard({ project, videos, comments, onOpen }: { project: Project; videos: VideoItem[]; comments: number; onOpen: ()=>void }) {
  const latest = videos[0];
  return <article className="surface project-card"><button className="project-art" onClick={onOpen} aria-label={`Abrir ${project.name}`}><div className="art-bars"><i/><i/><i/><i/><i/></div><span className="art-play"><Play size={19} fill="currentColor"/></span><span className="art-duration">{latest? `V${latest.version_number}`:"PROYECTO"}</span><div className="art-glow"/></button><div className="project-card-content"><div className="project-card-top"><span className="project-kind"><Film size={13}/> AUDIOVISUAL</span><Status value={latest?.review_status ?? project.status}/></div><h3>{project.name}</h3><p>{project.description || "Sin descripción adicional."}</p><div className="project-meta"><span><Video size={14}/>{videos.length} {videos.length===1?"video":"videos"}</span><span><MessageSquare size={14}/>{comments} comentarios</span></div><div className="project-card-footer"><small>Actualizado {formatDate(project.updated_at)}</small><button className="arrow-button" onClick={onOpen} aria-label="Abrir proyecto"><ArrowRight size={17}/></button></div></div></article>;
}
function ProjectsPage({ isAdmin, projects, videos, search, setSearch, tab, setTab, onOpen, onCreate, onArchive }: { isAdmin:boolean; projects:Project[]; videos:VideoItem[]; search:string; setSearch:(v:string)=>void; tab:"all"|"in_review"|"changes_requested"|"approved"; setTab:(v:"all"|"in_review"|"changes_requested"|"approved")=>void; onOpen:(p:Project)=>void; onCreate:()=>void; onArchive:(p:Project)=>void }) {
  return <><PageHeading eyebrow="ESPACIO DE TRABAJO" title={isAdmin?"Proyectos":"Mis proyectos"} subtitle={isAdmin?"Administra las entregas y los accesos de tus clientes.":"Todos los proyectos compartidos contigo."} action={isAdmin?<Button onClick={onCreate}><Plus size={16}/> Nuevo proyecto</Button>:undefined}/>
    <div className="toolbar"><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar proyectos…"/></div><div className="filter-tabs">{(["all","in_review","changes_requested","approved"] as const).map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?"active":""}>{t==="all"?"Todos":statusLabel(t)}</button>)}</div></div>
    {projects.length ? <div className="project-grid">{projects.map(p=><div key={p.id} className="project-card-wrap"><ProjectCard project={p} videos={videos.filter(v=>v.project_id===p.id)} comments={0} onOpen={()=>onOpen(p)}/>{isAdmin && <button className="archive-link" onClick={()=>onArchive(p)}>Archivar proyecto</button>}</div>)}</div> : <EmptyState icon={<FolderKanban/>} title="No hay proyectos para mostrar" text={search?"Prueba con otro término de búsqueda.":"Los proyectos se mostrarán aquí cuando estén disponibles."} action={isAdmin?<Button onClick={onCreate}><Plus size={16}/> Crear proyecto</Button>:undefined}/>}
  </>;
}
function VideosPage({ isAdmin, videos, projects, onOpen, onUpload }: { isAdmin:boolean; videos:VideoItem[]; projects:Project[]; onOpen:(v:VideoItem)=>void; onUpload:()=>void }) {
  return <><PageHeading eyebrow="BIBLIOTECA AUDIOVISUAL" title="Videos" subtitle={isAdmin?"Gestiona las versiones y comparte revisiones seguras.":"Videos disponibles para revisar."} action={isAdmin?<Button onClick={onUpload}><CloudUpload size={16}/> Subir video</Button>:undefined}/>
    {videos.length ? <div className="surface table-wrap"><table><thead><tr><th>Video</th><th>Proyecto</th><th>Versión</th><th>Estado</th><th>Fecha</th><th/></tr></thead><tbody>{videos.map(v=><tr key={v.id}><td><div className="table-video"><span className="table-video-icon"><Film size={17}/></span><div><b>{v.title}</b><small>{formatBytes(v.size_bytes)} · {v.mime_type.split("/")[1]?.toUpperCase()}</small></div></div></td><td>{projects.find(p=>p.id===v.project_id)?.name ?? "Proyecto"}</td><td>V{v.version_number}</td><td><Status value={v.review_status}/></td><td>{formatDate(v.created_at)}</td><td><button className="text-link" onClick={()=>onOpen(v)}>Revisar <ArrowRight size={14}/></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Video/>} title="Aún no hay videos" text={isAdmin?"Sube la primera versión a un proyecto para comenzar la revisión.":"Cuando tu equipo comparta un video contigo, aparecerá aquí."} action={isAdmin?<Button onClick={onUpload}><CloudUpload size={16}/> Subir video</Button>:undefined}/>}
  </>;
}
function ClientsPage({ clients, projects, onAssign }: { clients:Profile[]; projects:Project[]; onAssign:(p:string,u:string)=>void }) {
  const [selected,setSelected]=useState<Record<string,string>>({});
  return <><PageHeading eyebrow="GESTIÓN DE ACCESOS" title="Clientes" subtitle="Asigna proyectos a cuentas registradas y verificadas."/><div className="surface table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Proyectos</th><th>Asignar proyecto</th></tr></thead><tbody>{clients.map(c=><tr key={c.id}><td><div className="table-video"><span className="user-avatar">{(c.full_name||"U").charAt(0).toUpperCase()}</span><div><b>{c.full_name||"Sin nombre"}</b><small>{c.id.slice(0,8)}…</small></div></div></td><td>{c.phone||"—"}</td><td>{projects.length} disponibles</td><td><div className="assign-control"><select value={selected[c.id]||""} onChange={e=>setSelected(s=>({...s,[c.id]:e.target.value}))}><option value="">Seleccionar proyecto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="icon-button" disabled={!selected[c.id]} onClick={()=>onAssign(selected[c.id],c.id)} aria-label="Asignar proyecto"><Plus size={16}/></button></div></td></tr>)}</tbody></table>{clients.length===0&&<div className="table-empty">Aún no hay cuentas de cliente registradas.</div>}</div><p className="fine-print">El correo de acceso no se consulta desde perfiles. La gestión de credenciales permanece en Supabase Auth.</p></>;
}
function CommentsPage({ comments, projects, videos, onOpenProject }: { comments:CommentItem[]; projects:Project[]; videos:VideoItem[]; onOpenProject:(id:string)=>void }) {
  return <><PageHeading eyebrow="CONVERSACIONES" title="Comentarios" subtitle="Feedback registrado en los proyectos a los que tienes acceso."/><div className="surface activity-list">{comments.map(c=><div className="activity-item comment-page-item" key={c.id}><div className="activity-avatar">{(c.profiles?.full_name||"U").charAt(0).toUpperCase()}</div><div className="activity-body"><b>{c.profiles?.full_name||"Usuario"} <span>· {projects.find(p=>p.id===c.project_id)?.name||"Proyecto"}</span></b><p>{c.body}</p><small>{formatDate(c.created_at)}{c.timestamp_seconds!==null? ` · ${formatTime(c.timestamp_seconds)}`:""}{c.video_id? ` · ${videos.find(v=>v.id===c.video_id)?.title||"Video"}`:""}</small></div><button className="text-link" onClick={()=>onOpenProject(c.project_id)}>Abrir <ArrowRight size={14}/></button></div>)}{comments.length===0&&<div className="table-empty">Todavía no hay comentarios en tus proyectos.</div>}</div></>;
}
function ProjectRoom({ project, videos, comments, isAdmin, profile, videoUrl, onOpenVideo, onComment, commentText, setCommentText, replyTo, setReplyTo, videoTime, setVideoTime, setVideoElement, videoElement, onSeek, onStatus, saveBusy, onBack }: { project:Project; videos:VideoItem[]; comments:CommentItem[]; isAdmin:boolean; profile:Profile; videoUrl:string; onOpenVideo:(v:VideoItem)=>void; onComment:(e:FormEvent)=>void; commentText:string; setCommentText:(s:string)=>void; replyTo:string; setReplyTo:(s:string)=>void; videoTime:number|null; setVideoTime:(n:number|null)=>void; setVideoElement:(v:HTMLVideoElement|null)=>void; videoElement:HTMLVideoElement|null; onSeek:(s:number|null)=>void; onStatus:(v:VideoItem,s:string)=>void; saveBusy:boolean; onBack:()=>void }) {
  const latest=videos[0]; const [version,setVersion]=useState(latest?.id||""); const active=videos.find(v=>v.id===version)||latest;
  const [showAllComments,setShowAllComments]=useState(false);
  useEffect(()=>{if(latest&&!version)setVersion(latest.id)},[latest,version]);
  const rootComments=comments.filter(c=>!c.parent_comment_id);
  return <><button className="back-link room-back" onClick={onBack}><ArrowLeft size={15}/> Volver a proyectos</button><PageHeading eyebrow="SALA DE REVISIÓN" title={project.name} subtitle={project.description||"Revisa la entrega y comparte tus comentarios."} action={<Status value={active?.review_status||project.status}/>}/>
    <div className="review-layout"><section className="review-main"><div className="video-player surface">{active && videoUrl && active.id===version ? <video ref={setVideoElement} src={videoUrl} controls playsInline onError={()=>{setVideoUrl("");setLocalError("No se pudo reproducir este archivo. Comprueba el formato del video y vuelve a cargarlo.");}}/> : <div className="video-placeholder"><div className="video-placeholder-art"><div className="art-bars"><i/><i/><i/><i/><i/></div></div><div className="video-placeholder-overlay"><span className="play-large"><Play size={22} fill="currentColor"/></span><b>{active?.title||"Aún no hay una entrega"}</b><small>{active? `Versión ${active.version_number} · ${formatBytes(active.size_bytes)}`:"El equipo todavía no ha subido videos."}</small>{active&&<Button onClick={()=>onOpenVideo(active)}><Play size={15}/> Cargar reproductor privado</Button>}</div></div>}
        <div className="player-caption"><div><b>{active?.title||project.name}</b><small>{active? `V${active.version_number} · Subido ${formatDate(active.created_at)}`:"Sin videos asociados"}</small></div>{active&&<Status value={active.review_status}/>}</div>
      </div>
      {active && <div className="surface review-actions"><div><b>Estado de revisión</b><p>{active.review_status==="approved"?"Esta versión ha sido aprobada.":active.review_status==="changes_requested"?"Se solicitaron cambios en esta versión.":"Esta versión está disponible para revisión."}</p></div><div className="review-action-buttons">{isAdmin ? <Button variant="secondary" onClick={()=>onStatus(active,"in_review")}>Enviar a revisión</Button> : <Button variant="secondary" onClick={()=>onStatus(active,"changes_requested")} disabled={active.review_status==="approved"}><MessageSquare size={15}/> Solicitar cambios</Button>}{!isAdmin&&<Button onClick={()=>{if(window.confirm("¿Confirmas que apruebas esta versión del video?"))onStatus(active,"approved")}} disabled={active.review_status==="approved"}><CheckCircle2 size={15}/> Aprobar entrega</Button>}</div></div>}
      <div className="surface version-panel"><div className="panel-title"><div><h3>Historial de versiones</h3><p>Cada entrega se conserva por separado.</p></div><span className="count-pill">{videos.length}</span></div>{videos.length?videos.slice().sort((a,b)=>b.version_number-a.version_number).map(v=><button key={v.id} className={`version-row ${active?.id===v.id?"version-active":""}`} onClick={()=>{setVersion(v.id);void onOpenVideo(v)}}><span className="version-file"><Film size={17}/></span><span className="version-info"><b>V{v.version_number} · {v.title}</b><small>{formatDate(v.created_at)} · {formatBytes(v.size_bytes)}</small></span><Status value={v.review_status}/><ArrowRight size={15}/></button>):<div className="table-empty">No hay versiones disponibles.</div>}</div>
    </section>
    <aside className="surface comment-panel"><div className="panel-title"><div><h3>Comentarios</h3><p>Feedback vinculado a la entrega.</p></div><span className="count-pill">{comments.length}</span></div><div className="comments-list">{rootComments.slice(0,showAllComments?rootComments.length:30).map(c=><div className="comment-entry" key={c.id}><div className="activity-avatar">{(c.profiles?.full_name||"U").charAt(0).toUpperCase()}</div><div className="comment-content"><div className="comment-author"><b>{c.profiles?.full_name||"Usuario"}</b><small>{formatDate(c.created_at)}</small></div>{c.timestamp_seconds!==null&&<button className="timestamp-link" onClick={()=>void onSeek(c.timestamp_seconds)}>{formatTime(c.timestamp_seconds)} <ArrowRight size={12}/></button>}<p>{c.body}</p>{comments.filter(reply=>reply.parent_comment_id===c.id).map(reply=><div className="reply-entry" key={reply.id}><b>{reply.profiles?.full_name||"Usuario"}</b><p>{reply.body}</p></div>)}<button className="reply-link" onClick={()=>setReplyTo(c.id)}>Responder</button>{replyTo===c.id&&<small className="replying-label">Tu respuesta se publicará como un nuevo comentario en este hilo.</small>}</div></div>)}{comments.length===0&&<div className="comments-empty"><MessageSquare size={23}/><b>La conversación comienza aquí</b><p>Deja una nota general o marca un instante exacto del video.</p></div>}{rootComments.length>30&&<button className="text-link" onClick={()=>setShowAllComments(!showAllComments)}>{showAllComments?"Mostrar menos":"Ver todos los comentarios"}</button>}</div>
      <form className="comment-composer" onSubmit={onComment}><div className="composer-heading"><div className="user-avatar">{profile.full_name.charAt(0).toUpperCase()}</div><span>{replyTo?"Responder comentario":"Añadir comentario"}</span>{replyTo&&<button type="button" aria-label="Cancelar respuesta" onClick={()=>setReplyTo("")}><X size={15}/></button>}</div><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} rows={3} maxLength={5000} required placeholder="Comparte tus observaciones…"/><div className="composer-footer"><button type="button" className={videoTime!==null?"timestamp-set":""} onClick={()=>setVideoTime(videoElement?Math.floor(videoElement.currentTime):0)} title="Añadir marca de tiempo"><Clock3 size={14}/>{videoTime!==null?formatTime(videoTime):"Marcar tiempo"}</button>{videoTime!==null&&<button type="button" className="clear-time" onClick={()=>setVideoTime(null)}>Quitar</button>}<Button type="submit" disabled={saveBusy||!commentText.trim()}>{saveBusy?<LoaderCircle size={15} className="spin"/>:<ArrowRight size={15}/>} Enviar</Button></div></form>
    </aside></div>
  </>;
}
function EmptyState({ icon, title, text, action }: { icon:ReactNode; title:string; text:string; action?:ReactNode }) {
  return <div className="surface empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function LegalPage({ type }: { type:"privacy"|"terms" }) {
  const privacy=type==="privacy";
  return <main className="legal-page"><nav className="public-nav wrap"><Link to="/" className="brand-link"><Brand/></Link><Link to="/" className="text-link"><ArrowLeft size={15}/> Inicio</Link></nav><article className="legal-content"><span className="eyebrow">SMART MEDIA</span><h1>{privacy?"Aviso de privacidad":"Términos de uso"}</h1><div className="inline-message error"><CircleHelp size={17}/>{privacy?"Plantilla inicial: antes de publicar, el responsable debe completar sus datos legales y validar el aviso con asesoría adecuada.":"Plantilla inicial: revisa y adapta estos términos al servicio, responsable y jurisdicción antes del lanzamiento."}</div>{privacy?<><h2>1. Responsable del tratamiento</h2><p>Este espacio debe identificar a la persona o entidad responsable de Mi Marca, sus datos de contacto y el medio para ejercer derechos de privacidad.</p><h2>2. Datos que pueden tratarse</h2><p>Nombre, correo electrónico, teléfono, datos de cuenta, proyectos asignados, archivos audiovisuales, comentarios, aprobaciones y registros técnicos necesarios para proteger el servicio.</p><h2>3. Finalidades</h2><p>Administrar cuentas, asignar proyectos, compartir videos de manera privada, gestionar comentarios y aprobaciones, dar soporte y proteger la plataforma.</p><h2>4. Proveedores y conservación</h2><p>La aplicación puede utilizar Supabase para autenticación, base de datos y almacenamiento. El responsable debe documentar los proveedores, transferencias aplicables, plazos de conservación y mecanismos de eliminación.</p><h2>5. Derechos y contacto</h2><p>Completa aquí el procedimiento y correo de contacto para solicitudes de acceso, rectificación, cancelación, oposición u otros derechos que correspondan conforme a la normativa aplicable.</p></>:<><h2>1. Uso del servicio</h2><p>La plataforma facilita la revisión privada de entregas audiovisuales para usuarios autorizados. Cada usuario es responsable de proteger sus credenciales y usar el servicio de manera lícita.</p><h2>2. Acceso a proyectos</h2><p>Registrarse no garantiza acceso a proyectos. El acceso depende de la asignación y puede revocarse por el administrador autorizado.</p><h2>3. Archivos y derechos</h2><p>Los usuarios solo deben cargar o comentar contenido sobre el que tengan derechos o autorización. La propiedad intelectual del material no se transfiere por el mero uso de la plataforma.</p><h2>4. Disponibilidad y seguridad</h2><p>Se aplican medidas técnicas razonables, pero el responsable debe definir condiciones de soporte, disponibilidad, límites de carga, retención y tratamiento de incidentes.</p><h2>5. Contacto y cambios</h2><p>Añade los datos de contacto del responsable y el procedimiento para informar cambios a estos términos antes de abrir el servicio al público.</p></>}</article><footer className="public-footer wrap"><Brand/><span>Documento pendiente de personalización legal.</span></footer></main>;
}

function NotificationsPage({ notifications, projects, onRead, onOpenProject }: { notifications:NotificationItem[]; projects:Project[]; onRead:(n:NotificationItem)=>void; onOpenProject:(id:string)=>void }) {
  const titleFor = (type:string) => ({video_assigned:"Te asignaron un proyecto",new_comment:"Nuevo comentario",comment_reply:"Nueva respuesta",changes_requested:"Cambios solicitados",new_version:"Nueva versión disponible",approved:"Entrega aprobada"} as Record<string,string>)[type] ?? "Actualización del proyecto";
  const descriptionFor = (n:NotificationItem) => {
    const payload=n.payload||{};
    if (n.type==="video_assigned") return "Ya puedes consultar el proyecto " + String(payload.project_name||"asignado") + ".";
    if (n.type==="new_version") return "Se publicó " + String(payload.title||"un video") + ", versión " + String(payload.version_number||"nueva") + ".";
    if (n.type==="changes_requested") return "Se solicitaron cambios en " + String(payload.title||"una entrega") + ".";
    if (n.type==="approved") return String(payload.title||"Una entrega") + " fue aprobada.";
    return String(payload.body_preview||"Hay nueva actividad en uno de tus proyectos.");
  };
  return <><PageHeading eyebrow="CENTRO DE ACTIVIDAD" title="Notificaciones" subtitle="Actualizaciones sobre asignaciones, comentarios y entregas."/><div className="surface activity-list notification-list">{notifications.map(n=><div className={"activity-item notification-item "+(n.read_at?"notification-read":"")} key={n.id}><div className="notification-icon">{n.type==="approved"?<CheckCircle2 size={17}/>:n.type==="changes_requested"?<MessageSquare size={17}/>:n.type==="video_assigned"?<FolderKanban size={17}/>:<Bell size={17}/>}</div><div className="activity-body"><b>{titleFor(n.type)} {!n.read_at&&<span className="unread-dot">Nuevo</span>}</b><p>{descriptionFor(n)}</p><small>{formatDate(n.created_at)}{n.project_id?" · "+(projects.find(p=>p.id===n.project_id)?.name||"Proyecto"):""}</small></div><div className="notification-actions">{n.project_id&&projects.some(p=>p.id===n.project_id)&&<button className="text-link" onClick={()=>onOpenProject(n.project_id!)}>Abrir <ArrowRight size={13}/></button>}{!n.read_at&&<button className="mark-read" onClick={()=>onRead(n)}>Marcar leída</button>}</div></div>)}{notifications.length===0&&<div className="table-empty">No tienes notificaciones. Las novedades aparecerán aquí.</div>}</div></>;
}

function NotFound() {
  return <div className="not-found"><Brand/><span className="not-found-code">404</span><h1>Esta página no existe.</h1><p>Puede que el enlace haya cambiado o que la dirección sea incorrecta.</p><Link to="/" className="button button-primary">Volver al inicio <ArrowRight size={16}/></Link></div>;
}
export default App;
