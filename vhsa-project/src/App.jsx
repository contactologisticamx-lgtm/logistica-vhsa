import { useState, useEffect, useRef } from "react";
import {
  collection, doc, setDoc, updateDoc,
  onSnapshot, getDocs, getDoc, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  companyName: "Logística VHSA",
  phone1:      "9931 885 531",
  phone2:      "916 118 5898",
  email:       "contacto.logistica.mx@gmail.com",
  address:     "Fracc. Jose Gorotiza, C. Laguna Mixteca, Edificio 7, Depto 3D, Lagunas, Villahermosa, Tab.",
  whatsapp:    "529931885531",
};

const SEED_USERS = [
  { id:1, email:"operador@logisticavhsa.com",   password:"operador123", role:"operador",   name:"Operador"   },
  { id:2, email:"repartidor@logisticavhsa.com", password:"reparto123",  role:"repartidor", name:"Repartidor" },
];

const CARRIERS = [
  { id:"mercado_libre", name:"Mercado Libre",  refLabel:"Número de compra",  icon:"🟡" },
  { id:"j_t",          name:"J&T Express",    refLabel:"Número de rastreo", icon:"🔴" },
  { id:"paquetexpress",name:"PaquetExpress",  refLabel:"Número de guía",    icon:"🔵" },
  { id:"dhl",          name:"DHL",            refLabel:"Número de rastreo", icon:"🟡" },
  { id:"fedex",        name:"FedEx",          refLabel:"Número de rastreo", icon:"🟣" },
  { id:"amazon",       name:"Amazon",         refLabel:"Número de pedido",  icon:"📦" },
  { id:"shein",        name:"SHEIN",          refLabel:"Número de pedido",  icon:"🛍" },
  { id:"aliexpress",   name:"AliExpress",     refLabel:"Número de pedido",  icon:"🛒" },
  { id:"temu",         name:"TEMU",           refLabel:"Número de orden",   icon:"🛍" },
  { id:"tiktok",       name:"TikTok Shop",    refLabel:"Número de orden",   icon:"🎵" },
  { id:"tresguerras",  name:"Tres Guerras",   refLabel:"Número de guía",    icon:"🚛" },
  { id:"otra",         name:"Otra paquetería",refLabel:"Número de guía",    icon:"📦" },
];

const STATUS = {
  recibido:  { label:"Recibido en sucursal", short:"Recibido",  icon:"📦", step:1 },
  en_ruta:   { label:"En ruta a domicilio",  short:"En ruta",   icon:"🚚", step:2 },
  entregado: { label:"Entregado",            short:"Entregado", icon:"✅", step:3 },
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const now = () => new Date().toISOString();
const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX", {
  day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit"
}) : "";
const getCarrier = (id) => CARRIERS.find(c => c.id === id) || CARRIERS[CARRIERS.length - 1];

const session = {
  get:   ()     => { try { const s = localStorage.getItem("vhsa_sess"); return s ? JSON.parse(s) : null; } catch { return null; } },
  set:   (sess) => { try { localStorage.setItem("vhsa_sess", JSON.stringify(sess)); } catch {} },
  clear: ()     => { try { localStorage.removeItem("vhsa_sess"); } catch {} },
};

