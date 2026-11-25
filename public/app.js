let clientes=[], actual=null, extra=3, abierto=null, editId=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const money=n=>"Bs. "+n.toLocaleString("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt=iso=>new Date(iso+"T00:00:00").toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"});
const hoy=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const dias=(a,b)=>Math.round((new Date(a+"T00:00:00")-new Date(b+"T00:00:00"))/864e5);
const interes=c=>c.monto*c.tasa/100;
const dueISO=(c,i)=>{const[y,m,d]=c.fecha.split("-").map(Number);const dt=new Date(y,m-1+i,1);const last=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();dt.setDate(Math.min(d,last));return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`};
const vencidos=c=>{let n=0;while(dueISO(c,n+1)<=hoy())n++;return n};
const atrasados=c=>{let a=0;for(let i=1;i<=vencidos(c);i++)if(!c.pagos[i])a++;return a};

let sb=null;
function getDB(){
  if(sb)return sb;
  const url=window.SUPABASE_URL||"", key=window.SUPABASE_ANON_KEY||"";
  if(!url||!key||url.includes("TU-PROYECTO")||key.includes("TU-ANON-KEY")){
    throw new Error("Falta configurar Supabase en public/config.js (SUPABASE_URL y SUPABASE_ANON_KEY).");
  }
  if(!window.supabase)throw new Error("No se pudo cargar la librería de Supabase.");
  sb=window.supabase.createClient(url,key);
  return sb;
}
function checkErr(res){if(res.error)throw new Error(res.error.message||"Error en Supabase");return res.data}
async function run(fn){try{await fn()}catch(e){alert(e.message)}}
async function recargar(){
  const db=getDB();
  const cs=checkErr(await db.from("clientes").select("id, nombre, telefono, doc, monto, tasa, fecha").order("id",{ascending:false}));
  const ids=cs.map(c=>c.id);
  const ps=ids.length?checkErr(await db.from("pagos").select("cliente_id, mes, fecha, monto").in("cliente_id",ids)):[];
  const mapa=new Map(cs.map(c=>{
    c.monto=Number(c.monto);c.tasa=Number(c.tasa);c.pagos={};
    return [c.id,c];
  }));
  ps.forEach(p=>{const c=mapa.get(p.cliente_id);if(c)c.pagos[p.mes]={fecha:p.fecha,monto:Number(p.monto)}});
  clientes=cs;
  if(actual)actual=clientes.find(c=>c.id===actual.id)||null;
}

function pintarLista(){
  const tot=clientes.reduce((s,c)=>s+c.monto,0),
        cob=clientes.reduce((s,c)=>s+Object.values(c.pagos).reduce((x,p)=>x+p.monto,0),0),
        at=clientes.filter(c=>atrasados(c)).length;
  $("#resumen").innerHTML=[["Prestado",money(tot)],["Intereses cobrados",money(cob)],["Con atraso",at]].map(([k,v])=>`<div class="rounded-xl bg-white/15 py-2"><div class="text-[11px] text-emerald-100">${k}</div><div class="font-semibold text-sm">${esc(v)}</div></div>`).join("");
  const l=$("#lista");
  if(!clientes.length){l.innerHTML='<p class="text-center text-slate-500 dark:text-slate-400 py-6">Aún no hay clientes. Agrega el primero arriba.</p>';return}
  l.innerHTML="";
  clientes.forEach(c=>{
    const a=atrasados(c), adv=Object.keys(c.pagos).filter(k=>k>vencidos(c)).length;
    const b=document.createElement("button");b.type="button";
    b.className="w-full text-left flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow ring-1 ring-slate-200 dark:ring-slate-800 hover:ring-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";
    b.innerHTML=`<div class="min-w-0"><div class="font-semibold truncate">${esc(c.nombre)}</div><div class="text-sm text-slate-500 dark:text-slate-400">${money(c.monto)} al ${c.tasa}% · desde ${fmt(c.fecha)}</div></div>
    <span class="shrink-0 text-xs font-semibold rounded-full px-3 py-1 ${a?"bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300":"bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"}">${a?a+(a>1?" meses":" mes")+" sin pagar":(adv?"Al día + "+adv+" adelantado"+(adv>1?"s":""):"Al día")}</span>`;
    b.onclick=()=>{actual=c;extra=3;abierto=null;$("#vista-lista").hidden=true;$("#vista-detalle").hidden=false;pintarDetalle();scrollTo(0,0)};
    l.appendChild(b);
  });
}

function pintarDetalle(){
  const c=actual;
  if(!c)return;
  const pagado=Object.values(c.pagos).reduce((s,p)=>s+p.monto,0);
  $("#d-nombre").textContent=c.nombre;
  const datos=[["Monto prestado",money(c.monto)],["Interés mensual",`${c.tasa}% · ${money(interes(c))}`],["Fecha del préstamo",fmt(c.fecha)],["Intereses pagados",money(pagado)],["Teléfono",c.telefono||"—"],["Cédula / ID",c.doc||"—"]];
  $("#d-datos").innerHTML=datos.map(([k,v])=>`<div class="border-l-4 border-emerald-500 pl-3"><dt class="text-xs text-slate-500 dark:text-slate-400">${k}</dt><dd class="font-semibold">${esc(v)}</dd></div>`).join("");
  const box=$("#meses");box.innerHTML="";const v=vencidos(c);
  for(let i=1;i<=v+extra;i++){
    const due=dueISO(c,i), p=c.pagos[i], venc=i<=v;
    let estado,color;
    if(p){
      const d=dias(due,p.fecha);
      estado=d>0?`Pagado por adelantado · ${d} día${d>1?"s":""} antes (${fmt(p.fecha)})`:d===0?`Pagado a tiempo (${fmt(p.fecha)})`:`Pagado con ${-d} día${d<-1?"s":""} de atraso (${fmt(p.fecha)})`;
      color=d>0?"bg-sky-50 dark:bg-sky-950/40 ring-sky-300 dark:ring-sky-800":"bg-emerald-50 dark:bg-emerald-950/40 ring-emerald-300 dark:ring-emerald-800";
    }else{
      estado=venc?"Pendiente de pago":"Próximo · puedes pagarlo por adelantado";
      color=venc?"bg-amber-50 dark:bg-amber-950/30 ring-amber-300 dark:ring-amber-800":"bg-slate-50 dark:bg-slate-800/60 ring-slate-200 dark:ring-slate-700";
    }
    const el=document.createElement("div");el.className=`rounded-xl p-3 ring-1 ${color}`;
    el.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><div><div class="font-medium">Mes ${i} · vence ${fmt(due)}</div><div class="text-xs text-slate-600 dark:text-slate-300">${estado}${p&&Math.abs(p.monto-interes(c))>0.005?" · "+money(p.monto):""}</div></div>
    <div class="flex gap-2">${p?'<button type="button" data-a="e" class="btn-s text-sm">Editar</button><button type="button" data-a="d" class="btn-s text-sm">Deshacer</button>':'<button type="button" data-a="n" class="btn-p text-sm">Registrar pago</button>'}</div></div>
    <form hidden class="mt-3 grid grid-cols-2 gap-2 items-end"><label class="text-xs text-slate-500 dark:text-slate-400">Fecha del pago<input type="date" name="f" required class="inp" value="${p?p.fecha:hoy()}"></label><label class="text-xs text-slate-500 dark:text-slate-400">Monto pagado<input type="number" name="m" step="0.01" min="0" required class="inp" value="${(p?p.monto:interes(c)).toFixed(2)}"></label><button class="btn-p col-span-2">Guardar pago</button></form>`;
    const f=el.querySelector("form");
    if(abierto===i)f.hidden=false;
    el.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
      if(b.dataset.a==="d"){
        if(confirm("¿Deshacer este pago?"))run(async()=>{checkErr(await getDB().from("pagos").delete().eq("cliente_id",c.id).eq("mes",i));await recargar();pintarDetalle()});
      }else{abierto=abierto===i?null:i;f.hidden=!f.hidden}
    });
    f.onsubmit=e=>{
      e.preventDefault();
      run(async()=>{
        checkErr(await getDB().from("pagos").upsert({cliente_id:c.id,mes:i,fecha:f.f.value,monto:+f.m.value},{onConflict:"cliente_id,mes"}));
        abierto=null;await recargar();pintarDetalle();
      });
    };
    box.appendChild(el);
  }
}

