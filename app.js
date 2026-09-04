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

function localInputDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(d){
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function num(v){
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}

function pct(v){
  return `${(v*100).toFixed(1)}%`;
}

function nfmt(v){
  return Math.round(v).toLocaleString("id-ID");
}

function typeNorm(v){
  return String(v||"").trim().toUpperCase();
}

function seedFromDemo(){
  state.daily=(window.DEMO_DATA?.daily||[]).map(r=>({
    ...r,
    tanggalObj:parseDate(r.tanggal),
    target_hari:num(r.target_hari),
    real_hari:num(r.realisasi_harian),
    target_kum:num(r.target_kumulatif),
    real_kum:num(r.realisasi_kumulatif),
    cap_kum:num(r.capaian_kumulatif)
  }));
  state.types=(window.DEMO_DATA?.types||[]).map(r=>({
    ...r,
    tanggalObj:parseDate(r.tanggal),
    real:num(r.realisasi)
  }));
  state.mode="demo";
  updateStatus();
  setDefaultDates(true);
  render();
}

function updateStatus(){
  $("statusBadge").innerHTML =
    `<span class="status-dot"></span> ${state.mode==="live"?"GOOGLE SHEETS":"DEMO DATA"}`;
  $("footerSource").textContent =
    state.mode==="live" ? "Live • Google Sheets" : "Demo historis Jan–Jul 2026";
}

function setDefaultDates(forceStart=false){
  const all=state.daily.map(r=>r.tanggalObj).filter(Boolean).sort((a,b)=>a-b);
  if(!all.length) return;

  // IMPORTANT: do not use toISOString(), because it can shift the UI date.
  if(forceStart || !$("startDate").value){
    $("startDate").value=localInputDate(all[0]);
  }
  $("endDate").value=localInputDate(all[all.length-1]);

  const last=all[all.length-1];
  $("lastUpdate").textContent =
    `${state.mode==="live"?"Data live":"Data historis"} • s.d. ${fmtDate(last)}`;
}

function getEndSnapshot(rows,endDate){
  return rows
    .filter(r=>r.tanggalObj && r.tanggalObj.getTime()===endDate.getTime())
    .sort((a,b)=>String(a.kode_up3).localeCompare(String(b.kode_up3)));
}

function getSelectedTypeReal(up3,endDate){
  const selected=$("typeFilter").value;
  const f=state.types.filter(r=>
    r.tanggalObj &&
    r.tanggalObj.getTime()===endDate.getTime() &&
    String(r.up3).toUpperCase()===String(up3).toUpperCase()
  );
  if(selected==="ALL") return f.reduce((s,r)=>s+num(r.real),0);
  return f.filter(r=>typeNorm(r.jenis_ganti_meter)===selected)
          .reduce((s,r)=>s+num(r.real),0);
}

function sumSelectedTypePeriod(up3,start,end){
  const selected=$("typeFilter").value;
  const f=state.types.filter(r=>
    r.tanggalObj &&
    r.tanggalObj>=start &&
    r.tanggalObj<=end &&
    String(r.up3).toUpperCase()===String(up3).toUpperCase()
  );
  if(selected==="ALL") return f.reduce((s,r)=>s+num(r.real),0);
  return f.filter(r=>typeNorm(r.jenis_ganti_meter)===selected)
          .reduce((s,r)=>s+num(r.real),0);
}

function calculate(){
  const start=parseDate($("startDate").value);
  const end=parseDate($("endDate").value);
  const selected=$("typeFilter").value;

  if(!start||!end||start>end) return null;

  const periodRows=state.daily.filter(r=>
    r.tanggalObj &&
    r.tanggalObj>=start &&
    r.tanggalObj<=end
  );

  // Cumulative values always come from the end-date snapshot.
  const snapRows=getEndSnapshot(state.daily,end);

  const byUp3=snapRows.map(s=>{
    const targetCum=num(s.target_kum);

    const realCum=selected==="ALL"
      ? num(s.real_kum)
      : sumSelectedTypeUp3Cumulative(s.up3,end);

    const targetPeriod=periodRows
      .filter(x=>String(x.up3).toUpperCase()===String(s.up3).toUpperCase())
      .reduce((a,x)=>a+num(x.target_hari),0);

    const realPeriod=selected==="ALL"
      ? periodRows
          .filter(x=>String(x.up3).toUpperCase()===String(s.up3).toUpperCase())
          .reduce((a,x)=>a+num(x.real_hari),0)
      : sumSelectedTypePeriod(s.up3,start,end);

    return {
      ...s,
      targetCum,
      realCum,
      capCum:targetCum?realCum/targetCum:0,
      targetPeriod,
      realPeriod,
      capPeriod:targetPeriod?realPeriod/targetPeriod:0
    };
  });

  const byUnit=new Map();
  byUp3.forEach(r=>{
    const k=String(r.unit_induk||"");
    if(!byUnit.has(k)){
      byUnit.set(k,{
        unit_induk:k,
        targetCum:0,
        realCum:0,
        targetPeriod:0,
        realPeriod:0
      });
    }
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

/*
 * SUMMER:
 * For a selected type, the cumulative type realization is the
 * sum of type snapshots from the beginning of the available
 * data to the selected end date.
 *
 * This demo data has 3 type rows per UP3/date.
 */
function sumSelectedTypeUp3Cumulative(up3,end){
  const selected=$("typeFilter").value;

  const f=state.types.filter(r=>
    r.tanggalObj &&
    r.tanggalObj<=end &&
    String(r.up3).toUpperCase()===String(up3).toUpperCase()
  );

  if(selected==="ALL") return f.reduce((s,r)=>s+num(r.real),0);

  return f.filter(r=>typeNorm(r.jenis_ganti_meter)===selected)
          .reduce((s,r)=>s+num(r.real),0);
}

function capClass(v){
  if(v>=1) return "good";
  if(v>=0.9) return "warn";
  return "bad";
}

function render(){
  const data=calculate();
  if(!data){
    $("dataNote").textContent="Periksa Periode Awal dan Periode Akhir.";
    return;
  }

  const totalCap=data.totals.targetCum
    ? data.totals.realCum/data.totals.targetCum
    : 0;

  $("kpiTargetCum").textContent=nfmt(data.totals.targetCum);
  $("kpiRealCum").textContent=nfmt(data.totals.realCum);
  $("kpiCapCum").textContent=pct(totalCap);
  $("kpiRealDaily").textContent=nfmt(data.totals.realPeriod);
  $("kpiUp3").textContent=nfmt(data.byUp3.length);

  $("up3Count").textContent=`${data.byUp3.length} UP3`;
  $("chartCount").textContent=`${data.byUp3.length} UP3`;

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
  const sorted=[...data.byUp3].sort((a,b)=>
    b.capCum-a.capCum ||
    a.up3.localeCompare(b.up3)
  );

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

  renderChart(sorted);

  $("dataNote").textContent =
    `${state.mode==="live"?"Sumber live Google Sheets":"Mode demo menggunakan Summary Historis Jan–Jul 2026"} • `+
    `${fmtDate(data.start)} s.d. ${fmtDate(data.end)} • `+
    `Jenis: ${data.selected==="ALL"?"TOTAL":data.selected}`;
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
        backgroundColor:rows.map(r=>{
          if(r.capCum>=1) return "rgba(22,148,94,.82)";
          if(r.capCum>=.9) return "rgba(180,123,18,.80)";
          return "rgba(212,78,78,.80)";
        }),
        borderRadius:6,
        barThickness:14,
        maxBarThickness:15,
        borderWidth:0
      }]
    },
    options:{
      indexAxis:"y",
      responsive:true,
      maintainAspectRatio:false,
      animation:{duration:500},
      layout:{padding:{left:4,right:22,top:8,bottom:8}},
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label:c=>`${c.raw.toFixed(1)}%`
          }
        }
      },
      scales:{
        x:{
          beginAtZero:true,
          suggestedMax:Math.max(120,Math.ceil((Math.max(...rows.map(r=>r.capCum*100))/10))*10+10),
          grid:{color:"#e9eef3"},
          ticks:{
            color:"#6b7a89",
            font:{size:10},
            callback:v=>v+"%"
          }
        },
        y:{
          grid:{display:false},
          ticks:{
            autoSkip:false,
            color:"#53616e",
            padding:7,
            font:{size:10,weight:"600"}
          }
        }
      }
    }
  });
}

