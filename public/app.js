let clientes=[], actual=null, extra=3, abierto=null, editId=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const money=n=>"Bs. "+n.toLocaleString("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt=iso=>new Date(iso+"T00:00:00").toLocaleDateString("es",{day:"2-digit",month:"short",year:"numeric"});
const hoy=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const dias=(a,b)=>Math.round((new Date(a+"T00:00:00")-new Date(b+"T00:00:00"))/864e5);
const capPagado=c=>(c.capitales||[]).reduce((s,x)=>s+x.monto,0);
const saldoCap=c=>Math.max(0,c.monto-capPagado(c));
const saldado=c=>saldoCap(c)<=0.005;
const interes=c=>saldoCap(c)*c.tasa/100;
const dueISO=(c,i)=>{const[y,m,d]=c.fecha.split("-").map(Number);const dt=new Date(y,m-1+i,1);const last=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();dt.setDate(Math.min(d,last));return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`};
const vencidos=c=>{let n=0;while(dueISO(c,n+1)<=hoy())n++;return n};
const atrasados=c=>{if(saldado(c))return 0;let a=0;for(let i=1;i<=vencidos(c);i++)if(!c.pagos[i])a++;return a};

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
  let caps=[];
  if(ids.length){
    const r=await db.from("abonos_capital").select("id, cliente_id, fecha, monto").in("cliente_id",ids).order("fecha",{ascending:false});
    if(!r.error)caps=r.data;
  }
  const mapa=new Map(cs.map(c=>{
    c.monto=Number(c.monto);c.tasa=Number(c.tasa);c.pagos={};c.capitales=[];
    return [c.id,c];
  }));
  ps.forEach(p=>{const c=mapa.get(p.cliente_id);if(c)c.pagos[p.mes]={fecha:p.fecha,monto:Number(p.monto)}});
  caps.forEach(k=>{const c=mapa.get(k.cliente_id);if(c)c.capitales.push({id:k.id,fecha:k.fecha,monto:Number(k.monto)})});
  clientes=cs;
  if(actual)actual=clientes.find(c=>c.id===actual.id)||null;
}

async function enviarReciboPDF(c,info){
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error("No se pudo cargar el generador de PDF.");
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a5"});
  doc.setFillColor(4,120,87);
  doc.rect(0,0,148,28,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.text("COMPROBANTE DE PAGO",12,13);
  doc.setFont("helvetica","normal");
  doc.setFontSize(10);
  doc.text("Control de Préstamos · PrestamosRene",12,21);

  doc.setTextColor(30,41,59);
  let y=40;
  const fila=(k,v)=>{
    doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text(k+":",12,y);
    doc.setFont("helvetica","normal");doc.text(String(v),58,y);
    y+=9;
  };
  fila("Cliente",c.nombre);
  if(c.doc)fila("Cédula / ID",c.doc);
  if(c.telefono)fila("Teléfono",c.telefono);
  fila("Concepto",info.tipo);
  fila("Fecha de pago",fmt(info.fecha));
  fila("Monto pagado",money(info.monto));
  if(info.detalle)fila("Detalle",info.detalle);
  fila("Capital pendiente",money(saldoCap(c)));

  doc.setDrawColor(203,213,225);
  doc.line(12,y+2,136,y+2);
  doc.setFontSize(9);doc.setTextColor(100,116,139);
  doc.text("Emitido el "+fmt(hoy()),12,y+10);

  const safe=c.nombre.replace(/[^a-zA-Z0-9_-]+/g,"_").slice(0,25)||"cliente";
  const nombreArchivo=`Recibo_${safe}_${info.sufijo}.pdf`;
  const resumen=`*Comprobante de pago*\nCliente: ${c.nombre}\nConcepto: ${info.tipo}\nFecha: ${fmt(info.fecha)}\nMonto: ${money(info.monto)}\nCapital pendiente: ${money(saldoCap(c))}`;

  const blob=doc.output("blob");
  const file=new File([blob],nombreArchivo,{type:"application/pdf"});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title:"Comprobante de pago",text:resumen});return}
    catch(e){if(e.name==="AbortError")return}
  }
  doc.save(nombreArchivo);
  const tel=(c.telefono||"").replace(/\D/g,"");
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(resumen)}`,"_blank");
}

