# Dashboard Ganti Meter Harian

Dashboard web sederhana untuk memonitor:
- Target & realisasi kumulatif
- Target & realisasi periode (harian bila periode = 1 hari)
- Capaian Unit Induk
- Capaian UP3
- Ranking capaian kumulatif per UP3
- Filter Periode Awal, Periode Akhir, dan Jenis Ganti Meter

## Struktur

- `index.html` — tampilan
- `styles.css` — desain
- `app.js` — logika dashboard
- `demo-data.js` — data demo Summary Historis Jan–Jul 2026

## Cara menjalankan demo

Buka `index.html` langsung di browser.

## Menghubungkan ke Google Sheets

1. Buka dashboard.
2. Klik **Hubungkan Google Sheets**.
3. Masukkan Spreadsheet ID.
4. Nama sheet default:
   - `02_SUMMARY_HARIAN`
   - `03_SUMMARY_JENIS`
5. Pastikan Google Sheets dapat dibaca dari browser (misalnya dipublikasikan sesuai kebutuhan).

## Deploy GitHub Pages

Upload ke repository GitHub, lalu:
Settings -> Pages -> Deploy from branch -> pilih branch `main` dan folder `/root`.

## Logika dashboard

Target tidak dibagi berdasarkan jenis ganti meter. Jika filter jenis dipilih:
- Realisasi berubah sesuai jenis.
- Target tetap target total UP3.
- Capaian = realisasi terpilih / target total.

Capaian kumulatif menggunakan snapshot pada tanggal akhir.
Realisasi periode menjumlahkan realisasi pada rentang Periode Awal–Akhir.