// ═══════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════
function StatusBadge({ status }) {
  const styles = {
    recibido:  "bg-blue-100 text-blue-800 border-blue-200",
    en_ruta:   "bg-amber-100 text-amber-800 border-amber-200",
    entregado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${styles[status]}`}>
      {STATUS[status].icon} {STATUS[status].short}
    </span>
  );
}

function Toast({ notif }) {
  if (!notif) return null;
  return (
    <div className="fixed top-24 inset-x-0 flex justify-center px-4 z-50 pointer-events-none">
      <div className={`px-5 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold max-w-xs text-center ${notif.type==="err"?"bg-red-500":"bg-slate-800"}`}>
        {notif.msg}
      </div>
    </div>
  );
}

function VHSALogo({ size="md" }) {
  const boxSize  = size==="sm" ? "w-7 h-7 text-base" : "w-9 h-9 text-xl";
  const textSize = size==="sm" ? "text-sm" : "text-base";
  return (
    <div className="flex items-center gap-2">
      <div className={`bg-amber-400 rounded-xl flex items-center justify-center font-black text-blue-950 shrink-0 ${boxSize}`}>V</div>
      <div>
        <p className={`font-black text-white leading-none ${textSize}`}>LOGÍSTICA <span className="text-amber-400">VHSA</span></p>
        {size!=="sm" && <p className="text-blue-300 text-xs leading-none mt-0.5">Villahermosa, Tab.</p>}
      </div>
    </div>
  );
}

function ScanInput({ value, onChange, onScan, placeholder, inputRef }) {
  return (
    <div className="relative">
      <input ref={inputRef} type="text" value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key==="Enter" && onScan()}
        placeholder={placeholder||"Escanea o escribe el código..."}
        className="w-full pl-4 pr-20 py-3.5 border-2 border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50 transition-all"
      />
      <button onClick={onScan}
        className="absolute inset-y-1.5 right-1.5 px-4 bg-blue-950 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-colors">
        OK
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TRACKING RESULT
// ═══════════════════════════════════════════════════════════
function TrackingResult({ pkg }) {
  const steps = ["recibido","en_ruta","entregado"];
  const cur = STATUS[pkg.status].step;
  const carrier = getCarrier(pkg.carrier);
  const getDate = k => { const h = pkg.history.find(e => e.status===k); return h ? fmt(h.date) : null; };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-blue-950 px-4 py-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-1">Número de guía</p>
            <p className="font-mono text-white font-bold">{pkg.code}</p>
          </div>
          <StatusBadge status={pkg.status} />
        </div>
        {pkg.clientRef && (
          <div className="bg-blue-900 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm">{carrier.icon}</span>
              <p className="text-blue-300 text-xs font-semibold">{carrier.refLabel} · {carrier.name}</p>
            </div>
            <p className="font-mono text-amber-400 font-bold text-base">{pkg.clientRef}</p>
          </div>
        )}
      </div>
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Destinatario</p>
        <p className="font-bold text-slate-800">{pkg.clientName}</p>
        {pkg.address && <p className="text-xs text-slate-500 mt-0.5">📍 {pkg.address}</p>}
      </div>
      <div className="px-4 py-5">
        {steps.map((key, i) => {
          const done=cur>=i+1, isCur=cur===i+1, isLast=i===steps.length-1;
          return (
            <div key={key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isCur?"bg-blue-950 text-white ring-4 ring-blue-100":done?"bg-emerald-500 text-white":"bg-slate-100 text-slate-400"}`}>
                  {done?(isCur?STATUS[key].icon:"✓"):i+1}
                </div>
                {!isLast && <div className={`w-0.5 h-8 mt-0.5 rounded-full ${done&&cur>i+1?"bg-emerald-400":"bg-slate-200"}`} />}
              </div>
              <div className={`pt-1.5 ${isLast?"":"pb-6"}`}>
                <p className={`text-sm font-semibold ${done?"text-slate-800":"text-slate-400"}`}>{STATUS[key].label}</p>
                {getDate(key) && <p className="text-xs text-slate-400 mt-0.5">{getDate(key)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PUBLIC PAGE
// ═══════════════════════════════════════════════════════════
function PublicPage({ findPackage, config, onEmployeeAccess }) {
  const [query, setQuery]       = useState("");
  const [result, setResult]     = useState(null);
  const [notFound, setNotFound] = useState(false);
  const displayCarriers = ["mercado_libre","j_t","paquetexpress","dhl","fedex","amazon","shein","aliexpress","temu","tiktok","tresguerras"];

  const handleSearch = () => {
    if (!query.trim()) return;
    const pkg = findPackage(query);
    setResult(pkg||null); setNotFound(!pkg);
    if (pkg) setTimeout(()=>document.getElementById("resultado")?.scrollIntoView({behavior:"smooth"}),100);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-950">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-2 flex items-center justify-between">
          <VHSALogo size="md" />
          <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors">
            💬 WhatsApp
          </a>
        </div>
        <div className="max-w-lg mx-auto px-4 pt-8 pb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-400 text-blue-950 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider mb-4">
            🚚 Rastreo en tiempo real
          </div>
          <h1 className="text-3xl font-black text-white leading-tight mb-2">¿Dónde está<br /><span className="text-amber-400">tu paquete?</span></h1>
          <p className="text-blue-300 text-sm mb-7">Ingresa tu número de guía, número de compra o número de pedido</p>
          <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-blue-950">
            <div className="flex gap-2">
              <input type="text" value={query}
                onChange={e=>{setQuery(e.target.value);setNotFound(false);setResult(null);}}
                onKeyDown={e=>e.key==="Enter"&&handleSearch()}
                placeholder="Ej. JT0012345678 o 2000987654..."
                className="flex-1 px-3 py-3 text-sm text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-700"
              />
              <button onClick={handleSearch} className="bg-blue-950 hover:bg-blue-900 text-white px-5 rounded-xl text-sm font-bold transition-colors">
                Buscar
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-left px-1">Puedes buscar con cualquier número que tengas de tu paquete</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4" id="resultado">
        {notFound && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-red-700 font-bold">Paquete no encontrado</p>
            <p className="text-red-400 text-sm mt-1">Verifica el número e intenta de nuevo o contáctanos por WhatsApp.</p>
          </div>
        )}
        {result && <TrackingResult pkg={result} />}
      </div>

      <div className="bg-white border-y border-slate-100 py-5 px-4">
        <div className="max-w-lg mx-auto">
          <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">Paqueterías que manejamos</p>
          <div className="flex flex-wrap justify-center gap-2">
            {displayCarriers.map(id=>{const c=getCarrier(id);return<span key={id} className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full">{c.icon} {c.name}</span>;})}
          </div>
        </div>
      </div>

      <div className="bg-blue-950 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1"><div className="w-1 h-6 bg-amber-400 rounded-full"></div><h2 className="text-xl font-black text-white">¿Necesitas ayuda?</h2></div>
          <p className="text-blue-300 text-sm mb-5 ml-3">Contáctanos, con gusto te atendemos</p>
          <div className="space-y-3">
            <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 bg-green-600 hover:bg-green-500 rounded-2xl px-4 py-3.5 transition-colors group">
              <div className="w-10 h-10 bg-green-500 group-hover:bg-green-400 rounded-xl flex items-center justify-center text-xl transition-colors">💬</div>
              <div className="flex-1"><p className="font-bold text-white text-sm">WhatsApp</p><p className="text-green-200 text-xs">{config.phone1}</p></div>
              <span className="text-green-200 text-xs font-semibold">Abrir →</span>
            </a>
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${config.phone1.replace(/\s/g,"")}`} className="flex items-center gap-2.5 bg-blue-900 hover:bg-blue-800 rounded-xl px-3 py-3 transition-colors">
                <span className="text-xl">📞</span><div><p className="text-blue-300 text-xs font-semibold">Teléfono</p><p className="text-white text-xs font-bold">{config.phone1}</p></div>
              </a>
              <a href={`tel:${config.phone2.replace(/\s/g,"")}`} className="flex items-center gap-2.5 bg-blue-900 hover:bg-blue-800 rounded-xl px-3 py-3 transition-colors">
                <span className="text-xl">📱</span><div><p className="text-blue-300 text-xs font-semibold">Teléfono 2</p><p className="text-white text-xs font-bold">{config.phone2}</p></div>
              </a>
            </div>
            <a href={`mailto:${config.email}`} className="flex items-center gap-3 bg-blue-900 hover:bg-blue-800 rounded-xl px-4 py-3 transition-colors">
              <span className="text-xl">✉️</span><div><p className="text-blue-300 text-xs font-semibold">Correo</p><p className="text-white text-xs font-bold">{config.email}</p></div>
            </a>
            <div className="flex items-start gap-3 bg-blue-900 rounded-xl px-4 py-3">
              <span className="text-xl mt-0.5">📍</span><div><p className="text-blue-300 text-xs font-semibold mb-0.5">Dirección</p><p className="text-white text-xs leading-relaxed">{config.address}</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 py-5 px-4 text-center">
        <p className="text-amber-400 font-black text-sm">LOGÍSTICA VHSA</p>
        <p className="text-slate-600 text-xs mt-0.5">© 2025 · Villahermosa, Tabasco</p>
        <button onClick={onEmployeeAccess} className="text-slate-700 hover:text-slate-500 text-xs mt-3 transition-colors block mx-auto">Portal empleados</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN VIEW
// ═══════════════════════════════════════════════════════════
function LoginView({ users, onLogin, onBack }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim()||!password) { setError("Completa todos los campos"); return; }
    setLoading(true); setError("");
    await new Promise(r=>setTimeout(r,350));
    const user = users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&u.password===password);
    if (user) onLogin(user);
    else { setError("Correo o contraseña incorrectos"); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-blue-950 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 pt-6 pb-4">
        <button onClick={onBack} className="text-blue-300 hover:text-white text-sm flex items-center gap-1 mb-5 transition-colors">← Volver al rastreo</button>
        <VHSALogo size="md" />
      </div>
      <div className="flex-1 bg-slate-50 rounded-t-3xl pt-8 px-4 pb-8">
        <div className="max-w-sm mx-auto">
          <div className="w-14 h-14 bg-blue-950 rounded-2xl flex items-center justify-center text-2xl mb-4 shadow-lg">🔐</div>
          <h2 className="text-xl font-black text-slate-800 mb-1">Acceso empleados</h2>
          <p className="text-slate-500 text-sm mb-6">Solo personal autorizado de Logística VHSA</p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Correo electrónico</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="correo@logisticavhsa.com"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Contraseña</label>
              <div className="relative">
                <input type={showPass?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                  placeholder="••••••••"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50"
                />
                <button onClick={()=>setShowPass(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">{showPass?"🙈":"👁"}</button>
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-600 text-sm font-medium">❌ {error}</div>}
            <button onClick={handleLogin} disabled={loading} className="w-full bg-blue-950 hover:bg-blue-900 disabled:bg-blue-300 text-white py-3.5 rounded-xl font-bold transition-colors shadow-lg">
              {loading?"Verificando...":"Iniciar sesión →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OPERADOR VIEW
// ═══════════════════════════════════════════════════════════
function OperadorView({ packages, findPackage, addPackage, updatePackage, showNotif }) {
  const [sub, setSub]     = useState("scan");
  const [code, setCode]   = useState("");
  const [found, setFound] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [filter, setFilter] = useState("todos");
  const [saving, setSaving] = useState(false);
  const [form, setForm]   = useState({clientName:"",phone:"",address:"",carrier:"mercado_libre",clientRef:""});
  const scanRef = useRef();

  useEffect(()=>{ if(sub==="scan") scanRef.current?.focus(); },[sub]);
  const selCarrier = getCarrier(form.carrier);

  const handleScan = () => {
    const c = code.trim(); if(!c) return;
    const pkg = findPackage(c);
    if(pkg) { setFound(pkg); setIsNew(false); } else { setFound(null); setIsNew(true); }
  };

  const reset = () => {
    setCode(""); setFound(null); setIsNew(false);
    setForm({clientName:"",phone:"",address:"",carrier:"mercado_libre",clientRef:""});
    setTimeout(()=>scanRef.current?.focus(),50);
  };

  const handleRegister = async () => {
    if(!form.clientName.trim()) { showNotif("El nombre del cliente es requerido","err"); return; }
    setSaving(true);
    try {
      await addPackage({ code:code.trim(), clientName:form.clientName.trim(), phone:form.phone.trim(),
        address:form.address.trim(), carrier:form.carrier, clientRef:form.clientRef.trim(),
        status:"recibido", history:[{status:"recibido",date:now()}], createdAt:now() });
      showNotif(`📦 Paquete de ${form.clientName} registrado`);
      reset();
    } catch { showNotif("Error al registrar","err"); }
    setSaving(false);
  };

  const markRuta = async (c) => {
    try { await updatePackage(c,"en_ruta"); showNotif("🚚 Marcado En Ruta"); reset(); }
    catch { showNotif("Error al actualizar","err"); }
  };

  const markAllRuta = async () => {
    const list = packages.filter(p=>p.status==="recibido");
    if(!list.length) return;
    try { await Promise.all(list.map(p=>updatePackage(p.code,"en_ruta"))); showNotif(`🚚 ${list.length} paquetes en ruta`); }
    catch { showNotif("Error al actualizar","err"); }
  };

  const recibidos = packages.filter(p=>p.status==="recibido").length;
  const filtered  = filter==="todos" ? packages : packages.filter(p=>p.status===filter);

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {[{k:"scan",l:"📷 Escanear"},{k:"lista",l:`📋 Lista (${packages.length})`}].map(t=>(
          <button key={t.k} onClick={()=>setSub(t.k)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${sub===t.k?"bg-white shadow text-blue-950":"text-slate-500"}`}>{t.l}</button>
        ))}
      </div>

      {sub==="scan" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-sm font-bold text-slate-700 mb-3">Escanear código del paquete</p>
            <ScanInput value={code} onChange={v=>{setCode(v);setFound(null);setIsNew(false);}} onScan={handleScan} inputRef={scanRef}/>
            <p className="text-xs text-slate-400 mt-2">Con escáner físico: apunta y escanea directamente aquí</p>
          </div>

          {isNew && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
              <div><p className="text-sm font-black text-blue-900 mb-2">🆕 Nuevo paquete — Registrar</p>
                <div className="bg-white border-2 border-dashed border-blue-300 rounded-xl px-3 py-2 inline-flex items-center gap-2">
                  <span className="text-blue-400 text-xs font-bold uppercase">Código</span>
                  <span className="font-mono font-bold text-blue-800 text-sm">{code}</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Paquetería</label>
                <select value={form.carrier} onChange={e=>setForm(p=>({...p,carrier:e.target.value}))}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-700">
                  {CARRIERS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">{selCarrier.refLabel} del cliente</label>
                <input type="text" value={form.clientRef} onChange={e=>setForm(p=>({...p,clientRef:e.target.value}))}
                  placeholder={selCarrier.id==="mercado_libre"?"Ej. 2000123456789":"Ej. JT0012345678"}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-700"/>
                <p className="text-xs text-slate-400 mt-1">El número que el cliente ve en su app de {selCarrier.name}</p>
              </div>
              {[
                {k:"clientName",label:"Nombre del cliente *",ph:"Ej. Juan García",type:"text"},
                {k:"phone",label:"Teléfono",ph:"Ej. 555-123-4567",type:"tel"},
                {k:"address",label:"Dirección de entrega",ph:"Calle, Colonia, No...",type:"text"},
              ].map(f=>(
                <div key={f.k}>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">{f.label}</label>
                  <input type={f.type} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&f.k==="address"&&handleRegister()}
                    placeholder={f.ph} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={handleRegister} disabled={saving} className="flex-1 bg-blue-950 hover:bg-blue-900 disabled:bg-blue-400 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                  {saving?"Guardando...":"✅ Registrar paquete"}
                </button>
                <button onClick={reset} className="px-4 border-2 border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50">Cancelar</button>
              </div>
            </div>
          )}

          {found && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-800 text-base">{found.clientName}</p>
                  <p className="text-xs font-mono text-slate-400">{found.code}</p>
                  {found.carrier && <p className="text-xs text-slate-500 mt-0.5">{getCarrier(found.carrier).icon} {getCarrier(found.carrier).name}</p>}
                </div>
                <StatusBadge status={found.status}/>
              </div>
              {found.clientRef && <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200"><p className="text-xs text-slate-400">{getCarrier(found.carrier)?.refLabel}</p><p className="font-mono text-sm font-bold text-slate-700">{found.clientRef}</p></div>}
              {found.phone   && <p className="text-sm text-slate-600">📞 {found.phone}</p>}
              {found.address && <p className="text-sm text-slate-600">📍 {found.address}</p>}
              {found.status==="recibido"  && <button onClick={()=>markRuta(found.code)} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold">🚚 Marcar En Ruta</button>}
              {found.status==="en_ruta"   && <p className="text-center text-amber-600 font-semibold text-sm py-1">Ya está en ruta 🚚</p>}
              {found.status==="entregado" && <p className="text-center text-emerald-600 font-semibold text-sm py-1">Ya fue entregado ✅</p>}
              <button onClick={reset} className="w-full border-2 border-slate-200 text-slate-500 py-2 rounded-xl text-sm hover:bg-slate-50">Cerrar</button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {[{s:"recibido",l:"Recibidos",c:"text-blue-800",bg:"bg-blue-50",b:"border-blue-100"},{s:"en_ruta",l:"En ruta",c:"text-amber-800",bg:"bg-amber-50",b:"border-amber-100"},{s:"entregado",l:"Entregados",c:"text-emerald-800",bg:"bg-emerald-50",b:"border-emerald-100"}].map(x=>(
              <div key={x.s} className={`${x.bg} border ${x.b} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-black ${x.c}`}>{packages.filter(p=>p.status===x.s).length}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{x.l}</p>
              </div>
            ))}
          </div>

          {recibidos>0 && (
            <button onClick={markAllRuta} className="w-full bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 text-amber-800 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
              🚚 Marcar TODOS en ruta <span className="bg-amber-200 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full">{recibidos}</span>
            </button>
          )}
        </div>
      )}

      {sub==="lista" && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["todos","recibido","en_ruta","entregado"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-2 transition-all ${filter===f?"bg-blue-950 text-white border-blue-950":"bg-white border-slate-200 text-slate-600"}`}>
                {f==="todos"?`Todos (${packages.length})`:`${STATUS[f].short} (${packages.filter(p=>p.status===f).length})`}
              </button>
            ))}
          </div>
          {filtered.length===0
            ? <div className="text-center py-12 text-slate-400"><p className="text-3xl mb-2">📭</p><p className="text-sm">No hay paquetes</p></div>
            : filtered.map(pkg=>(
              <div key={pkg.code} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{pkg.clientName}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{pkg.code}</p>
                    {pkg.carrier && <p className="text-xs text-slate-500 mt-0.5">{getCarrier(pkg.carrier).icon} {getCarrier(pkg.carrier).name}</p>}
                    {pkg.phone && <p className="text-xs text-slate-500">📞 {pkg.phone}</p>}
                  </div>
                  <StatusBadge status={pkg.status}/>
                </div>
                {pkg.status==="recibido" && <button onClick={()=>markRuta(pkg.code)} className="mt-2 w-full text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 py-1.5 rounded-lg font-bold">🚚 Marcar en ruta</button>}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REPARTIDOR VIEW
// ═══════════════════════════════════════════════════════════
function RepartidorView({ findPackage, updatePackage, showNotif }) {
  const [code, setCode]         = useState("");
  const [pkg, setPkg]           = useState(null);
  const [searched, setSearched] = useState(false);
  const [done, setDone]         = useState(false);
  const inputRef                = useRef();

  useEffect(()=>{ inputRef.current?.focus(); },[]);

  const handleScan = () => {
    const c = code.trim(); if(!c) return;
    setPkg(findPackage(c)||null); setSearched(true); setDone(false);
  };

  const handleDeliver = async () => {
    try {
      await updatePackage(pkg.code,"entregado"); setDone(true);
      showNotif(`✅ Entregado a ${pkg.clientName}`);
      setTimeout(()=>{ setCode(""); setPkg(null); setSearched(false); setDone(false); inputRef.current?.focus(); },3000);
    } catch { showNotif("Error al confirmar entrega","err"); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <p className="text-sm font-bold text-slate-700 mb-3">Confirmar entrega</p>
        <ScanInput value={code} onChange={v=>{setCode(v);setSearched(false);setDone(false);setPkg(null);}} onScan={handleScan} inputRef={inputRef} placeholder="Escanea el código del paquete..."/>
      </div>
      {searched&&!pkg && <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center"><p className="text-2xl mb-1">❌</p><p className="text-red-700 font-bold">Paquete no encontrado</p></div>}
      {pkg&&!done && (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Destinatario</p>
              <p className="font-black text-slate-800 text-xl">{pkg.clientName}</p>
              {pkg.carrier && <p className="text-xs text-slate-500 mt-0.5">{getCarrier(pkg.carrier).icon} {getCarrier(pkg.carrier).name}</p>}
            </div>
            <StatusBadge status={pkg.status}/>
          </div>
          {pkg.phone && <a href={`tel:${pkg.phone}`} className="flex items-center gap-2 text-blue-700 font-semibold text-sm">📞 {pkg.phone} <span className="text-blue-400 text-xs">Llamar</span></a>}
          {pkg.address && <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-xs text-slate-400 font-semibold uppercase mb-0.5">Dirección</p><p className="text-sm text-slate-700 font-medium">{pkg.address}</p></div>}
          {pkg.status==="entregado"
            ? <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 text-center text-emerald-700 font-bold text-sm">✅ Ya fue entregado anteriormente</div>
            : <button onClick={handleDeliver} className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-5 rounded-2xl text-xl font-black transition-all shadow-xl shadow-emerald-100">✅ CONFIRMAR ENTREGA</button>
          }
        </div>
      )}
      {done && (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-8 text-center space-y-2">
          <p className="text-6xl">✅</p><p className="font-black text-emerald-700 text-2xl">¡Entregado!</p>
          <p className="text-emerald-600 font-semibold">{pkg?.clientName}</p><p className="text-emerald-400 text-xs mt-2">Listo para el siguiente...</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPLEADOS VIEW
// ═══════════════════════════════════════════════════════════
function EmpleadosView({ users, setUsers, showNotif }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState({name:"",email:"",password:"",role:"operador"});

  const handleAdd = async () => {
    if(!form.name||!form.email||!form.password) { showNotif("Completa todos los campos","err"); return; }
    if(users.find(u=>u.email.toLowerCase()===form.email.toLowerCase())) { showNotif("Ese correo ya existe","err"); return; }
    const newUser = { id:Date.now(), ...form, email:form.email.toLowerCase() };
    try {
      await setDoc(doc(db,"usuarios",String(newUser.id)), newUser);
      setUsers(prev=>[...prev, newUser]);
      showNotif(`✅ ${form.name} agregado`);
      setForm({name:"",email:"",password:"",role:"operador"}); setAdding(false);
    } catch { showNotif("Error al agregar","err"); }
  };

  const handleDelete = async (id) => {
    if(users.length<=1) { showNotif("No puedes eliminar el último empleado","err"); return; }
    try {
      await deleteDoc(doc(db,"usuarios",String(id)));
      setUsers(prev=>prev.filter(u=>u.id!==id));
      showNotif("Empleado eliminado");
    } catch { showNotif("Error al eliminar","err"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-slate-700">Empleados ({users.length})</p>
        <button onClick={()=>setAdding(p=>!p)} className="bg-blue-950 hover:bg-blue-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors">{adding?"✕ Cancelar":"+ Agregar"}</button>
      </div>
      {adding && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-black text-blue-950">Nuevo empleado</p>
          {[{k:"name",label:"Nombre completo",ph:"Ej. María López",type:"text"},{k:"email",label:"Correo",ph:"correo@logisticavhsa.com",type:"email"},{k:"password",label:"Contraseña",ph:"Mínimo 6 caracteres",type:"text"}].map(f=>(
            <div key={f.k}><label className="text-xs font-bold text-slate-600 block mb-1">{f.label}</label>
              <input type={f.type} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/></div>
          ))}
          <div><label className="text-xs font-bold text-slate-600 block mb-1">Rol</label>
            <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-700">
              <option value="operador">🏢 Operador — Registra y gestiona paquetes</option>
              <option value="repartidor">🚚 Repartidor — Solo confirma entregas</option>
            </select></div>
          <button onClick={handleAdd} className="w-full bg-blue-950 hover:bg-blue-900 text-white py-2.5 rounded-xl text-sm font-bold">✅ Crear empleado</button>
        </div>
      )}
      <div className="space-y-2">
        {users.map(u=>(
          <div key={u.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${u.role==="operador"?"bg-blue-100":"bg-amber-100"}`}>{u.role==="operador"?"🏢":"🚚"}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{u.name}</p>
              <p className="text-xs text-slate-400 truncate">{u.email}</p>
              <span className={`text-xs font-bold ${u.role==="operador"?"text-blue-800":"text-amber-700"}`}>{u.role==="operador"?"Operador":"Repartidor"}</span>
            </div>
            <button onClick={()=>handleDelete(u.id)} className="text-slate-300 hover:text-red-400 transition-colors text-2xl font-bold">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CONFIG VIEW
// ═══════════════════════════════════════════════════════════
function ConfigView({ config, setConfig, showNotif }) {
  const [form, setForm]   = useState({...config});
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    try {
      await setDoc(doc(db,"config","general"), form);
      setConfig(form); setSaved(true); showNotif("✅ Configuración guardada");
      setTimeout(()=>setSaved(false),2000);
    } catch { showNotif("Error al guardar","err"); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-slate-700">Información de contacto pública</p>
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
        {[{k:"companyName",label:"Nombre de la empresa",type:"text"},{k:"phone1",label:"Teléfono principal",type:"tel"},{k:"phone2",label:"Teléfono secundario",type:"tel"},{k:"whatsapp",label:"WhatsApp (con código país, sin +)",type:"text"},{k:"email",label:"Correo electrónico",type:"email"},{k:"address",label:"Dirección completa",type:"text"}].map(f=>(
          <div key={f.k}><label className="text-xs font-bold text-slate-600 block mb-1.5">{f.label}</label>
            <input type={f.type} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/></div>
        ))}
        <button onClick={handleSave} className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${saved?"bg-emerald-500 text-white":"bg-blue-950 hover:bg-blue-900 text-white"}`}>
          {saved?"✅ Guardado":"Guardar cambios"}
        </button>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-xs font-bold text-amber-700 mb-1">💡 WhatsApp</p>
        <p className="text-xs text-amber-600">Agrega 52 al inicio. Ejemplo: <span className="font-mono font-bold">529931885531</span></p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPLOYEE SHELL
// ═══════════════════════════════════════════════════════════
function EmployeeShell({ sess, onLogout, tab, setTab, children }) {
  const tabs = [{k:"operador",icon:"📦",label:"Paquetes"},{k:"empleados",icon:"👥",label:"Empleados"},{k:"config",icon:"⚙️",label:"Config"}];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-950 text-white px-4 py-3 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <VHSALogo size="sm" />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-blue-400 text-xs hidden sm:block">{sess.role==="operador"?"🏢":"🚚"} {sess.name}</span>
            <button onClick={onLogout} className="text-xs text-blue-400 hover:text-red-400 border border-blue-800 hover:border-red-400 px-2.5 py-1.5 rounded-lg transition-colors">Salir 🚪</button>
          </div>
        </div>
      </header>
      {sess.role==="operador" && (
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
          <div className="max-w-lg mx-auto flex">
            {tabs.map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)} className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-bold transition-colors ${tab===t.k?"border-b-2 border-amber-500 text-blue-950":"text-slate-400 hover:text-slate-600"}`}>
                <span className="text-base">{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {sess.role==="repartidor" && <div className="bg-amber-400 text-blue-950 px-4 py-2 text-center"><p className="text-xs font-black uppercase tracking-wider">🚚 Panel de Repartidor · {sess.name}</p></div>}
      <main className="max-w-lg mx-auto p-4 pb-10">{children}</main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]   = useState("public");
  const [sess, setSess]       = useState(null);
  const [packages, setPackages] = useState([]);
  const [users, setUsers]     = useState([]);
  const [config, setConfig]   = useState(DEFAULT_CONFIG);
  const [loaded, setLoaded]   = useState(false);
  const [notif, setNotif]     = useState(null);
  const [opTab, setOpTab]     = useState("operador");

  // Load initial data
  useEffect(() => {
    // Session from localStorage
    const savedSess = session.get();
    if (savedSess) { setSess(savedSess); setScreen("employee"); }

    // Load users from Firestore
    getDocs(collection(db, "usuarios")).then(snap => {
      if (snap.empty) {
        SEED_USERS.forEach(u => setDoc(doc(db,"usuarios",String(u.id)), u));
        setUsers(SEED_USERS);
      } else {
        setUsers(snap.docs.map(d => d.data()));
      }
    }).catch(console.error);

    // Load config from Firestore
    getDoc(doc(db,"config","general")).then(snap => {
      if (snap.exists()) setConfig({...DEFAULT_CONFIG,...snap.data()});
    }).catch(console.error);
  }, []);

  // Real-time packages listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db,"paquetes"), snap => {
      const pkgs = snap.docs.map(d => d.data());
      pkgs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setPackages(pkgs);
      setLoaded(true);
    }, console.error);
    return () => unsub();
  }, []);

  const showNotif = (msg, type="ok") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); };

  const handleLogin = (user) => {
    const s = {id:user.id,email:user.email,name:user.name,role:user.role};
    setSess(s); session.set(s); setScreen("employee"); setOpTab("operador");
  };

  const handleLogout = () => { setSess(null); session.clear(); setScreen("public"); };

  const addPackage    = (pkg)          => setDoc(doc(db,"paquetes",pkg.code), pkg);
  const updatePackage = (code, status) => {
    const pkg = packages.find(p=>p.code===code);
    if (!pkg) return;
    return updateDoc(doc(db,"paquetes",code), { status, history:[...pkg.history,{status,date:now()}] });
  };
  const findPackage = (q) => { const t=q.trim(); return packages.find(p=>p.code===t||(p.clientRef&&p.clientRef===t)); };

  if (!loaded) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-blue-950 gap-3">
      <div className="text-5xl animate-bounce">🚚</div>
      <p className="text-blue-300 font-semibold">Cargando Logística VHSA...</p>
    </div>
  );

  if (screen==="login") return <LoginView users={users} onLogin={handleLogin} onBack={()=>setScreen("public")}/>;

  if (screen==="employee"&&sess) return (
    <EmployeeShell sess={sess} onLogout={handleLogout} tab={opTab} setTab={setOpTab}>
      <Toast notif={notif}/>
      {sess.role==="operador"&&opTab==="operador"  && <OperadorView packages={packages} findPackage={findPackage} addPackage={addPackage} updatePackage={updatePackage} showNotif={showNotif}/>}
      {sess.role==="operador"&&opTab==="empleados" && <EmpleadosView users={users} setUsers={setUsers} showNotif={showNotif}/>}
      {sess.role==="operador"&&opTab==="config"    && <ConfigView config={config} setConfig={setConfig} showNotif={showNotif}/>}
      {sess.role==="repartidor" && <RepartidorView findPackage={findPackage} updatePackage={updatePackage} showNotif={showNotif}/>}
    </EmployeeShell>
  );

  return (
    <>
      <Toast notif={notif}/>
      <PublicPage findPackage={findPackage} config={config} onEmployeeAccess={()=>setScreen("login")}/>
    </>
  );
}