function pintarLista(){
  const tot=clientes.reduce((s,c)=>s+saldoCap(c),0),
        cob=clientes.reduce((s,c)=>s+Object.values(c.pagos).reduce((x,p)=>x+p.monto,0),0),
        at=clientes.filter(c=>atrasados(c)).length;
  $("#resumen").innerHTML=[["Por cobrar",money(tot)],["Intereses cobrados",money(cob)],["Con atraso",at]].map(([k,v])=>`<div class="rounded-xl bg-white/15 py-2"><div class="text-[11px] text-emerald-100">${k}</div><div class="font-semibold text-sm">${esc(v)}</div></div>`).join("");
  const l=$("#lista");
  if(!clientes.length){l.innerHTML='<p class="text-center text-slate-500 dark:text-slate-400 py-6">Aún no hay clientes. Agrega el primero arriba.</p>';return}
  l.innerHTML="";
  clientes.forEach(c=>{
    const a=atrasados(c), adv=Object.keys(c.pagos).filter(k=>k>vencidos(c)).length, sal=saldado(c);
    const b=document.createElement("button");b.type="button";
    b.className="w-full text-left flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow ring-1 ring-slate-200 dark:ring-slate-800 hover:ring-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";
    b.innerHTML=`<div class="min-w-0"><div class="font-semibold truncate">${esc(c.nombre)}</div><div class="text-sm text-slate-500 dark:text-slate-400">${money(saldoCap(c))} pendiente (de ${money(c.monto)}) · ${c.tasa}%</div></div>
    <span class="shrink-0 text-xs font-semibold rounded-full px-3 py-1 ${sal?"bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300":a?"bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300":"bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"}">${sal?"Saldado":a?a+(a>1?" meses":" mes")+" sin pagar":(adv?"Al día + "+adv+" adelantado"+(adv>1?"s":""):"Al día")}</span>`;
    b.onclick=()=>{actual=c;extra=3;abierto=null;$("#form-cap").hidden=true;$("#vista-lista").hidden=true;$("#vista-detalle").hidden=false;pintarDetalle();scrollTo(0,0)};
    l.appendChild(b);
  });
}