/* ---------- CSV / Live Google Sheets ---------- */

async function loadSheetCsv(sheetId,sheetName){
  const url=
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok) throw new Error(`Gagal membaca ${sheetName}: HTTP ${res.status}`);
  const text=await res.text();
  return parseCsv(text);
}

function parseCsv(text){
  const rows=[];
  let row=[],cell="",quote=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(quote){
      if(ch==='"' && nx==='"'){cell+='"';i++;}
      else if(ch==='"') quote=false;
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
    const o={};
    head.forEach((h,i)=>o[h]=r[i]??"");
    return o;
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

  if(!id){
    $("liveHelp").textContent="Spreadsheet ID belum diisi.";
    return;
  }

  $("liveHelp").textContent="Membaca Google Sheets...";

  try{
    const [d,t]=await Promise.all([
      loadSheetCsv(id,sheetName),
      loadSheetCsv(id,typeSheetName)
    ]);

    state.daily=normalizeLiveDaily(d);
    state.types=normalizeLiveTypes(t);

    if(!state.daily.length){
      throw new Error("Summary Harian kosong atau tanggal tidak terbaca.");
    }

    state.mode="live";
    state.sheetId=id;
    state.sheetName=sheetName;
    state.typeSheetName=typeSheetName;

    localStorage.setItem("gm_sheet_id",id);
    localStorage.setItem("gm_sheet_name",sheetName);
    localStorage.setItem("gm_type_sheet_name",typeSheetName);

    $("liveModal").classList.add("hidden");

    updateStatus();
    setDefaultDates(true);
    render();

  }catch(err){
    console.error(err);
    $("liveHelp").textContent=
      "Gagal terhubung: "+err.message+
      ". Pastikan sheet dapat dibaca dari web.";
  }
}

/* ---------- Events ---------- */

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

$("closeModal").addEventListener("click",()=>{
  $("liveModal").classList.add("hidden");
});

$("demoBtn").addEventListener("click",()=>{
  $("liveModal").classList.add("hidden");
  seedFromDemo();
});

$("connectBtn").addEventListener("click",connectLive);

function escapeHtml(v){
  return String(v??"").replace(
    /[&<>"']/g,
    m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[m])
  );
}

seedFromDemo();