$("#mas").onclick=()=>{extra+=3;pintarDetalle()};

$("#form").addEventListener("submit",e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const d={nombre:f.get("nombre").trim(),telefono:f.get("telefono").trim(),doc:f.get("doc").trim(),monto:+f.get("monto"),tasa:+f.get("tasa"),fecha:f.get("fecha")};
  run(async()=>{
    const db=getDB();
    if(editId)checkErr(await db.from("clientes").update(d).eq("id",editId));
    else checkErr(await db.from("clientes").insert(d));
    finEdicion();await recargar();pintarLista();
  });
});
function finEdicion(){editId=null;$("#form").reset();$("#t-form").textContent="Nuevo cliente";$("#guardarBtn").textContent="Guardar cliente";$("#cancelar").hidden=true}
$("#cancelar").onclick=finEdicion;
$("#editar").onclick=()=>{
  const c=actual,f=$("#form");editId=c.id;
  for(const k of ["nombre","telefono","doc","monto","tasa","fecha"])f[k].value=c[k];
  $("#t-form").textContent="Editar cliente";$("#guardarBtn").textContent="Actualizar cliente";$("#cancelar").hidden=false;
  $("#volver").onclick();scrollTo(0,0);
};
$("#volver").onclick=()=>{$("#vista-detalle").hidden=true;$("#vista-lista").hidden=false;pintarLista()};
$("#borrar").onclick=()=>{
  if(!confirm("¿Eliminar a "+actual.nombre+" y todos sus pagos?"))return;
  run(async()=>{
    checkErr(await getDB().from("clientes").delete().eq("id",actual.id));
    actual=null;await recargar();$("#volver").onclick();
  });
};

async function iniciar(){
  try{
    await recargar();
    pintarLista();
  }catch(e){
    $("#lista").innerHTML=`<p class="text-center text-rose-600 py-6">${esc(e.message)}</p>`;
  }
}

iniciar();