function pintarDetalle(){
  const c=actual;
  if(!c)return;
  const pagado=Object.values(c.pagos).reduce((s,p)=>s+p.monto,0),
        cp=capPagado(c), sc=saldoCap(c);
  $("#d-nombre").textContent=c.nombre;
  const datos=[["Monto prestado",money(c.monto)],["Capital pendiente",money(sc)],["Capital pagado",money(cp)],["Interés mensual",`${c.tasa}% · ${money(interes(c))}`],["Fecha del préstamo",fmt(c.fecha)],["Intereses pagados",money(pagado)],["Teléfono",c.telefono||"—"],["Cédula / ID",c.doc||"—"]];
  $("#d-datos").innerHTML=datos.map(([k,v])=>`<div class="border-l-4 border-emerald-500 pl-3"><dt class="text-xs text-slate-500 dark:text-slate-400">${k}</dt><dd class="font-semibold">${esc(v)}</dd></div>`).join("");

  const btnCap=$("#btn-cap"), fCap=$("#form-cap"), boxCap=$("#capitales");
  btnCap.hidden=saldado(c);
  if(saldado(c))fCap.hidden=true;
  boxCap.innerHTML="";
  if(saldado(c)){
    boxCap.innerHTML='<p class="text-sm font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-xl p-3 ring-1 ring-teal-300 dark:ring-teal-800">Capital saldado completamente.</p>';
  }else if(!c.capitales.length){
    boxCap.innerHTML='<p class="text-xs text-slate-500 dark:text-slate-400">Aún no hay abonos al capital.</p>';
  }
  c.capitales.forEach(k=>{
    const el=document.createElement("div");
    el.className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200 dark:ring-slate-700";
    el.innerHTML=`<div><div class="font-medium">${money(k.monto)}</div><div class="text-xs text-slate-500 dark:text-slate-400">Pagado el ${fmt(k.fecha)}</div></div><div class="flex gap-2"><button type="button" data-c="pdf" class="btn-s text-sm">PDF / WhatsApp</button><button type="button" data-c="del" class="btn-s text-sm">Deshacer</button></div>`;
    el.querySelector('[data-c="pdf"]').onclick=()=>run(()=>enviarReciboPDF(c,{tipo:"Abono al Capital",fecha:k.fecha,monto:k.monto,detalle:`Capital restante: ${money(sc)}`,sufijo:"capital"}));
    el.querySelector('[data-c="del"]').onclick=()=>{
      if(confirm("¿Deshacer este pago de capital?"))run(async()=>{checkErr(await getDB().from("abonos_capital").delete().eq("id",k.id));await recargar();pintarDetalle()});
    };
    boxCap.appendChild(el);
  });
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
    <div class="flex flex-wrap gap-2">${p?'<button type="button" data-a="w" class="btn-p text-sm">PDF / WhatsApp</button><button type="button" data-a="e" class="btn-s text-sm">Editar</button><button type="button" data-a="d" class="btn-s text-sm">Deshacer</button>':'<button type="button" data-a="n" class="btn-p text-sm">Registrar pago</button>'}</div></div>
    <form hidden class="mt-3 grid grid-cols-2 gap-2 items-end"><label class="text-xs text-slate-500 dark:text-slate-400">Fecha del pago<input type="date" name="f" required class="inp" value="${p?p.fecha:hoy()}"></label><label class="text-xs text-slate-500 dark:text-slate-400">Monto pagado<input type="number" name="m" step="0.01" min="0" required class="inp" value="${(p?p.monto:interes(c)).toFixed(2)}"></label><button type="submit" name="modo" value="guardar" class="btn-s">Guardar pago</button><button type="submit" name="modo" value="wa" class="btn-p">Guardar y enviar PDF</button></form>`;
    const f=el.querySelector("form");
    if(abierto===i)f.hidden=false;
    el.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
      if(b.dataset.a==="d"){
        if(confirm("¿Deshacer este pago?"))run(async()=>{checkErr(await getDB().from("pagos").delete().eq("cliente_id",c.id).eq("mes",i));await recargar();pintarDetalle()});
      }else if(b.dataset.a==="w"){
        run(()=>enviarReciboPDF(c,{tipo:`Interés Mes ${i}`,fecha:p.fecha,monto:p.monto,detalle:`Vencimiento: ${fmt(due)}`,sufijo:`mes_${i}`}));
      }else{abierto=abierto===i?null:i;f.hidden=!f.hidden}
    });
    f.onsubmit=e=>{
      e.preventDefault();
      const enviar=e.submitter&&e.submitter.value==="wa";
      const fecha=f.f.value, monto=+f.m.value;
      run(async()=>{
        checkErr(await getDB().from("pagos").upsert({cliente_id:c.id,mes:i,fecha,monto},{onConflict:"cliente_id,mes"}));
        abierto=null;await recargar();pintarDetalle();
        if(enviar)await enviarReciboPDF(actual||c,{tipo:`Interés Mes ${i}`,fecha,monto,detalle:`Vencimiento: ${fmt(due)}`,sufijo:`mes_${i}`});
      });
    };
    box.appendChild(el);
  }
}

$("#btn-cap").onclick=()=>{
  const f=$("#form-cap");
  f.hidden=!f.hidden;
  if(!f.hidden&&actual){
    f.f.value=hoy();
    f.m.max=saldoCap(actual).toFixed(2);
    f.m.value=saldoCap(actual).toFixed(2);
  }
};
$("#form-cap").onsubmit=e=>{
  e.preventDefault();
  const f=e.target, monto=+f.m.value, sc=saldoCap(actual);
  if(!(monto>0)||monto>sc+0.005){alert("El monto debe ser mayor a 0 y no superar el capital pendiente ("+money(sc)+").");return}
  run(async()=>{
    checkErr(await getDB().from("abonos_capital").insert({cliente_id:actual.id,fecha:f.f.value,monto}));
    f.hidden=true;await recargar();pintarDetalle();
  });
};

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
