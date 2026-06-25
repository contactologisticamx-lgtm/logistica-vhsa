import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, doc, setDoc, updateDoc,
  onSnapshot, getDocs, getDoc, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  companyName:"Logística VHSA", phone1:"9931 885 531", phone2:"916 118 5898",
  email:"contacto.logistica.mx@gmail.com", whatsapp:"529931885531", precioPorPaquete:5,
  address:"Fracc. Jose Gorotiza, C. Laguna Mixteca, Edificio 7, Depto 3D, Lagunas, Villahermosa, Tab.",
};
const SEED_USERS = [
  {id:1,email:"admin@logisticavhsa.com",    password:"admin123",    role:"admin",      name:"Administrador",status:"activo"},
  {id:2,email:"operador@logisticavhsa.com", password:"operador123", role:"operador",   name:"Operador",     status:"activo"},
  {id:3,email:"repartidor@logisticavhsa.com",password:"reparto123", role:"repartidor", name:"Repartidor",   status:"activo"},
];
const CARRIERS = [
  {id:"mercado_libre",name:"Mercado Libre",  refLabel:"Número de compra",  icon:"🟡",mlNote:true},
  {id:"j_t",         name:"J&T Express",    refLabel:"Número de rastreo", icon:"🔴"},
  {id:"paquetexpress",name:"PaquetExpress", refLabel:"Número de guía",    icon:"🔵"},
  {id:"dhl",         name:"DHL",            refLabel:"Número de rastreo", icon:"🟡"},
  {id:"fedex",       name:"FedEx",          refLabel:"Número de rastreo", icon:"🟣"},
  {id:"amazon",      name:"Amazon",         refLabel:"Número de pedido",  icon:"📦"},
  {id:"shein",       name:"SHEIN",          refLabel:"Número de pedido",  icon:"🛍"},
  {id:"aliexpress",  name:"AliExpress",     refLabel:"Número de pedido",  icon:"🛒"},
  {id:"temu",        name:"TEMU",           refLabel:"Número de orden",   icon:"🛍"},
  {id:"tiktok",      name:"TikTok Shop",    refLabel:"Número de orden",   icon:"🎵"},
  {id:"tresguerras", name:"Tres Guerras",   refLabel:"Número de guía",    icon:"🚛"},
  {id:"otra",        name:"Otra paquetería",refLabel:"Número de guía",    icon:"📦"},
];
const STATUS = {
  recibido: {label:"Recibido en sucursal",short:"Recibido", icon:"📦",step:1},
  en_ruta:  {label:"En ruta a domicilio", short:"En ruta",  icon:"🚚",step:2},
  entregado:{label:"Entregado",           short:"Entregado",icon:"✅",step:3},
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const now  = () => new Date().toISOString();
const fmt  = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
const hoy  = () => new Date().toISOString().split("T")[0];
const mes  = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const getCarrier = (id) => CARRIERS.find(c=>c.id===id)||CARRIERS[CARRIERS.length-1];
const sessionStore = {
  get:  ()    =>{ try{const s=localStorage.getItem("vhsa_sess");return s?JSON.parse(s):null;}catch{return null;}},
  set:  (s)   =>{ try{localStorage.setItem("vhsa_sess",JSON.stringify(s));}catch{}},
  clear:()    =>{ try{localStorage.removeItem("vhsa_sess");}catch{}},
};

// ═══════════════════════════════════════════════════════════
// CAMERA SCANNER
// ═══════════════════════════════════════════════════════════
function CameraScanner({ onScan, onClose }) {
  const videoRef  = useRef();
  const streamRef = useRef();
  const rafRef    = useRef();
  const [camError, setCamError] = useState("");
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode:"environment", width:{ideal:1280}, height:{ideal:720} }
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        setReady(true);

        if (!("BarcodeDetector" in window)) {
          setCamError("Tu navegador no soporta escaneo automático.\nUsa Chrome en Android para esta función.");
          return;
        }
        const detector = new BarcodeDetector({
          formats:["qr_code","code_128","ean_13","ean_8","code_39","data_matrix","upc_a","upc_e","itf","codabar"]
        });

        const scan = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) { rafRef.current=requestAnimationFrame(scan); return; }
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) { onScan(results[0].rawValue); return; }
          } catch {}
          rafRef.current = requestAnimationFrame(scan);
        };
        videoRef.current.onloadedmetadata = () => { videoRef.current.play(); rafRef.current=requestAnimationFrame(scan); };
      } catch {
        setCamError("No se pudo acceder a la cámara.\nVerifica que diste permiso de cámara al navegador.");
      }
    }
    start();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t=>t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center px-4 py-3 bg-blue-950">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">📷</span>
          <p className="text-white font-black">Escanear código</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-xl text-white text-xl font-bold flex items-center justify-center transition-colors">×</button>
      </div>

      {camError ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-900">
          <div className="bg-white rounded-3xl p-6 text-center max-w-xs w-full">
            <p className="text-4xl mb-3">📵</p>
            <p className="font-black text-slate-800 mb-2">Cámara no disponible</p>
            <p className="text-slate-500 text-sm whitespace-pre-line mb-5">{camError}</p>
            <button onClick={onClose} className="w-full bg-blue-950 text-white py-3 rounded-xl font-bold">Cerrar</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Scanner frame */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-72 h-72">
              <div className="absolute inset-0 border-2 border-white/20 rounded-2xl" />
              {/* Corners */}
              {[["top-0 left-0","border-t-4 border-l-4 rounded-tl-xl"],["top-0 right-0","border-t-4 border-r-4 rounded-tr-xl"],
                ["bottom-0 left-0","border-b-4 border-l-4 rounded-bl-xl"],["bottom-0 right-0","border-b-4 border-r-4 rounded-br-xl"]].map(([pos,cls],i)=>(
                <div key={i} className={`absolute w-10 h-10 border-amber-400 ${pos} ${cls}`}/>
              ))}
              {/* Scan line */}
              <div className="absolute inset-x-4 h-0.5 bg-red-500 top-1/2 animate-pulse shadow-lg shadow-red-500" />
              <div className="absolute inset-0 bg-transparent" />
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 pb-6 pt-10 text-center px-4">
            <p className="text-white font-semibold text-sm">Apunta al código de barras o QR</p>
            <p className="text-white/60 text-xs mt-1">La detección es automática</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════
function StatusBadge({ status }) {
  const s={recibido:"bg-blue-100 text-blue-800 border-blue-200",en_ruta:"bg-amber-100 text-amber-800 border-amber-200",entregado:"bg-emerald-100 text-emerald-800 border-emerald-200"};
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${s[status]}`}>{STATUS[status].icon} {STATUS[status].short}</span>;
}
function Toast({ notif }) {
  if (!notif) return null;
  return <div className="fixed top-24 inset-x-0 flex justify-center px-4 z-50 pointer-events-none"><div className={`px-5 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold max-w-xs text-center ${notif.type==="err"?"bg-red-500":"bg-slate-800"}`}>{notif.msg}</div></div>;
}
function VHSALogo({ size="md" }) {
  const box=size==="sm"?"w-7 h-7 text-base":"w-9 h-9 text-xl", text=size==="sm"?"text-sm":"text-base";
  return <div className="flex items-center gap-2"><div className={`bg-amber-400 rounded-xl flex items-center justify-center font-black text-blue-950 shrink-0 ${box}`}>V</div><div><p className={`font-black text-white leading-none ${text}`}>LOGÍSTICA <span className="text-amber-400">VHSA</span></p>{size!=="sm"&&<p className="text-blue-300 text-xs leading-none mt-0.5">Villahermosa, Tab.</p>}</div></div>;
}
function ScanInputWithCamera({ value, onChange, onScan, placeholder, inputRef, label }) {
  const [showCam, setShowCam] = useState(false);
  const handleCamScan = (code) => { setShowCam(false); onChange(code); setTimeout(()=>onScan(code),100); };
  return (
    <>
      {showCam && <CameraScanner onScan={handleCamScan} onClose={()=>setShowCam(false)}/>}
      {label && <p className="text-sm font-bold text-slate-700 mb-2">{label}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input ref={inputRef} type="text" value={value}
            onChange={e=>onChange(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onScan(value)}
            placeholder={placeholder||"Escanea o escribe el código..."}
            className="w-full pl-4 pr-16 py-3.5 border-2 border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50 transition-all"
          />
          <button onClick={()=>onScan(value)} className="absolute inset-y-1.5 right-1.5 px-3 bg-blue-950 hover:bg-blue-900 text-white rounded-lg text-xs font-bold transition-colors">OK</button>
        </div>
        <button onClick={()=>setShowCam(true)} title="Abrir cámara"
          className="w-14 bg-amber-400 hover:bg-amber-500 text-blue-950 rounded-xl flex items-center justify-center text-xl font-bold transition-colors shrink-0">
          📷
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TRACKING RESULT (public)
// ═══════════════════════════════════════════════════════════
function TrackingResult({ pkg }) {
  const steps=["recibido","en_ruta","entregado"], cur=STATUS[pkg.status].step, carrier=getCarrier(pkg.carrier);
  const getDate=k=>{const h=pkg.history.find(e=>e.status===k);return h?fmt(h.date):null;};
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-blue-950 px-4 py-4">
        <div className="flex justify-between items-start mb-3"><div><p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-1">Número de guía</p><p className="font-mono text-white font-bold">{pkg.code}</p></div><StatusBadge status={pkg.status}/></div>
        {pkg.clientRef&&<div className="bg-blue-900 rounded-xl px-3 py-2.5"><div className="flex items-center gap-2 mb-0.5"><span className="text-sm">{carrier.icon}</span><p className="text-blue-300 text-xs font-semibold">{carrier.refLabel} · {carrier.name}</p></div><p className="font-mono text-amber-400 font-bold text-base">{pkg.clientRef}</p></div>}
      </div>
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100"><p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Destinatario</p><p className="font-bold text-slate-800">{pkg.clientName}</p>{pkg.address&&<p className="text-xs text-slate-500 mt-0.5">📍 {pkg.address}</p>}</div>
      <div className="px-4 py-5">
        {steps.map((key,i)=>{const done=cur>=i+1,isCur=cur===i+1,isLast=i===steps.length-1;return(
          <div key={key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isCur?"bg-blue-950 text-white ring-4 ring-blue-100":done?"bg-emerald-500 text-white":"bg-slate-100 text-slate-400"}`}>{done?(isCur?STATUS[key].icon:"✓"):i+1}</div>
              {!isLast&&<div className={`w-0.5 h-8 mt-0.5 rounded-full ${done&&cur>i+1?"bg-emerald-400":"bg-slate-200"}`}/>}
            </div>
            <div className={`pt-1.5 ${isLast?"":"pb-6"}`}><p className={`text-sm font-semibold ${done?"text-slate-800":"text-slate-400"}`}>{STATUS[key].label}</p>{getDate(key)&&<p className="text-xs text-slate-400 mt-0.5">{getDate(key)}</p>}{isCur&&key==="entregado"&&pkg.recibidoPor&&<p className="text-xs text-emerald-600 mt-0.5">Recibió: {pkg.recibidoPor}</p>}</div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PUBLIC PAGE
// ═══════════════════════════════════════════════════════════
function PublicPage({ findPackage, config, onEmployeeAccess }) {
  const [query,setQuery]=useState(""), [result,setResult]=useState(null), [notFound,setNotFound]=useState(false);
  const handleSearch=()=>{if(!query.trim())return;const pkg=findPackage(query);setResult(pkg||null);setNotFound(!pkg);if(pkg)setTimeout(()=>document.getElementById("resultado")?.scrollIntoView({behavior:"smooth"}),100);};
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-blue-950">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-2 flex items-center justify-between">
          <VHSALogo size="md"/>
          <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noreferrer" className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5">💬 WhatsApp</a>
        </div>
        <div className="max-w-lg mx-auto px-4 pt-8 pb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-400 text-blue-950 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider mb-4">🚚 Rastreo en tiempo real</div>
          <h1 className="text-3xl font-black text-white leading-tight mb-2">¿Dónde está<br/><span className="text-amber-400">tu paquete?</span></h1>
          <p className="text-blue-300 text-sm mb-7">Ingresa tu número de guía, número de compra o número de pedido</p>
          <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-blue-950">
            <div className="flex gap-2">
              <input type="text" value={query} onChange={e=>{setQuery(e.target.value);setNotFound(false);setResult(null);}} onKeyDown={e=>e.key==="Enter"&&handleSearch()} placeholder="Ej. JT0012345678 o 2000987654..." className="flex-1 px-3 py-3 text-sm text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-700"/>
              <button onClick={handleSearch} className="bg-blue-950 hover:bg-blue-900 text-white px-5 rounded-xl text-sm font-bold">Buscar</button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-left px-1">Puedes usar el número de guía, de compra o de pedido</p>
          </div>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4" id="resultado">
        {notFound&&<div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center"><p className="text-2xl mb-2">🔍</p><p className="text-red-700 font-bold">Paquete no encontrado</p><p className="text-red-400 text-sm mt-1">Verifica el número o contáctanos por WhatsApp.</p></div>}
        {result&&<TrackingResult pkg={result}/>}
      </div>

      {/* Services section */}
      <div className="bg-white border-y border-slate-100 py-6 px-4">
        <div className="max-w-lg mx-auto">
          <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Nuestros servicios</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[{icon:"📦",text:"Todo tipo de paquetería"},{icon:"🌎",text:"Envíos nacionales e internacionales"},{icon:"🚚",text:"Entrega a domicilio"},{icon:"⚡",text:"Rastreo en tiempo real"}].map((s,i)=>(
              <div key={i} className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-2">
                <span className="text-xl">{s.icon}</span><p className="text-xs font-semibold text-blue-900">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">Algunas paqueterías que manejamos</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["mercado_libre","j_t","paquetexpress","dhl","fedex","amazon","shein","aliexpress","temu","tiktok","tresguerras"].map(id=>{const c=getCarrier(id);return<span key={id} className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full">{c.icon} {c.name}</span>;})}
            <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full">📦 ¡Y muchas más!</span>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-blue-950 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1"><div className="w-1 h-6 bg-amber-400 rounded-full"/><h2 className="text-xl font-black text-white">¿Necesitas ayuda?</h2></div>
          <p className="text-blue-300 text-sm mb-5 ml-3">Contáctanos, con gusto te atendemos</p>
          <div className="space-y-3">
            <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-green-600 hover:bg-green-500 rounded-2xl px-4 py-3.5 transition-colors group">
              <div className="w-10 h-10 bg-green-500 group-hover:bg-green-400 rounded-xl flex items-center justify-center text-xl">💬</div><div className="flex-1"><p className="font-bold text-white text-sm">WhatsApp</p><p className="text-green-200 text-xs">{config.phone1}</p></div><span className="text-green-200 text-xs font-semibold">Abrir →</span>
            </a>
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${config.phone1.replace(/\s/g,"")}`} className="flex items-center gap-2.5 bg-blue-900 hover:bg-blue-800 rounded-xl px-3 py-3"><span className="text-xl">📞</span><div><p className="text-blue-300 text-xs font-semibold">Teléfono</p><p className="text-white text-xs font-bold">{config.phone1}</p></div></a>
              <a href={`tel:${config.phone2.replace(/\s/g,"")}`} className="flex items-center gap-2.5 bg-blue-900 hover:bg-blue-800 rounded-xl px-3 py-3"><span className="text-xl">📱</span><div><p className="text-blue-300 text-xs font-semibold">Teléfono 2</p><p className="text-white text-xs font-bold">{config.phone2}</p></div></a>
            </div>
            <a href={`mailto:${config.email}`} className="flex items-center gap-3 bg-blue-900 hover:bg-blue-800 rounded-xl px-4 py-3"><span className="text-xl">✉️</span><div><p className="text-blue-300 text-xs font-semibold">Correo</p><p className="text-white text-xs font-bold">{config.email}</p></div></a>
            <div className="flex items-start gap-3 bg-blue-900 rounded-xl px-4 py-3"><span className="text-xl mt-0.5">📍</span><div><p className="text-blue-300 text-xs font-semibold mb-0.5">Dirección</p><p className="text-white text-xs leading-relaxed">{config.address}</p></div></div>
          </div>
        </div>
      </div>
      <div className="bg-slate-900 py-5 px-4 text-center">
        <p className="text-amber-400 font-black text-sm">LOGÍSTICA VHSA</p>
        <p className="text-slate-600 text-xs mt-0.5">© 2025 · Villahermosa, Tabasco</p>
        <button onClick={onEmployeeAccess} className="text-slate-700 hover:text-slate-500 text-xs mt-3 block mx-auto">Portal empleados</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN VIEW
// ═══════════════════════════════════════════════════════════
function LoginView({ users, onLogin, onBack, onRegistro }) {
  const [email,setEmail]=useState(""), [password,setPassword]=useState(""), [showPass,setShowPass]=useState(false);
  const [error,setError]=useState(""), [loading,setLoading]=useState(false);
  const handle=async()=>{
    if(!email.trim()||!password){setError("Completa todos los campos");return;}
    setLoading(true);setError("");await new Promise(r=>setTimeout(r,350));
    const user=users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase()&&u.password===password);
    if(user){if(user.status==="pendiente"){setError("Tu cuenta está pendiente de aprobación.");setLoading(false);return;}if(user.status==="rechazado"){setError("Tu cuenta fue rechazada. Contacta al admin.");setLoading(false);return;}onLogin(user);}
    else{setError("Correo o contraseña incorrectos");setLoading(false);}
  };
  return(
    <div className="min-h-screen bg-blue-950 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 pt-6 pb-4"><button onClick={onBack} className="text-blue-300 hover:text-white text-sm flex items-center gap-1 mb-5">← Volver</button><VHSALogo size="md"/></div>
      <div className="flex-1 bg-slate-50 rounded-t-3xl pt-8 px-4 pb-8"><div className="max-w-sm mx-auto">
        <div className="w-14 h-14 bg-blue-950 rounded-2xl flex items-center justify-center text-2xl mb-4">🔐</div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Acceso empleados</h2>
        <p className="text-slate-500 text-sm mb-6">Solo personal de Logística VHSA</p>
        <div className="space-y-4">
          <div><label className="text-xs font-bold text-slate-600 block mb-1.5">Correo</label><input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="correo@ejemplo.com" className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50"/></div>
          <div><label className="text-xs font-bold text-slate-600 block mb-1.5">Contraseña</label><div className="relative"><input type={showPass?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50"/><button onClick={()=>setShowPass(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">{showPass?"🙈":"👁"}</button></div></div>
          {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-600 text-sm font-medium">❌ {error}</div>}
          <button onClick={handle} disabled={loading} className="w-full bg-blue-950 hover:bg-blue-900 disabled:bg-blue-300 text-white py-3.5 rounded-xl font-bold">{loading?"Verificando...":"Iniciar sesión →"}</button>
        </div>
        <div className="mt-5 pt-5 border-t border-slate-200 text-center"><p className="text-slate-500 text-sm mb-2">¿Eres empleado nuevo?</p><button onClick={onRegistro} className="w-full border-2 border-blue-950 text-blue-950 hover:bg-blue-50 py-3 rounded-xl font-bold text-sm">Crear mi cuenta →</button></div>
      </div></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REGISTRO VIEW
// ═══════════════════════════════════════════════════════════
function RegistroView({ users, setUsers, onBack, onSuccess }) {
  const [form,setForm]=useState({name:"",email:"",password:"",confirm:"",role:"operador"});
  const [error,setError]=useState(""), [loading,setLoading]=useState(false);
  const handle=async()=>{
    if(!form.name.trim()||!form.email.trim()||!form.password){setError("Completa todos los campos");return;}
    if(form.password.length<6){setError("La contraseña debe tener mínimo 6 caracteres");return;}
    if(form.password!==form.confirm){setError("Las contraseñas no coinciden");return;}
    if(users.find(u=>u.email.toLowerCase()===form.email.toLowerCase())){setError("Ese correo ya está registrado");return;}
    setLoading(true);setError("");
    const u={id:Date.now(),name:form.name.trim(),email:form.email.trim().toLowerCase(),password:form.password,role:form.role,status:"pendiente",createdAt:now()};
    try{await setDoc(doc(db,"usuarios",String(u.id)),u);setUsers(prev=>[...prev,u]);onSuccess();}
    catch{setError("Error al registrar. Intenta de nuevo.");setLoading(false);}
  };
  return(
    <div className="min-h-screen bg-blue-950 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 pt-6 pb-4"><button onClick={onBack} className="text-blue-300 hover:text-white text-sm flex items-center gap-1 mb-5">← Volver</button><VHSALogo size="md"/></div>
      <div className="flex-1 bg-slate-50 rounded-t-3xl pt-8 px-4 pb-8"><div className="max-w-sm mx-auto">
        <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-2xl mb-4">👤</div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Crear mi cuenta</h2>
        <p className="text-slate-500 text-sm mb-6">El administrador revisará tu solicitud antes de activarla</p>
        <div className="space-y-4">
          {[{k:"name",label:"Nombre completo",ph:"Ej. María López",type:"text"},{k:"email",label:"Correo",ph:"tucorreo@ejemplo.com",type:"email"},{k:"password",label:"Contraseña",ph:"Mínimo 6 caracteres",type:"password"},{k:"confirm",label:"Confirmar contraseña",ph:"Repite tu contraseña",type:"password"}].map(f=>(
            <div key={f.k}><label className="text-xs font-bold text-slate-600 block mb-1.5">{f.label}</label><input type={f.type} value={form[f.k]} onChange={e=>{setForm(p=>({...p,[f.k]:e.target.value}));setError("");}} placeholder={f.ph} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-50"/></div>
          ))}
          <div><label className="text-xs font-bold text-slate-600 block mb-1.5">Tipo de trabajo</label>
            <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-blue-700">
              <option value="operador">🏢 Operador — Recibo y registro paquetes</option>
              <option value="repartidor">🚚 Repartidor — Entrego a domicilio</option>
            </select></div>
          {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-600 text-sm font-medium">❌ {error}</div>}
          <button onClick={handle} disabled={loading} className="w-full bg-blue-950 hover:bg-blue-900 disabled:bg-blue-300 text-white py-3.5 rounded-xl font-bold">{loading?"Enviando...":"Enviar solicitud →"}</button>
        </div>
      </div></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PENDIENTE VIEW
// ═══════════════════════════════════════════════════════════
function PendienteView({ onBack }) {
  return(
    <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center p-4">
      <VHSALogo size="md"/>
      <div className="bg-white rounded-3xl p-8 mt-8 max-w-sm w-full text-center shadow-2xl">
        <p className="text-5xl mb-4">⏳</p>
        <h2 className="text-xl font-black text-slate-800 mb-2">Solicitud enviada</h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-5">Tu cuenta está siendo revisada. Te avisarán cuando esté activa.</p>
        <button onClick={onBack} className="w-full border-2 border-slate-200 text-slate-600 py-3 rounded-xl font-bold text-sm">← Volver al inicio</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OPERADOR VIEW (with camera + client autocomplete)
// ═══════════════════════════════════════════════════════════
function OperadorView({ packages, clientes, findPackage, addPackage, updatePackage, showNotif, sess }) {
  const [sub,setSub]=useState("scan"), [code,setCode]=useState(""), [found,setFound]=useState(null);
  const [isNew,setIsNew]=useState(false), [filter,setFilter]=useState("todos"), [saving,setSaving]=useState(false);
  const [suggestions,setSuggestions]=useState([]);
  const [form,setForm]=useState({clientName:"",phone:"",address:"",carrier:"mercado_libre",clientRef:""});
  const scanRef=useRef();
  useEffect(()=>{if(sub==="scan")scanRef.current?.focus();},[sub]);
  const selCarrier=getCarrier(form.carrier);

  // Client autocomplete
  const handleNameChange=(val)=>{
    setForm(p=>({...p,clientName:val}));
    if(val.length<2){setSuggestions([]);return;}
    const matches=clientes.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,5);
    setSuggestions(matches);
  };
  const fillClient=(c)=>{setForm(p=>({...p,clientName:c.name,phone:c.phone||"",address:c.address||""}));setSuggestions([]);};

  const handleScan=(c)=>{
    const code=(typeof c==="string"?c:form.code||"").trim();
    if(!code)return;
    setCode(code);
    const pkg=findPackage(code);
    if(pkg){setFound(pkg);setIsNew(false);}else{setFound(null);setIsNew(true);}
  };
  const reset=()=>{setCode("");setFound(null);setIsNew(false);setForm({clientName:"",phone:"",address:"",carrier:"mercado_libre",clientRef:""});setSuggestions([]);setTimeout(()=>scanRef.current?.focus(),50);};

  const handleRegister=async()=>{
    if(!form.clientName.trim()){showNotif("El nombre del cliente es requerido","err");return;}
    setSaving(true);
    try{
      const pkg={code:code.trim(),clientName:form.clientName.trim(),phone:form.phone.trim(),address:form.address.trim(),carrier:form.carrier,clientRef:form.clientRef.trim(),status:"recibido",history:[{status:"recibido",date:now()}],createdAt:now(),registradoPor:{id:sess.id,name:sess.name}};
      await addPackage(pkg);
      // Save/update client in clientes collection
      if(form.clientName.trim()){
        const cId=form.clientName.trim().toLowerCase().replace(/\s+/g,"_");
        await setDoc(doc(db,"clientes",cId),{name:form.clientName.trim(),phone:form.phone.trim(),address:form.address.trim(),updatedAt:now()},{merge:true});
      }
      showNotif(`📦 Paquete de ${form.clientName} registrado`);reset();
    }catch{showNotif("Error al registrar","err");}
    setSaving(false);
  };

  const markRuta=async(c)=>{try{await updatePackage(c,"en_ruta");showNotif("🚚 Marcado En Ruta");reset();}catch{showNotif("Error","err");}};
  const markAllRuta=async()=>{const list=packages.filter(p=>p.status==="recibido");if(!list.length)return;try{await Promise.all(list.map(p=>updatePackage(p.code,"en_ruta")));showNotif(`🚚 ${list.length} paquetes en ruta`);}catch{showNotif("Error","err");}};
  const recibidos=packages.filter(p=>p.status==="recibido").length;
  const filtered=filter==="todos"?packages:packages.filter(p=>p.status===filter);

  return(
    <div className="space-y-4">
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {[{k:"scan",l:"📷 Escanear"},{k:"lista",l:`📋 Lista (${packages.length})`}].map(t=>(
          <button key={t.k} onClick={()=>setSub(t.k)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${sub===t.k?"bg-white shadow text-blue-950":"text-slate-500"}`}>{t.l}</button>
        ))}
      </div>

      {sub==="scan"&&(
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <ScanInputWithCamera value={code} onChange={setCode} onScan={handleScan} inputRef={scanRef} label="Escanear código del paquete"/>
            <p className="text-xs text-slate-400 mt-2">📷 Toca el botón amarillo para abrir la cámara del celular</p>
          </div>

          {isNew&&(
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 space-y-3">
              <div><p className="text-sm font-black text-blue-900 mb-2">🆕 Nuevo paquete — Registrar</p>
                <div className="bg-white border-2 border-dashed border-blue-300 rounded-xl px-3 py-2 inline-flex items-center gap-2"><span className="text-blue-400 text-xs font-bold uppercase">Código</span><span className="font-mono font-bold text-blue-800 text-sm">{code}</span></div>
              </div>

              {/* Paquetería */}
              <div><label className="text-xs font-bold text-slate-600 block mb-1.5">Paquetería</label>
                <select value={form.carrier} onChange={e=>setForm(p=>({...p,carrier:e.target.value}))} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-700">
                  {CARRIERS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>

              {/* Client ref */}
              <div><label className="text-xs font-bold text-slate-600 block mb-1.5">{selCarrier.refLabel} del cliente</label>
                <input type="text" value={form.clientRef} onChange={e=>setForm(p=>({...p,clientRef:e.target.value}))}
                  placeholder={selCarrier.id==="mercado_libre"?"Ej. 2000123456789":"Ej. JT0012345678"}
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-700"/>
                {selCarrier.mlNote&&<div className="mt-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"><p className="text-xs text-amber-700 font-semibold">⚠️ Para ML: anota el número de compra (ej. 2000...) que aparece en la etiqueta como texto, NO el que sale al escanear el QR.</p></div>}
              </div>

              {/* Client name with autocomplete */}
              <div className="relative">
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Nombre del cliente *</label>
                <input type="text" value={form.clientName} onChange={e=>handleNameChange(e.target.value)} placeholder="Escribe para buscar o agregar cliente..."
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/>
                {suggestions.length>0&&(
                  <div className="absolute z-10 inset-x-0 top-full mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.map((c,i)=>(
                      <button key={i} onClick={()=>fillClient(c)} className="w-full px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0">
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        {c.phone&&<p className="text-xs text-slate-400">📞 {c.phone}</p>}
                        {c.address&&<p className="text-xs text-slate-400 truncate">📍 {c.address}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {[{k:"phone",label:"Teléfono",ph:"Ej. 555-123-4567",type:"tel"},{k:"address",label:"Dirección de entrega",ph:"Calle, Colonia, No...",type:"text"}].map(f=>(
                <div key={f.k}><label className="text-xs font-bold text-slate-600 block mb-1.5">{f.label}</label>
                  <input type={f.type} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&f.k==="address"&&handleRegister()} placeholder={f.ph}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/></div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={handleRegister} disabled={saving} className="flex-1 bg-blue-950 hover:bg-blue-900 disabled:bg-blue-400 text-white py-3 rounded-xl text-sm font-bold">{saving?"Guardando...":"✅ Registrar paquete"}</button>
                <button onClick={reset} className="px-4 border-2 border-slate-200 rounded-xl text-sm text-slate-500">Cancelar</button>
              </div>
            </div>
          )}

          {found&&(
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3">
              <div className="flex justify-between items-start">
                <div><p className="font-bold text-slate-800 text-base">{found.clientName}</p><p className="text-xs font-mono text-slate-400">{found.code}</p>{found.carrier&&<p className="text-xs text-slate-500 mt-0.5">{getCarrier(found.carrier).icon} {getCarrier(found.carrier).name}</p>}{found.registradoPor&&<p className="text-xs text-slate-400 mt-0.5">👤 {found.registradoPor.name}</p>}</div>
                <StatusBadge status={found.status}/>
              </div>
              {found.clientRef&&<div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200"><p className="text-xs text-slate-400">{getCarrier(found.carrier)?.refLabel}</p><p className="font-mono text-sm font-bold text-slate-700">{found.clientRef}</p></div>}
              {found.phone&&<p className="text-sm text-slate-600">📞 {found.phone}</p>}
              {found.address&&<p className="text-sm text-slate-600">📍 {found.address}</p>}
              {found.status==="recibido"&&<button onClick={()=>markRuta(found.code)} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold">🚚 Marcar En Ruta</button>}
              {found.status==="en_ruta"&&<p className="text-center text-amber-600 font-semibold text-sm py-1">Ya está en ruta 🚚</p>}
              {found.status==="entregado"&&<p className="text-center text-emerald-600 font-semibold text-sm py-1">Ya fue entregado ✅</p>}
              <button onClick={reset} className="w-full border-2 border-slate-200 text-slate-500 py-2 rounded-xl text-sm">Cerrar</button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {[{s:"recibido",l:"Recibidos",c:"text-blue-800",bg:"bg-blue-50",b:"border-blue-100"},{s:"en_ruta",l:"En ruta",c:"text-amber-800",bg:"bg-amber-50",b:"border-amber-100"},{s:"entregado",l:"Entregados",c:"text-emerald-800",bg:"bg-emerald-50",b:"border-emerald-100"}].map(x=>(
              <div key={x.s} className={`${x.bg} border ${x.b} rounded-xl p-3 text-center`}><p className={`text-2xl font-black ${x.c}`}>{packages.filter(p=>p.status===x.s).length}</p><p className="text-xs text-slate-500 font-medium mt-0.5">{x.l}</p></div>
            ))}
          </div>
          {recibidos>0&&<button onClick={markAllRuta} className="w-full bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 text-amber-800 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">🚚 Marcar TODOS en ruta <span className="bg-amber-200 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full">{recibidos}</span></button>}
        </div>
      )}

      {sub==="lista"&&(
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["todos","recibido","en_ruta","entregado"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-2 transition-all ${filter===f?"bg-blue-950 text-white border-blue-950":"bg-white border-slate-200 text-slate-600"}`}>
                {f==="todos"?`Todos (${packages.length})`:`${STATUS[f].short} (${packages.filter(p=>p.status===f).length})`}
              </button>
            ))}
          </div>
          {filtered.length===0?<div className="text-center py-12 text-slate-400"><p className="text-3xl mb-2">📭</p><p className="text-sm">No hay paquetes</p></div>
            :filtered.map(pkg=>(
              <div key={pkg.code} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{pkg.clientName}</p><p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{pkg.code}</p>{pkg.carrier&&<p className="text-xs text-slate-500 mt-0.5">{getCarrier(pkg.carrier).icon} {getCarrier(pkg.carrier).name}</p>}{pkg.registradoPor&&<p className="text-xs text-slate-400">👤 {pkg.registradoPor.name}</p>}</div>
                  <StatusBadge status={pkg.status}/>
                </div>
                {pkg.status==="recibido"&&<button onClick={()=>markRuta(pkg.code)} className="mt-2 w-full text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 py-1.5 rounded-lg font-bold">🚚 Marcar en ruta</button>}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REPARTIDOR VIEW (with dashboard, camera, bulk delivery)
// ═══════════════════════════════════════════════════════════
function RepartidorView({ packages, findPackage, updatePackage, showNotif, sess }) {
  const [sub,setSub]=useState("scan");
  const [code,setCode]=useState(""), [pkg,setPkg]=useState(null), [searched,setSearched]=useState(false), [done,setDone]=useState(false);
  const [recibidoPor,setRecibidoPor]=useState("");
  const inputRef=useRef();
  useEffect(()=>{inputRef.current?.focus();},[]);

  const enRuta   = packages.filter(p=>p.status==="en_ruta");
  const hoyStr   = hoy();
  const entregadosHoy = packages.filter(p=>p.status==="entregado"&&p.history?.some(h=>h.status==="entregado"&&h.date?.startsWith(hoyStr)));

  // Group en_ruta by client name
  const porCliente = enRuta.reduce((acc,pkg)=>{
    const k=pkg.clientName||"Sin nombre";
    if(!acc[k]) acc[k]=[];
    acc[k].push(pkg);
    return acc;
  },{});

  const handleScan=(c)=>{
    const t=(typeof c==="string"?c:code).trim();if(!t)return;
    setCode(t);setPkg(findPackage(t)||null);setSearched(true);setDone(false);setRecibidoPor("");
  };

  const handleDeliver=async(pkgToDeliver,nombreRecibio)=>{
    const target=pkgToDeliver||pkg;if(!target)return;
    try{
      const histEntry={status:"entregado",date:now()};
      await updateDoc(doc(db,"paquetes",target.code),{status:"entregado",history:[...target.history,histEntry],recibidoPor:nombreRecibio||target.clientName});
      setDone(true);showNotif(`✅ Entregado a ${target.clientName}`);
      if(!pkgToDeliver)setTimeout(()=>{setCode("");setPkg(null);setSearched(false);setDone(false);setRecibidoPor("");inputRef.current?.focus();},3000);
    }catch{showNotif("Error al confirmar","err");}
  };

  const handleBulkDeliver=async(clientName,pkgs)=>{
    try{
      await Promise.all(pkgs.map(p=>updateDoc(doc(db,"paquetes",p.code),{status:"entregado",history:[...p.history,{status:"entregado",date:now()}],recibidoPor:clientName})));
      showNotif(`✅ ${pkgs.length} paquetes entregados a ${clientName}`);
    }catch{showNotif("Error al entregar","err");}
  };

  return(
    <div className="space-y-4">
      {/* Dashboard */}
      <div className="grid grid-cols-3 gap-2">
        {[{val:enRuta.length,label:"Por entregar",c:"text-amber-800",bg:"bg-amber-50",b:"border-amber-200"},{val:entregadosHoy.length,label:"Entregados hoy",c:"text-emerald-800",bg:"bg-emerald-50",b:"border-emerald-200"},{val:Math.max(0,enRuta.length),label:"Pendientes",c:"text-blue-800",bg:"bg-blue-50",b:"border-blue-200"}].map((x,i)=>(
          <div key={i} className={`${x.bg} border ${x.b} rounded-xl p-3 text-center`}><p className={`text-2xl font-black ${x.c}`}>{x.val}</p><p className="text-xs text-slate-500 font-medium mt-0.5">{x.label}</p></div>
        ))}
      </div>

      {/* Sub tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {[{k:"scan",l:"📷 Escanear"},{k:"ruta",l:`📋 Mi ruta (${enRuta.length})`}].map(t=>(
          <button key={t.k} onClick={()=>setSub(t.k)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${sub===t.k?"bg-white shadow text-blue-950":"text-slate-500"}`}>{t.l}</button>
        ))}
      </div>

      {sub==="scan"&&(
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <ScanInputWithCamera value={code} onChange={setCode} onScan={handleScan} inputRef={inputRef} label="Confirmar entrega" placeholder="Escanea el código del paquete..."/>
          </div>

          {searched&&!pkg&&<div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center"><p className="text-2xl mb-1">❌</p><p className="text-red-700 font-bold">Paquete no encontrado</p></div>}

          {pkg&&!done&&(
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
              {/* Big client name */}
              <div className="bg-blue-950 rounded-xl p-3">
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-0.5">Entregar a</p>
                <p className="font-black text-white text-2xl leading-tight">{pkg.clientName}</p>
                {pkg.carrier&&<p className="text-blue-300 text-xs mt-1">{getCarrier(pkg.carrier).icon} {getCarrier(pkg.carrier).name}</p>}
              </div>
              <StatusBadge status={pkg.status}/>
              {pkg.phone&&<a href={`tel:${pkg.phone}`} className="flex items-center gap-2 text-blue-700 font-semibold text-sm">📞 {pkg.phone} <span className="text-blue-400 text-xs">Llamar</span></a>}
              {pkg.address&&<div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><p className="text-xs text-slate-400 font-semibold uppercase mb-0.5">Dirección</p><p className="text-sm text-slate-700 font-medium">{pkg.address}</p></div>}

              {/* Who received */}
              {pkg.status!=="entregado"&&(
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">¿Quién recibe el paquete?</label>
                  <input type="text" value={recibidoPor} onChange={e=>setRecibidoPor(e.target.value)} placeholder={pkg.clientName}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/>
                  <p className="text-xs text-slate-400 mt-1">Si lo recibe alguien más, escribe su nombre. Si no, se guarda con el nombre del cliente.</p>
                </div>
              )}

              {pkg.status==="entregado"
                ?<div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 text-center text-emerald-700 font-bold text-sm">✅ Ya fue entregado{pkg.recibidoPor?" — Recibió: "+pkg.recibidoPor:""}</div>
                :<button onClick={()=>handleDeliver(null,recibidoPor||pkg.clientName)} className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-5 rounded-2xl text-xl font-black transition-all shadow-xl shadow-emerald-100">✅ CONFIRMAR ENTREGA</button>
              }
            </div>
          )}

          {done&&<div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-8 text-center space-y-2"><p className="text-6xl">✅</p><p className="font-black text-emerald-700 text-2xl">¡Entregado!</p><p className="text-emerald-600 font-semibold">{pkg?.clientName}</p>{recibidoPor&&recibidoPor!==pkg?.clientName&&<p className="text-emerald-500 text-sm">Recibió: {recibidoPor}</p>}<p className="text-emerald-400 text-xs mt-2">Listo para el siguiente...</p></div>}
        </div>
      )}

      {sub==="ruta"&&(
        <div className="space-y-3">
          {Object.keys(porCliente).length===0&&<div className="text-center py-12 text-slate-400"><p className="text-3xl mb-2">🎉</p><p className="text-sm font-semibold">¡Todo entregado!</p></div>}
          {Object.entries(porCliente).map(([clientName,pkgs])=>(
            <div key={clientName} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-blue-950 px-4 py-3 flex justify-between items-center">
                <div><p className="font-black text-white">{clientName}</p><p className="text-blue-300 text-xs">{pkgs.length} paquete{pkgs.length>1?"s":""}</p></div>
                {pkgs.length>1&&(
                  <button onClick={()=>handleBulkDeliver(clientName,pkgs)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black px-3 py-1.5 rounded-xl transition-colors">✅ Entregar todos</button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {pkgs.map(p=>(
                  <div key={p.code} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-600 truncate">{p.code}</p>
                      {p.clientRef&&<p className="text-xs text-slate-400">{getCarrier(p.carrier)?.refLabel}: {p.clientRef}</p>}
                      {p.address&&<p className="text-xs text-slate-400 truncate">📍 {p.address}</p>}
                    </div>
                    <button onClick={()=>handleDeliver(p,clientName)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shrink-0">✅ Entregar</button>
                  </div>
                ))}
              </div>
              {pkgs[0]?.phone&&<div className="px-4 py-2 bg-slate-50 border-t border-slate-100"><a href={`tel:${pkgs[0].phone}`} className="text-blue-700 text-xs font-semibold flex items-center gap-1">📞 {pkgs[0].phone}</a></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMISIONES VIEW
// ═══════════════════════════════════════════════════════════
function ComisionesView({ packages, users, config }) {
  const [periodo,setPeriodo]=useState("mes");
  const precio=Number(config.precioPorPaquete)||5, mesStr=mes();
  const pkgs=packages.filter(p=>{if(!p.registradoPor)return false;return periodo==="mes"?p.createdAt?.startsWith(mesStr):true;});
  const ops=users.filter(u=>u.role==="operador"&&u.status==="activo");
  const stats=ops.map(op=>{const list=pkgs.filter(p=>p.registradoPor?.id===op.id);return{...op,count:list.length,total:list.length*precio};}).sort((a,b)=>b.count-a.count);
  const total=stats.reduce((s,x)=>s+x.total,0), count=stats.reduce((s,x)=>s+x.count,0);
  return(
    <div className="space-y-4">
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {[{k:"mes",l:"📅 Este mes"},{k:"todo",l:"📊 Todo"}].map(t=>(
          <button key={t.k} onClick={()=>setPeriodo(t.k)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${periodo===t.k?"bg-white shadow text-blue-950":"text-slate-500"}`}>{t.l}</button>
        ))}
      </div>
      <div className="bg-blue-950 rounded-2xl p-4 text-white">
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-1">{periodo==="mes"?"Total del mes":"Total general"}</p>
        <p className="text-4xl font-black text-amber-400">${total.toFixed(0)} <span className="text-lg text-amber-300">MXN</span></p>
        <p className="text-blue-300 text-sm mt-1">{count} paquetes · ${precio}/paquete</p>
      </div>
      <div className="space-y-3">
        {stats.length===0&&<div className="text-center py-8 text-slate-400"><p className="text-3xl mb-2">📊</p><p className="text-sm">Sin registros en este período</p></div>}
        {stats.map((op,i)=>(
          <div key={op.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black shrink-0 ${i===0?"bg-amber-100":i===1?"bg-slate-100":"bg-orange-50"}`}>{i===0?"🥇":i===1?"🥈":"🥉"}</div>
              <div className="flex-1"><p className="font-black text-slate-800">{op.name}</p><p className="text-xs text-slate-400">{op.email}</p></div>
              <div className="text-right"><p className="text-2xl font-black text-blue-950">${op.total}</p><p className="text-xs text-slate-400">{op.count} paquetes</p></div>
            </div>
            {op.count>0&&count>0&&<div className="mt-3"><div className="bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-blue-950 h-2 rounded-full" style={{width:`${Math.round(op.count/count*100)}%`}}/></div><p className="text-xs text-slate-400 mt-1">{Math.round(op.count/count*100)}% del total</p></div>}
          </div>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-xs text-amber-700 font-semibold">💡 Cambia el precio por paquete en la pestaña Configuración</p></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPLEADOS VIEW
// ═══════════════════════════════════════════════════════════
function EmpleadosView({ users, setUsers, showNotif }) {
  const pendientes=users.filter(u=>u.status==="pendiente"), activos=users.filter(u=>u.status==="activo");
  const updateStatus=async(id,status)=>{try{await updateDoc(doc(db,"usuarios",String(id)),{status});setUsers(prev=>prev.map(u=>u.id===id?{...u,status}:u));showNotif(status==="activo"?"✅ Empleado aprobado":"❌ Rechazado");}catch{showNotif("Error","err");}};
  const handleDelete=async(id)=>{if(activos.length<=1){showNotif("No puedes eliminar el último empleado activo","err");return;}try{await deleteDoc(doc(db,"usuarios",String(id)));setUsers(prev=>prev.filter(u=>u.id!==id));showNotif("Empleado eliminado");}catch{showNotif("Error","err");}};
  return(
    <div className="space-y-4">
      {pendientes.length>0&&(
        <div>
          <div className="flex items-center gap-2 mb-3"><p className="text-sm font-bold text-slate-700">Solicitudes pendientes</p><span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{pendientes.length}</span></div>
          <div className="space-y-2">
            {pendientes.map(u=>(
              <div key={u.id} className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3">
                <div className="flex items-start gap-3"><div className="w-10 h-10 bg-amber-200 rounded-xl flex items-center justify-center text-xl shrink-0">⏳</div><div className="flex-1 min-w-0"><p className="font-bold text-slate-800 text-sm">{u.name}</p><p className="text-xs text-slate-500 truncate">{u.email}</p><p className="text-xs text-amber-700 font-semibold mt-0.5">{u.role==="operador"?"🏢 Operador":"🚚 Repartidor"}</p></div></div>
                <div className="flex gap-2 mt-3"><button onClick={()=>updateStatus(u.id,"activo")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-xs font-bold">✅ Aprobar</button><button onClick={()=>updateStatus(u.id,"rechazado")} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-xl text-xs font-bold">❌ Rechazar</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm font-bold text-slate-700 mb-3">Empleados activos ({activos.length})</p>
        <div className="space-y-2">
          {activos.map(u=>(
            <div key={u.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${u.role==="admin"?"bg-amber-100":u.role==="operador"?"bg-blue-100":"bg-green-100"}`}>{u.role==="admin"?"👑":u.role==="operador"?"🏢":"🚚"}</div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{u.name}</p><p className="text-xs text-slate-400 truncate">{u.email}</p><span className={`text-xs font-bold ${u.role==="admin"?"text-amber-700":u.role==="operador"?"text-blue-800":"text-green-700"}`}>{u.role==="admin"?"Administrador":u.role==="operador"?"Operador":"Repartidor"}</span></div>
              {u.role!=="admin"&&<button onClick={()=>handleDelete(u.id)} className="text-slate-300 hover:text-red-400 text-2xl font-bold shrink-0">×</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CONFIG VIEW
// ═══════════════════════════════════════════════════════════
function ConfigView({ config, setConfig, showNotif }) {
  const [form,setForm]=useState({...config}), [saved,setSaved]=useState(false);
  const save=async()=>{try{await setDoc(doc(db,"config","general"),form);setConfig(form);setSaved(true);showNotif("✅ Guardado");setTimeout(()=>setSaved(false),2000);}catch{showNotif("Error","err");}};
  return(
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-4">
        {[{k:"companyName",label:"Nombre de la empresa",type:"text"},{k:"precioPorPaquete",label:"Precio por paquete (MXN)",type:"number"},{k:"phone1",label:"Teléfono principal",type:"tel"},{k:"phone2",label:"Teléfono secundario",type:"tel"},{k:"whatsapp",label:"WhatsApp (con código de país, sin +)",type:"text"},{k:"email",label:"Correo",type:"email"},{k:"address",label:"Dirección",type:"text"}].map(f=>(
          <div key={f.k}><label className="text-xs font-bold text-slate-600 block mb-1.5">{f.label}</label><input type={f.type} value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-700"/></div>
        ))}
        <button onClick={save} className={`w-full py-3 rounded-xl text-sm font-bold ${saved?"bg-emerald-500 text-white":"bg-blue-950 hover:bg-blue-900 text-white"}`}>{saved?"✅ Guardado":"Guardar cambios"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPLOYEE SHELL
// ═══════════════════════════════════════════════════════════
function EmployeeShell({ sess, onLogout, tab, setTab, pendientesCount, children }) {
  const tabs=[{k:"operador",icon:"📦",label:"Paquetes"},{k:"comisiones",icon:"📊",label:"Comisiones"},{k:"empleados",icon:"👥",label:"Empleados"},{k:"config",icon:"⚙️",label:"Config"}];
  const isAdmin=sess.role==="admin"||sess.role==="operador";
  return(
    <div className="min-h-screen bg-slate-50">
      <header className="bg-blue-950 text-white px-4 py-3 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <VHSALogo size="sm"/>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-blue-400 text-xs hidden sm:block">{sess.role==="repartidor"?"🚚":"🏢"} {sess.name}</span>
            <button onClick={onLogout} className="text-xs text-blue-400 hover:text-red-400 border border-blue-800 px-2.5 py-1.5 rounded-lg">Salir 🚪</button>
          </div>
        </div>
      </header>
      {isAdmin&&(
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
          <div className="max-w-lg mx-auto flex overflow-x-auto">
            {tabs.map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)} className={`flex-1 min-w-0 py-3 flex flex-col items-center gap-0.5 text-xs font-bold whitespace-nowrap px-2 transition-colors relative ${tab===t.k?"border-b-2 border-amber-500 text-blue-950":"text-slate-400"}`}>
                <span className="text-base">{t.icon}</span>{t.label}
                {t.k==="empleados"&&pendientesCount>0&&<span className="absolute top-1 right-2 bg-red-500 text-white text-xs font-black w-4 h-4 rounded-full flex items-center justify-center">{pendientesCount}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {sess.role==="repartidor"&&<div className="bg-amber-400 text-blue-950 px-4 py-2 text-center"><p className="text-xs font-black uppercase tracking-wider">🚚 Panel Repartidor · {sess.name}</p></div>}
      <main className="max-w-lg mx-auto p-4 pb-10">{children}</main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen,setScreen]=useState("public");
  const [sess,setSess]=useState(null);
  const [packages,setPackages]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [users,setUsers]=useState([]);
  const [config,setConfig]=useState(DEFAULT_CONFIG);
  const [loaded,setLoaded]=useState(false);
  const [notif,setNotif]=useState(null);
  const [opTab,setOpTab]=useState("operador");

  useEffect(()=>{
    const saved=sessionStore.get();if(saved){setSess(saved);setScreen("employee");}
    getDocs(collection(db,"usuarios")).then(snap=>{if(snap.empty){SEED_USERS.forEach(u=>setDoc(doc(db,"usuarios",String(u.id)),u));setUsers(SEED_USERS);}else{setUsers(snap.docs.map(d=>d.data()));}}).catch(console.error);
    getDoc(doc(db,"config","general")).then(snap=>{if(snap.exists())setConfig({...DEFAULT_CONFIG,...snap.data()});}).catch(console.error);
    getDocs(collection(db,"clientes")).then(snap=>{setClientes(snap.docs.map(d=>d.data()));}).catch(console.error);
  },[]);

  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"paquetes"),snap=>{
      const pkgs=snap.docs.map(d=>d.data());pkgs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));setPackages(pkgs);setLoaded(true);
    },console.error);
    return()=>unsub();
  },[]);

  // Listen for new clients too
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,"clientes"),snap=>{setClientes(snap.docs.map(d=>d.data()));},()=>{});
    return()=>unsub();
  },[]);

  const showNotif=(msg,type="ok")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3000);};
  const handleLogin=(user)=>{const s={id:user.id,email:user.email,name:user.name,role:user.role};setSess(s);sessionStore.set(s);setScreen("employee");setOpTab("operador");};
  const handleLogout=()=>{setSess(null);sessionStore.clear();setScreen("public");};
  const addPackage=(pkg)=>setDoc(doc(db,"paquetes",pkg.code),pkg);
  const updatePackage=(code,status)=>{const pkg=packages.find(p=>p.code===code);if(!pkg)return;return updateDoc(doc(db,"paquetes",code),{status,history:[...pkg.history,{status,date:now()}]});};
  const findPackage=(q)=>{const t=q.trim();return packages.find(p=>p.code===t||(p.clientRef&&p.clientRef===t));};
  const pendientesCount=users.filter(u=>u.status==="pendiente").length;

  if(!loaded)return<div className="flex flex-col items-center justify-center min-h-screen bg-blue-950 gap-3"><div className="text-5xl animate-bounce">🚚</div><p className="text-blue-300 font-semibold">Cargando Logística VHSA...</p></div>;
  if(screen==="login")    return<LoginView users={users} onLogin={handleLogin} onBack={()=>setScreen("public")} onRegistro={()=>setScreen("registro")}/>;
  if(screen==="registro") return<RegistroView users={users} setUsers={setUsers} onBack={()=>setScreen("login")} onSuccess={()=>setScreen("pendiente")}/>;
  if(screen==="pendiente")return<PendienteView onBack={()=>setScreen("public")}/>;

  if(screen==="employee"&&sess)return(
    <EmployeeShell sess={sess} onLogout={handleLogout} tab={opTab} setTab={setOpTab} pendientesCount={pendientesCount}>
      <Toast notif={notif}/>
      {(sess.role==="operador"||sess.role==="admin")&&opTab==="operador"   &&<OperadorView packages={packages} clientes={clientes} findPackage={findPackage} addPackage={addPackage} updatePackage={updatePackage} showNotif={showNotif} sess={sess}/>}
      {(sess.role==="operador"||sess.role==="admin")&&opTab==="comisiones" &&<ComisionesView packages={packages} users={users} config={config}/>}
      {(sess.role==="operador"||sess.role==="admin")&&opTab==="empleados"  &&<EmpleadosView users={users} setUsers={setUsers} showNotif={showNotif}/>}
      {(sess.role==="operador"||sess.role==="admin")&&opTab==="config"     &&<ConfigView config={config} setConfig={setConfig} showNotif={showNotif}/>}
      {sess.role==="repartidor"&&<RepartidorView packages={packages} findPackage={findPackage} updatePackage={updatePackage} showNotif={showNotif} sess={sess}/>}
    </EmployeeShell>
  );

  return<><Toast notif={notif}/><PublicPage findPackage={findPackage} config={config} onEmployeeAccess={()=>setScreen("login")}/></>;
}
