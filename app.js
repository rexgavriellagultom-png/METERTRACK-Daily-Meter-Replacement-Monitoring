const state = {
  daily: [],
  types: [],
  mode: "demo",
  sheetId: localStorage.getItem("gm_sheet_id") || "",
  sheetName: localStorage.getItem("gm_sheet_name") || "02_SUMMARY_HARIAN",
  typeSheetName: localStorage.getItem("gm_type_sheet_name") || "03_SUMMARY_JENIS",
  chart: null
};

const $ = id => document.getElementById(id);

function parseDate(v){
  if(!v) return null;
  if(v instanceof Date) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  const s=String(v).trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    const [d,m,y]=s.split("/").map(Number);
    return new Date(y,m-1,d);
  }
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const [y,m,d]=s.slice(0,10).split("-").map(Number);
    return new Date(y,m-1,d);
  }
  const d=new Date(v);
  return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function isoDate(d){ return d.toISOString().slice(0,10); }
function fmtDate(d){ return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function pct(v){ return `${(v*100).toFixed(1)}%`; }
function nfmt(v){ return Math.round(v).toLocaleString("id-ID"); }
function typeNorm(v){ return String(v||"").trim().toUpperCase(); }

function seedFromDemo(){
  state.daily = (window.DEMO_DATA?.daily||[]).map(r=>({
    ...r,
    tanggalObj: parseDate(r.tanggal),
    target_hari:num(r.target_hari),
    real_hari:num(r.realisasi_harian),
    target_kum:num(r.target_kumulatif),
    real_kum:num(r.realisasi_kumulatif),
    cap_kum:num(r.capaian_kumulatif),
  }));
  state.types = (window.DEMO_DATA?.types||[]).map(r=>({
    ...r,
    tanggalObj: parseDate(r.tanggal),
    real:num(r.realisasi)
  }));
  state.mode="demo";
  updateStatus();
  setDefaultDates();
  render();
}

function updateStatus(){
  $("statusBadge").textContent = state.mode==="live" ? "GOOGLE SHEETS" : "DEMO DATA";
}

function setDefaultDates(){
  const all=state.daily.map(r=>r.tanggalObj).filter(Boolean).sort((a,b)=>a-b);
  if(!all.length) return;
  if(!$("startDate").value) $("startDate").value=isoDate(all[0]);
  $("endDate").value=isoDate(all[all.length-1]);
}

function groupBy(rows,key){
  const m=new Map();
  rows.forEach(r=>{
    const k=r[key];
    if(!m.has(k)) m.set(k,[]);
    m.get(k).push(r);
  });
  return m;
}

function getEndSnapshot(rows,endDate){
  return rows
    .filter(r=>r.tanggalObj && r.tanggalObj.getTime()===endDate.getTime())
    .sort((a,b)=>String(a.kode_up3).localeCompare(String(b.kode_up3)));
}

function getTypeRealUp3(up3,endDate){
  const f=state.types.filter(r=>r.tanggalObj && r.tanggalObj.getTime()===endDate.getTime() && String(r.up3).toUpperCase()===String(up3).toUpperCase());
  const selected=$("typeFilter").value;
  if(selected==="ALL") return f.reduce((s,r)=>s+num(r.real),0);
  return f.filter(r=>typeNorm(r.jenis_ganti_meter)===selected).reduce((s,r)=>s+num(r.real),0);
}

function calculate(){
  const start=parseDate($("startDate").value);
  const end=parseDate($("endDate").value);
  const selected=$("typeFilter").value;
  if(!start||!end||start>end) return null;

  const periodRows=state.daily.filter(r=>r.tanggalObj>=start && r.tanggalObj<=end);
  const snapRows=getEndSnapshot(state.daily,end);

  // Cumulative target and total real use the snapshot at end date.
  const byUp3=[];
  snapRows.forEach(s=>{
    const selectedCum = getTypeRealUp3(s.up3,end);
    const realCum = selected==="ALL" ? num(s.real_kum) : selectedCum;
    const targetCum = num(s.target_kum); // target remains overall
    const periodReal = selected==="ALL"
      ? periodRows.filter(x=>String(x.up3).toUpperCase()===String(s.up3).toUpperCase()).reduce((a,x)=>a+num(x.real_hari),0)
      : state.types.filter(x=>x.tanggalObj>=start && x.tanggalObj<=end && String(x.up3).toUpperCase()===String(s.up3).toUpperCase() && typeNorm(x.jenis_ganti_meter)===selected).reduce((a,x)=>a+num(x.real),0);

    const periodTarget=periodRows.filter(x=>String(x.up3).toUpperCase()===String(s.up3).toUpperCase()).reduce((a,x)=>a+num(x.target_hari),0);
    byUp3.push({
      ...s,
      targetCum,
      realCum,
      capCum: targetCum?realCum/targetCum:0,
      targetPeriod:periodTarget,
      realPeriod:periodReal,
      capPeriod:periodTarget?periodReal/periodTarget:0
    });
  });

  const byUnit=new Map();
  byUp3.forEach(r=>{
    const k=String(r.unit_induk||"");
    if(!byUnit.has(k)) byUnit.set(k,{unit_induk:k, targetCum:0, realCum:0, targetPeriod:0, realPeriod:0});
    const x=byUnit.get(k);
    x.targetCum+=r.targetCum;
    x.realCum+=r.realCum;
    x.targetPeriod+=r.targetPeriod;
    x.realPeriod+=r.realPeriod;
  });
  [...byUnit.values()].forEach(x=>{
    x.capCum=x.targetCum?x.realCum/x.targetCum:0;
    x.capPeriod=x.targetPeriod?x.realPeriod/x.targetPeriod:0;
  });

  return {
    start,end,selected,
    byUp3,
    byUnit:[...byUnit.values()].sort((a,b)=>a.unit_induk.localeCompare(b.unit_induk)),
    totals:{
      targetCum:byUp3.reduce((a,x)=>a+x.targetCum,0),
      realCum:byUp3.reduce((a,x)=>a+x.realCum,0),
      targetPeriod:byUp3.reduce((a,x)=>a+x.targetPeriod,0),
      realPeriod:byUp3.reduce((a,x)=>a+x.realPeriod,0)
    }
  };
}

function capClass(v){
  if(v>=1) return "good";
  if(v>=0.9) return "warn";
  return "bad";
}

function render(){
  const data=calculate();
  if(!data) return;

  $("kpiTargetCum").textContent=nfmt(data.totals.targetCum);
  $("kpiRealCum").textContent=nfmt(data.totals.realCum);
  $("kpiCapCum").textContent=pct(data.totals.targetCum?data.totals.realCum/data.totals.targetCum:0);
  $("kpiRealDaily").textContent=nfmt(data.totals.realPeriod);
  $("kpiUp3").textContent=nfmt(data.byUp3.length);

  const unitBody=$("unitTable").querySelector("tbody");
  unitBody.innerHTML=data.byUnit.map(r=>`
    <tr>
      <td class="ui-name">${escapeHtml(r.unit_induk)}</td>
      <td>${nfmt(r.targetCum)}</td>
      <td>${nfmt(r.realCum)}</td>
      <td class="badge ${capClass(r.capCum)}">${pct(r.capCum)}</td>
      <td>${nfmt(r.targetPeriod)}</td>
      <td>${nfmt(r.realPeriod)}</td>
      <td class="badge ${capClass(r.capPeriod)}">${pct(r.capPeriod)}</td>
    </tr>`).join("");

  const up3Body=$("up3Table").querySelector("tbody");
  const sorted=[...data.byUp3].sort((a,b)=>b.capCum-a.capCum || a.up3.localeCompare(b.up3));
  up3Body.innerHTML=sorted.map(r=>`
    <tr>
      <td class="ui-name">${escapeHtml(r.unit_induk)}</td>
      <td class="up3-name">${escapeHtml(r.up3)}</td>
      <td>${nfmt(r.targetCum)}</td>
      <td>${nfmt(r.realCum)}</td>
      <td class="badge ${capClass(r.capCum)}">${pct(r.capCum)}</td>
      <td>${nfmt(r.targetPeriod)}</td>
      <td>${nfmt(r.realPeriod)}</td>
      <td class="badge ${capClass(r.capPeriod)}">${pct(r.capPeriod)}</td>
    </tr>`).join("");

  renderChart(sorted.slice(0,40));
  $("dataNote").textContent =
    `${state.mode==="live"?"Sumber live Google Sheets":"Mode demo menggunakan Summary Historis Jan–Jul 2026"} • Periode tampilan: ${fmtDate(data.start)} s.d. ${fmtDate(data.end)} • Filter jenis: ${data.selected==="ALL"?"TOTAL":data.selected}`;
}

function renderChart(rows){
  const ctx=$("rankingChart");
  if(state.chart) state.chart.destroy();
  state.chart=new Chart(ctx,{
    type:"bar",
    data:{
      labels:rows.map(r=>r.up3),
      datasets:[{
        label:"Capaian Kumulatif",
        data:rows.map(r=>Number((r.capCum*100).toFixed(1))),
        borderWidth:0
      }]
    },
    options:{
      indexAxis:"y",
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>`${c.raw.toFixed(1)}%`}}
      },
      scales:{
        x:{beginAtZero:true, ticks:{callback:v=>v+"%"}, grid:{color:"#eef1f4"}},
        y:{grid:{display:false}}
      }
    }
  });
}

