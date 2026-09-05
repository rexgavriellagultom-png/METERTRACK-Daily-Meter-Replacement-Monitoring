const $ = (id) => document.getElementById(id);

const state = {
  mode: 'HISTORIS',
  file: null,
  busy: false,
  jobId: null,
  chunkCount: 0,
};

const DEFAULT_SPREADSHEET_ID = '1fSlfqfQLC9B5QN7tg0VhqqUVQYqL5xJT3QvUbpVG0Qg';

function formatNumber(n){
  return Number(n || 0).toLocaleString('id-ID');
}

function formatBytes(bytes){
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length-1){ v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function setConnection(ok, text){
  const el = $('connectionStatus');
  el.classList.toggle('ok', !!ok);
  el.innerHTML = `<span class="dot"></span> ${text}`;
}

function showFile(file){
  state.file = file || null;
  $('fileInput').value = '';
  $('selectedFile').hidden = !file;
  if (file){
    $('fileName').textContent = file.name;
    $('fileSize').textContent = formatBytes(file.size);
  }
}

function setBusy(busy){
  state.busy = busy;
  $('uploadBtn').disabled = busy;
  $('resetBtn').disabled = busy;
  $('testBtn').disabled = busy;
  $('fileInput').disabled = busy;
  document.querySelectorAll('.mode').forEach(b => b.disabled = busy);
}

function showProgress(show=true){
  $('progressCard').hidden = !show;
}

function setProgress(data){
  const total = Number(data.totalRows || 0);
  const processed = Number(data.processedRows || 0);
  const pct = Math.max(0, Math.min(100, Number(data.progress != null ? data.progress : (total ? processed/total*100 : 0))));
  $('progressBar').style.width = `${pct}%`;
  $('progressPercent').textContent = `${pct.toFixed(1)}%`;
  $('processedRows').textContent = formatNumber(processed);
  $('totalRows').textContent = formatNumber(total);
  $('realization').textContent = formatNumber(data.realization || 0);
  $('jobStatus').textContent = data.status || 'PROCESSING';
  $('progressTitle').textContent = data.status === 'COMPLETE' ? 'Proses selesai' : data.status === 'FAILED' ? 'Proses gagal' : `Memproses JOB`;
  $('progressText').textContent = data.message || `Chunk ${state.chunkCount} sedang diproses...`;
}

function showResult(ok, title, message){
  const card = $('resultCard');
  card.hidden = false;
  card.classList.toggle('error', !ok);
  $('resultIcon').textContent = ok ? '✓' : '!';
  $('resultTitle').textContent = title;
  $('resultMessage').textContent = message || '';
}

function resetUI(){
  if(state.busy) return;
  state.file = null;
  state.jobId = null;
  state.chunkCount = 0;
  $('fileInput').value = '';
  $('selectedFile').hidden = true;
  $('progressCard').hidden = true;
  $('resultCard').hidden = true;
  setProgress({totalRows:0,processedRows:0,progress:0,realization:0,status:'READY',message:'Menunggu upload...'});
}

function getScriptUrl(){
  return $('scriptUrl').value.trim();
}

function getSpreadsheetId(){
  return $('spreadsheetId').value.trim() || DEFAULT_SPREADSHEET_ID;
}

function validUrl(){
  const url = getScriptUrl();
  if(!url || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url)){
    throw new Error('Masukkan URL Web App Apps Script V2 yang berakhiran /exec.');
  }
  return url;
}

function submitPost(params){
  const url = validUrl();
  return new Promise((resolve, reject) => {
    const frame = $('postFrame');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.target = 'postFrame';
    form.style.display = 'none';

    Object.entries(params).forEach(([k,v]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = v == null ? '' : String(v);
      form.appendChild(input);
    });

    const handler = (ev) => {
      if(!ev.data || ev.data.type !== 'GANTI_METER_V2') return;
      window.removeEventListener('message', handler);
      form.remove();
      if(ev.data.ok) resolve(ev.data.data || {});
      else reject(new Error((ev.data.data && ev.data.data.message) || 'Endpoint mengembalikan error.'));
    };

    window.addEventListener('message', handler);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
      window.removeEventListener('message', handler);
      form.remove();
      reject(new Error('Tidak ada respons dari Apps Script. Pastikan Web App sudah di-deploy dan aksesnya "Anyone".'));
    }, 120000);
  });
}

async function testEndpoint(){
  try{
    const url = validUrl();
    setConnection(false, 'Menghubungkan...');
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}action=status&jobId=none&callback=testCallback_${Date.now()}`, {mode:'cors', cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    setConnection(true, 'Endpoint aktif');
  }catch(err){
    setConnection(false, 'Belum terhubung');
    showResult(false, 'Tes endpoint gagal', err.message);
  }
}

async function startUpload(){
  if(state.busy) return;
  try{
    if(!state.file) throw new Error('Pilih file terlebih dahulu.');
    const url = validUrl();
    const reader = new FileReader();

    setBusy(true);
    showResult(true, 'Upload dimulai', 'File sedang dikirim ke JOB processor...');
    showProgress(true);
    $('progressTitle').textContent = 'Membuat JOB...';
    $('progressText').textContent = 'Membaca file di browser...';
    $('progressBar').style.width = '0%';
    $('progressPercent').textContent = '0%';

    const base64 = await new Promise((resolve,reject)=>{
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsDataURL(state.file);
    });

    const result = await submitPost({
      action: 'start',
      spreadsheetId: getSpreadsheetId(),
      mode: state.mode,
      unitInduk: state.mode === 'HISTORIS' ? 'SEMUA' : $('unitInduk').value,
      startDate: $('startDate').value,
      endDate: $('endDate').value,
      fileName: state.file.name,
      fileData: base64
    });

    state.jobId = result.jobId;
    state.chunkCount = 0;
    setConnection(true, 'JOB aktif');
    setProgress(result);
    showResult(true, 'JOB berhasil dibuat', `Total data: ${formatNumber(result.totalRows)} baris.`);
    await processNextChunk();
  }catch(err){
    setBusy(false);
    showResult(false, 'Upload gagal', err.message);
    setConnection(false, 'Terjadi error');
  }
}

async function processNextChunk(){
  if(!state.jobId) throw new Error('jobId tidak tersedia.');
  state.chunkCount++;
  $('progressText').textContent = `Memproses chunk ${state.chunkCount}...`;

  try{
    const result = await submitPost({
      action: 'process',
      jobId: state.jobId
    });

    setProgress(result);

    if(result.status === 'COMPLETE'){
      setBusy(false);
      showResult(true, 'Upload & proses selesai', `Baris: ${formatNumber(result.processedRows)} • Realisasi: ${formatNumber(result.realization)} • Metode: ${result.mode === 'HISTORIS' ? 'SUM(jumlah)' : 'COUNT_ROW'}`);
      setConnection(true, 'Selesai');
      return;
    }

    if(result.status === 'FAILED'){
      setBusy(false);
      showResult(false, 'Proses gagal', result.error || result.message || 'Tidak ada detail error.');
      setConnection(false, 'JOB gagal');
      return;
    }

    setTimeout(processNextChunk, 100);
  }catch(err){
    setBusy(false);
    showResult(false, 'Pemrosesan berhenti', err.message);
    setConnection(false, 'Tidak ada respons');
  }
}

document.querySelectorAll('.mode').forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b === btn));
    if(state.mode === 'HISTORIS'){
      $('unitInduk').value = 'SEMUA';
      $('modeHelp').innerHTML = '<b>Historis:</b> satu file dapat berisi seluruh UID dan periode panjang (Jan–Jul, Agustus, dan seterusnya). Realisasi dihitung dari <b>SUM(jumlah)</b>.';
    }else{
      $('modeHelp').innerHTML = '<b>Harian:</b> satu file digunakan untuk satu tanggal/periode kerja. Setiap baris transaksi dihitung sebagai <b>1 realisasi</b>.';
    }
  });
});

$('fileInput').addEventListener('change', e => showFile(e.target.files[0] || null));
$('removeFile').addEventListener('click', () => showFile(null));
$('resetBtn').addEventListener('click', resetUI);
$('testBtn').addEventListener('click', testEndpoint);
$('uploadBtn').addEventListener('click', startUpload);

$('dropzone').addEventListener('click', () => $('fileInput').click());
$('dropzone').addEventListener('dragover', e => { e.preventDefault(); $('dropzone').classList.add('drag'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop', e => {
  e.preventDefault();
  $('dropzone').classList.remove('drag');
  showFile(e.dataTransfer.files[0] || null);
});

$('scriptUrl').value = localStorage.getItem('gm_v2_script_url') || '';
$('scriptUrl').addEventListener('change', e => localStorage.setItem('gm_v2_script_url', e.target.value.trim()));
setProgress({totalRows:0,processedRows:0,progress:0,realization:0,status:'READY',message:'Menunggu upload...'});