function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

/* Google Visualization CSV loader. */
async function loadSheetCsv(sheetId, sheetName){
  const url=`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok) throw new Error(`Gagal membaca ${sheetName}: HTTP ${res.status}`);
  const text=await res.text();
  return parseCsv(text);
}

function parseCsv(text){
  const rows=[];
  let row=[], cell="", quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(quote){
      if(ch==='"' && nx==='"'){cell+='"';i++;}
      else if(ch==='"'){quote=false;}
      else cell+=ch;
    }else{
      if(ch==='"') quote=true;
      else if(ch===','){row.push(cell);cell="";}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
      else if(ch!=='\r') cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  if(!rows.length) return [];
  const head=rows.shift();
  return rows.filter(r=>r.some(x=>x!=="")).map(r=>{
    const o={}; head.forEach((h,i)=>o[h]=r[i]??""); return o;
  });
}

function normalizeLiveDaily(rows){
  return rows.map(r=>({
    ...r,
    tanggalObj:parseDate(r.tanggal),
    target_hari:num(r.target_hari),
    real_hari:num(r.realisasi_harian),
    target_kum:num(r.target_kumulatif),
    real_kum:num(r.realisasi_kumulatif),
    cap_kum:num(r.capaian_kumulatif)
  })).filter(r=>r.tanggalObj);
}
function normalizeLiveTypes(rows){
  return rows.map(r=>({
    ...r,
    tanggalObj:parseDate(r.tanggal),
    real:num(r.realisasi)
  })).filter(r=>r.tanggalObj);
}

async function connectLive(){
  const id=$("sheetIdInput").value.trim();
  const sheetName=$("sheetNameInput").value.trim()||"02_SUMMARY_HARIAN";
  const typeSheetName=$("typeSheetNameInput").value.trim()||"03_SUMMARY_JENIS";
  if(!id){$("liveHelp").textContent="Spreadsheet ID belum diisi.";return;}
  $("liveHelp").textContent="Membaca Google Sheets...";
  try{
    const [d,t]=await Promise.all([
      loadSheetCsv(id,sheetName),
      loadSheetCsv(id,typeSheetName)
    ]);
    state.daily=normalizeLiveDaily(d);
    state.types=normalizeLiveTypes(t);
    if(!state.daily.length) throw new Error("Summary Harian kosong atau tanggal tidak terbaca.");
    state.mode="live";
    state.sheetId=id;
    state.sheetName=sheetName;
    state.typeSheetName=typeSheetName;
    localStorage.setItem("gm_sheet_id",id);
    localStorage.setItem("gm_sheet_name",sheetName);
    localStorage.setItem("gm_type_sheet_name",typeSheetName);
    $("liveModal").classList.add("hidden");
    updateStatus();
    const all=state.daily.map(r=>r.tanggalObj).sort((a,b)=>a-b);
    $("startDate").value=isoDate(all[0]);
    $("endDate").value=isoDate(all[all.length-1]);
    render();
  }catch(err){
    console.error(err);
    $("liveHelp").textContent="Gagal terhubung: "+err.message+". Pastikan sheet dapat dibaca dari web.";
  }
}

$("refreshBtn").addEventListener("click",render);
$("startDate").addEventListener("change",render);
$("endDate").addEventListener("change",render);
$("typeFilter").addEventListener("change",render);
$("liveBtn").addEventListener("click",()=>{
  $("sheetIdInput").value=state.sheetId;
  $("sheetNameInput").value=state.sheetName;
  $("typeSheetNameInput").value=state.typeSheetName;
  $("liveHelp").textContent="";
  $("liveModal").classList.remove("hidden");
});
$("closeModal").addEventListener("click",()=>$("liveModal").classList.add("hidden"));
$("demoBtn").addEventListener("click",()=>{
  $("liveModal").classList.add("hidden");
  seedFromDemo();
});
$("connectBtn").addEventListener("click",connectLive);

seedFromDemo();
