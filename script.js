/* ═══════════════════════════════════════════════════════════════
   NIMBUS WEATHER — script.js
   Perfectly matched to index.html + style.css
   ─────────────────────────────────────────────────────────────
   DOM IDs used from index.html:
     Landing  : landing, searchInputLanding, searchBtnLanding,
                recentChipsLanding
     Dashboard: dashboard, searchInputDash, searchBtnDash,
                recentChipsDash, locateBtn
     Hero     : cityName, cityDate, cityTime, temperature,
                weatherDesc, weatherIcon, weatherIconWrap
     Details  : detailsGrid  (cards built by JS)
     Hourly   : hourlyScroll
     Daily    : dailyList
     Charts   : tempChart, humidChart
     AQI      : aqiNumber, aqiLabel, aqiDesc, aqiFill
     Sun      : sunriseTime, sunsetTime, sunDot
     Error    : errorOverlay, errorMsg, errorClose
     Loading  : loadOverlay
     BG       : bgLayer, particleCanvas
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────
// 1 · CONFIGURATION  (replace API_KEY with your OWM key)
// ─────────────────────────────────────────────────────────────
const CFG = {
  API_KEY  : '5ff16e5f5828f1a017dbf7f038c7f947',
  BASE     : 'https://api.openweathermap.org/data/2.5',
  ICON_URL : 'https://openweathermap.org/img/wn/',
  UNITS    : 'metric',
  MAX_REC  : 5,
};

// ─────────────────────────────────────────────────────────────
// 2 · APP STATE
// ─────────────────────────────────────────────────────────────
const S = {
  weather   : null,   // current weather payload
  forecast  : null,   // 5-day/3h forecast payload
  aqi       : null,   // air quality payload
  charts    : { temp: null, humid: null },
  clockTick : null,   // setInterval handle
  recent    : JSON.parse(localStorage.getItem('nimbusRecent') || '[]'),
};

// ─────────────────────────────────────────────────────────────
// 3 · TINY $ HELPERS
// ─────────────────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ─────────────────────────────────────────────────────────────
// 4 · WEATHER-CONDITION → BACKGROUND GRADIENT
// ─────────────────────────────────────────────────────────────
function weatherGradient(id, iconCode) {
  const night = iconCode?.endsWith('n');
  if (night)             return 'linear-gradient(135deg,#020617 0%,#0F172A 55%,#1E1B4B 100%)';
  if (id >= 200 && id <= 232) return 'linear-gradient(135deg,#111827 0%,#1F2937 50%,#312E81 100%)';
  if (id >= 300 && id <= 531) return 'linear-gradient(135deg,#0F172A 0%,#1E3A5F 55%,#1E40AF 100%)';
  if (id >= 600 && id <= 622) return 'linear-gradient(135deg,#BFDBFE 0%,#E0F2FE 55%,#FFFFFF 100%)';
  if (id >= 701 && id <= 781) return 'linear-gradient(135deg,#334155 0%,#64748B 55%,#CBD5E1 100%)';
  if (id === 800)             return 'linear-gradient(135deg,#0B3D2E 0%,#D97706 45%,#FBBF24 100%)';
  if (id >= 801 && id <= 804) return 'linear-gradient(135deg,#1F2937 0%,#374151 55%,#6B7280 100%)';
  return 'linear-gradient(135deg,#050f09 0%,#0B3D2E 45%,#14532D 70%,#000 100%)';
}

// Particle accent colour per weather state
function particleAccent(id, iconCode) {
  const night = iconCode?.endsWith('n');
  if (night)             return '#818cf8';
  if (id >= 200 && id <= 232) return '#818cf8';
  if (id >= 300 && id <= 531) return '#60a5fa';
  if (id >= 600 && id <= 622) return '#93c5fd';
  if (id >= 701 && id <= 781) return '#e2e8f0';
  if (id === 800)             return '#fde68a';
  if (id >= 801 && id <= 804) return '#d1d5db';
  return '#34d399';
}

// ─────────────────────────────────────────────────────────────
// 5 · TEMPERATURE → TEXT COLOUR
// ─────────────────────────────────────────────────────────────
function tempColor(t) {
  if (t < 0)   return '#93C5FD';
  if (t <= 10) return '#60A5FA';
  if (t <= 20) return '#34D399';
  if (t <= 30) return '#FACC15';
  if (t <= 40) return '#FB923C';
  return '#EF4444';
}

// ─────────────────────────────────────────────────────────────
// 6 · AQI METADATA
// ─────────────────────────────────────────────────────────────
function aqiMeta(aqi) {
  return [
    null,
    { label:'Good',      color:'#22C55E', rec:'Air quality is excellent. Great day for outdoor activities.' },
    { label:'Fair',      color:'#84CC16', rec:'Air quality is acceptable. Minor concern for sensitive groups.' },
    { label:'Moderate',  color:'#EAB308', rec:'Sensitive groups should reduce prolonged outdoor exertion.' },
    { label:'Poor',      color:'#F97316', rec:'Everyone may begin to experience health effects outdoors.' },
    { label:'Very Poor', color:'#EF4444', rec:'Health alert — avoid prolonged outdoor exposure.' },
  ][aqi] || { label:'Unknown', color:'#94A3B8', rec:'No AQI data available for this location.' };
}

// ─────────────────────────────────────────────────────────────
// 7 · DATE / TIME HELPERS  (timezone-aware)
// ─────────────────────────────────────────────────────────────
/** Returns a Date object adjusted to the city's UTC offset (seconds). */
function cityDate(tzOffset) {
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + tzOffset * 1000);
}

function fmtDate(tzOffset) {
  return cityDate(tzOffset).toLocaleDateString('en-US', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
}

function fmtTime(tzOffset) {
  return cityDate(tzOffset).toLocaleTimeString('en-US', {
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true
  });
}

function fmtHour(unixSec, tzOffset) {
  const d = new Date((unixSec + tzOffset) * 1000);
  // Use UTC methods because we've already shifted the timestamp
  const h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12} ${ampm}`;
}

function fmtDay(unixSec, tzOffset) {
  return new Date((unixSec + tzOffset) * 1000)
    .toLocaleDateString('en-US', { weekday:'short', timeZone:'UTC' });
}

function fmtSunTime(unixSec, tzOffset) {
  const d = new Date((unixSec + tzOffset) * 1000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ─────────────────────────────────────────────────────────────
// 8 · LIVE CLOCK
// ─────────────────────────────────────────────────────────────
function startClock(tzOffset) {
  if (S.clockTick) clearInterval(S.clockTick);
  const el = $('cityTime');
  const tick = () => { if (el) el.textContent = fmtTime(tzOffset); };
  tick();
  S.clockTick = setInterval(tick, 1000);
}

// ─────────────────────────────────────────────────────────────
// 9 · OWM ICON URL  (2x PNG from openweathermap.org)
// ─────────────────────────────────────────────────────────────
function iconURL(code) {
  return `${CFG.ICON_URL}${code}@2x.png`;
}

// ─────────────────────────────────────────────────────────────
// 10 · ANIMATED TEMPERATURE COUNT-UP
// ─────────────────────────────────────────────────────────────
function animateTemp(target) {
  const el = $('temperature');
  if (!el) return;
  el.style.color = tempColor(target);
  const dur = 1100, t0 = performance.now();
  const step = now => {
    const p = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);              // ease-out cubic
    el.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ─────────────────────────────────────────────────────────────
// 11 · SUN ARC  (animate the dot along the parabola)
// ─────────────────────────────────────────────────────────────
function animateSunArc(sunrise, sunset, tzOffset) {
  const dot  = $('sunDot');
  if (!dot) return;

  const now  = Math.floor((Date.now() + new Date().getTimezoneOffset() * 60000) / 1000) + tzOffset;
  const frac = Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise)));

  // Parametric point on "M10 100 Q100 10 190 100"
  const t  = frac;
  const px = (1-t)*(1-t)*10 + 2*(1-t)*t*100 + t*t*190;
  const py = (1-t)*(1-t)*100 + 2*(1-t)*t*10  + t*t*100;

  dot.setAttribute('cx', px.toFixed(1));
  dot.setAttribute('cy', py.toFixed(1));
}

// ─────────────────────────────────────────────────────────────
// 12 · API HELPERS
// ─────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(res.status === 404 ? 'city_not_found' : 'api_error');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function urlCurrent(query)    { return `${CFG.BASE}/weather?q=${encodeURIComponent(query)}&appid=${CFG.API_KEY}&units=${CFG.UNITS}`; }
function urlCoords(lat, lon)  { return `${CFG.BASE}/weather?lat=${lat}&lon=${lon}&appid=${CFG.API_KEY}&units=${CFG.UNITS}`; }
function urlForecast(lat,lon) { return `${CFG.BASE}/forecast?lat=${lat}&lon=${lon}&appid=${CFG.API_KEY}&units=${CFG.UNITS}`; }
function urlAQI(lat, lon)     { return `${CFG.BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${CFG.API_KEY}`; }

// ─────────────────────────────────────────────────────────────
// 13 · UV INDEX  (estimated — free tier has no One-Call)
// ─────────────────────────────────────────────────────────────
function estimateUV(weather) {
  const clouds = weather?.clouds?.all ?? 50;
  const icon   = weather?.weather?.[0]?.icon ?? '01d';
  if (icon.endsWith('n')) return 0;
  const h = new Date().getHours();
  if (h < 6 || h > 19) return 0;
  const peak = (h >= 10 && h <= 14) ? 10 : (h >= 8 && h <= 16) ? 7 : 3;
  return Math.max(0, Math.round(peak * (1 - clouds / 150)));
}

// ─────────────────────────────────────────────────────────────
// 14 · BACKGROUND & PARTICLES
// ─────────────────────────────────────────────────────────────
function applyBackground(weatherId, iconCode) {
  const bg = $('bgLayer');
  if (bg) bg.style.background = weatherGradient(weatherId, iconCode);
  P.setColor(particleAccent(weatherId, iconCode));
}

// ─────────────────────────────────────────────────────────────
// 15 · PARTICLE SYSTEM  (canvas, #particleCanvas)
// ─────────────────────────────────────────────────────────────
const P = (() => {
  let canvas, ctx, W, H, pts = [], color = '#34d399', raf;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function make() {
    pts = Array.from({ length: 70 }, () => ({
      x  : Math.random() * W,
      y  : Math.random() * H,
      r  : Math.random() * 1.8 + 0.4,
      dx : (Math.random() - 0.5) * 0.35,
      dy : (Math.random() - 0.5) * 0.35,
      a  : Math.random() * 0.45 + 0.08,
    }));
  }

  function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color.replace(/[^#\w]/g, '') || '#34d399', p.a);
      ctx.fill();
      p.x = (p.x + p.dx + W) % W;
      p.y = (p.y + p.dy + H) % H;
    });
    raf = requestAnimationFrame(draw);
  }

  function init() {
    canvas = $('particleCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    make();
    draw();
    window.addEventListener('resize', () => { resize(); make(); });
  }

  return {
    init,
    setColor(c) {
      // Ensure valid 6-digit hex
      color = /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#34d399';
    },
  };
})();

// ─────────────────────────────────────────────────────────────
// 16 · SKELETON CARDS  (shown while loading)
// ─────────────────────────────────────────────────────────────
function showSkeletons() {
  const grid = $('detailsGrid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 7 }, () => `
    <div class="skeleton-card">
      <div class="sk-line short skeleton"></div>
      <div class="sk-line tall  skeleton"></div>
      <div class="sk-line short skeleton" style="width:55%"></div>
    </div>`).join('');
}

function clearSkeletons() {
  // Cards are replaced by renderDetailCards, so nothing extra needed
}

// ─────────────────────────────────────────────────────────────
// 17 · RENDER — HERO SECTION
// ─────────────────────────────────────────────────────────────
function renderHero(w) {
  const tz   = w.timezone;
  const ico  = w.weather[0].icon;
  const desc = w.weather[0].description;

  // City / country
  $('cityName').textContent = `${w.name}, ${w.sys.country}`;

  // Date
  $('cityDate').textContent = fmtDate(tz);

  // Live clock
  startClock(tz);

  // Icon — uses OWM PNG
  const img = $('weatherIcon');
  if (img) {
    img.src = iconURL(ico);
    img.alt = desc;
  }

  // Description
  $('weatherDesc').textContent = desc.charAt(0).toUpperCase() + desc.slice(1);

  // Temperature (count-up)
  animateTemp(Math.round(w.main.temp));

  // Background
  applyBackground(w.weather[0].id, ico);
}

// ─────────────────────────────────────────────────────────────
// 18 · RENDER — DETAIL CARDS  (builds HTML into #detailsGrid)
// ─────────────────────────────────────────────────────────────
function renderDetailCards(w, uv) {
  const m   = w.main;
  const vis = ((w.visibility ?? 10000) / 1000).toFixed(1);
  const wnd = Math.round((w.wind?.speed ?? 0) * 3.6);
  const fl  = Math.round(m.feels_like);
  const aqiData = S.aqi?.list?.[0]?.main?.aqi;
  const aqiI    = aqiData ? aqiMeta(aqiData) : null;

  const cards = [
    {
      icon: svgDrop,
      label: 'Humidity',
      value: `${m.humidity}%`,
      sub: humidDesc(m.humidity),
    },
    {
      icon: svgWind,
      label: 'Wind Speed',
      value: `${wnd} km/h`,
      sub: beaufort(wnd),
    },
    {
      icon: svgEye,
      label: 'Visibility',
      value: `${vis} km`,
      sub: visDesc(parseFloat(vis)),
    },
    {
      icon: svgGauge,
      label: 'Pressure',
      value: `${m.pressure}`,
      sub: 'hPa',
    },
    {
      icon: svgThermo,
      label: 'Feels Like',
      value: `${fl}°C`,
      sub: feelsDesc(fl, Math.round(m.temp)),
      valueColor: tempColor(fl),
    },
    {
      icon: svgSun,
      label: 'UV Index',
      value: `${uv}`,
      sub: uvDesc(uv),
    },
    {
      icon: svgLeaf,
      label: 'Air Quality',
      value: aqiData ? `AQI ${aqiData}` : 'N/A',
      sub: aqiI ? aqiI.label : '—',
      valueColor: aqiI ? aqiI.color : undefined,
    },
  ];

  $('detailsGrid').innerHTML = cards.map(c => `
    <div class="detail-card">
      <div class="detail-label">
        <span class="detail-icon">${c.icon}</span>
        ${c.label}
      </div>
      <div class="detail-value"${c.valueColor ? ` style="color:${c.valueColor}"` : ''}>${c.value}</div>
      <div class="detail-sub">${c.sub}</div>
    </div>`).join('');
}

// ── Helper descriptions ──────────────────────────────────────
function humidDesc(h) {
  if (h < 30) return 'Very dry';
  if (h < 50) return 'Comfortable';
  if (h < 70) return 'Moderate';
  return 'High humidity';
}
function beaufort(kmh) {
  if (kmh < 1)  return 'Calm';
  if (kmh < 12) return 'Light breeze';
  if (kmh < 29) return 'Gentle breeze';
  if (kmh < 50) return 'Moderate wind';
  if (kmh < 75) return 'Fresh wind';
  return 'Strong wind';
}
function visDesc(km) {
  if (km >= 10) return 'Excellent';
  if (km >= 5)  return 'Good';
  if (km >= 2)  return 'Moderate';
  return 'Poor visibility';
}
function feelsDesc(fl, actual) {
  const d = fl - actual;
  if (d > 3)  return 'Feels warmer';
  if (d < -3) return 'Feels cooler';
  return 'Close to actual';
}
function uvDesc(uv) {
  if (uv === 0) return 'Night / No UV';
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Moderate';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}

// ─────────────────────────────────────────────────────────────
// 19 · INLINE SVG ICONS for detail cards
// ─────────────────────────────────────────────────────────────
const SZ = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const svgDrop  = `<svg ${SZ}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
const svgWind  = `<svg ${SZ}><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>`;
const svgEye   = `<svg ${SZ}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const svgGauge = `<svg ${SZ}><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>`;
const svgThermo= `<svg ${SZ}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`;
const svgSun   = `<svg ${SZ}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const svgLeaf  = `<svg ${SZ}><path d="M2 22c0-8 8.5-14 15-14 0 6.5-6 15-15 15z"/><path d="M22 6c0 0-2 5-8 8"/></svg>`;

// ─────────────────────────────────────────────────────────────
// 20 · RENDER — AQI SECTION  (#aqiNumber, #aqiLabel, #aqiDesc, #aqiFill)
// ─────────────────────────────────────────────────────────────
function renderAQI() {
  const raw  = S.aqi?.list?.[0]?.main?.aqi;
  const meta = raw ? aqiMeta(raw) : null;

  $('aqiNumber').textContent = raw ?? '—';
  $('aqiLabel').textContent  = meta?.label ?? 'Unavailable';
  $('aqiDesc').textContent   = meta?.rec   ?? 'AQI data could not be fetched for this city.';

  if ($('aqiLabel') && meta) $('aqiLabel').style.color = meta.color;
  if ($('aqiNumber') && meta) $('aqiNumber').style.color = meta.color;

  // Progress bar  (aqi 1-5 → 0–100%)
  const fill = $('aqiFill');
  if (fill) {
    setTimeout(() => {
      fill.style.width = raw ? `${(raw / 5) * 100}%` : '0%';
    }, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// 21 · RENDER — SUNRISE / SUNSET
// ─────────────────────────────────────────────────────────────
function renderSun(w) {
  $('sunriseTime').textContent = fmtSunTime(w.sys.sunrise, w.timezone);
  $('sunsetTime').textContent  = fmtSunTime(w.sys.sunset,  w.timezone);
  animateSunArc(w.sys.sunrise, w.sys.sunset, w.timezone);
}

// ─────────────────────────────────────────────────────────────
// 22 · RENDER — HOURLY FORECAST  (#hourlyScroll)
// ─────────────────────────────────────────────────────────────
function renderHourly(forecast, tz) {
  const container = $('hourlyScroll');
  if (!container) return;

  const slots = forecast.list.slice(0, 8);
  container.innerHTML = slots.map((s, i) => {
    const t    = Math.round(s.main.temp);
    const time = fmtHour(s.dt, tz);
    return `
      <div class="hourly-item${i === 0 ? ' current-hour' : ''}">
        <span class="hourly-time">${i === 0 ? 'Now' : time}</span>
        <div class="hourly-icon">
          <img src="${iconURL(s.weather[0].icon)}" alt="${s.weather[0].description}" />
        </div>
        <span class="hourly-temp" style="color:${tempColor(t)}">${t}°</span>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// 23 · RENDER — 7-DAY FORECAST  (#dailyList)
// ─────────────────────────────────────────────────────────────
function renderDaily(forecast, tz) {
  const container = $('dailyList');
  if (!container) return;

  // Group 3-hourly slots by day label
  const days = {};
  forecast.list.forEach(s => {
    const key = fmtDay(s.dt, tz);
    if (!days[key]) days[key] = { hi: -Infinity, lo: Infinity, icons: [], descs: [] };
    const d = days[key];
    d.hi    = Math.max(d.hi, s.main.temp_max);
    d.lo    = Math.min(d.lo, s.main.temp_min);
    d.icons.push(s.weather[0].icon);
    d.descs.push(s.weather[0].description);
  });

  container.innerHTML = Object.entries(days).slice(0, 7).map(([day, d]) => {
    const icon = statistical_mode(d.icons);
    const desc = statistical_mode(d.descs);
    const hi   = Math.round(d.hi);
    const lo   = Math.round(d.lo);
    return `
      <div class="daily-item">
        <span class="daily-day">${day}</span>
        <div class="daily-icon">
          <img src="${iconURL(icon)}" alt="${desc}" />
        </div>
        <span class="daily-desc">${desc}</span>
        <div class="daily-temps">
          <span class="daily-hi" style="color:${tempColor(hi)}">${hi}°</span>
          <span class="daily-lo">${lo}°</span>
        </div>
      </div>`;
  }).join('');
}

function statistical_mode(arr) {
  return arr.sort((a, b) =>
    arr.filter(v => v === b).length - arr.filter(v => v === a).length
  )[0];
}

// ─────────────────────────────────────────────────────────────
// 24 · RENDER — CHART.JS CHARTS  (#tempChart, #humidChart)
// ─────────────────────────────────────────────────────────────
function renderCharts(forecast, tz) {
  const slots  = forecast.list.slice(0, 8);
  const labels = slots.map(s => fmtHour(s.dt, tz));
  const temps  = slots.map(s => Math.round(s.main.temp));
  const humids = slots.map(s => s.main.humidity);

  // Shared options
  const shared = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(5,15,9,0.85)',
        titleColor: '#F0FDF4',
        bodyColor: '#F0FDF4',
        padding: 10,
        cornerRadius: 10,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid : { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: 'rgba(240,253,244,0.55)', font: { size: 11, family: 'Outfit, Inter, sans-serif' } },
      },
      y: {
        grid : { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: 'rgba(240,253,244,0.55)', font: { size: 11, family: 'Outfit, Inter, sans-serif' } },
      },
    },
  };

  // ── Temperature line chart ──
  const tCtx = $('tempChart');
  if (tCtx) {
    if (S.charts.temp) S.charts.temp.destroy();
    S.charts.temp = new Chart(tCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data            : temps,
          borderColor     : '#FB923C',
          backgroundColor : 'rgba(251,146,60,0.12)',
          borderWidth     : 2.5,
          pointBackgroundColor: temps.map(t => tempColor(t)),
          pointRadius     : 5,
          pointHoverRadius: 7,
          tension         : 0.4,
          fill            : true,
        }],
      },
      options: {
        ...shared,
        plugins: {
          ...shared.plugins,
          tooltip: {
            ...shared.plugins.tooltip,
            callbacks: { label: ctx => `${ctx.raw}°C` },
          },
        },
        scales: {
          ...shared.scales,
          y: {
            ...shared.scales.y,
            ticks: {
              ...shared.scales.y.ticks,
              callback: v => `${v}°`,
            },
          },
        },
      },
    });
  }

  // ── Humidity bar chart ──
  const hCtx = $('humidChart');
  if (hCtx) {
    if (S.charts.humid) S.charts.humid.destroy();
    S.charts.humid = new Chart(hCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data           : humids,
          backgroundColor: 'rgba(96,165,250,0.45)',
          borderColor    : '#60A5FA',
          borderWidth    : 2,
          borderRadius   : 7,
          borderSkipped  : false,
        }],
      },
      options: {
        ...shared,
        plugins: {
          ...shared.plugins,
          tooltip: {
            ...shared.plugins.tooltip,
            callbacks: { label: ctx => `${ctx.raw}%` },
          },
        },
        scales: {
          ...shared.scales,
          y: {
            ...shared.scales.y,
            min: 0, max: 100,
            ticks: {
              ...shared.scales.y.ticks,
              callback: v => `${v}%`,
            },
          },
        },
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 25 · RECENT SEARCHES  (localStorage → chips in both bars)
// ─────────────────────────────────────────────────────────────
function saveRecent(city) {
  S.recent = [city, ...S.recent.filter(c => c.toLowerCase() !== city.toLowerCase())]
               .slice(0, CFG.MAX_REC);
  localStorage.setItem('nimbusRecent', JSON.stringify(S.recent));
  renderChips();
}

function renderChips() {
  ['recentChipsLanding', 'recentChipsDash'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = S.recent.map(city => `
      <button class="chip" data-city="${city}">${city}</button>`).join('');
    el.querySelectorAll('.chip').forEach(chip =>
      chip.addEventListener('click', () => doSearch(chip.dataset.city))
    );
  });
}

// ─────────────────────────────────────────────────────────────
// 26 · DASHBOARD REVEAL  (landing fades out, dashboard fades in)
// ─────────────────────────────────────────────────────────────
function revealDashboard() {
  const landing   = $('landing');
  const dashboard = $('dashboard');

  // Hide landing (CSS transition: opacity + translateY)
  if (landing && !landing.classList.contains('hidden')) {
    landing.classList.add('hidden');
  }

  // Show dashboard
  if (dashboard) {
    dashboard.classList.remove('hidden');
    // Force reflow so transition triggers
    dashboard.getBoundingClientRect();
    dashboard.style.opacity = '1';
  }
}

// ─────────────────────────────────────────────────────────────
// 27 · LOADING STATE
// ─────────────────────────────────────────────────────────────
function setLoading(on) {
  const ov = $('loadOverlay');
  if (!ov) return;
  if (on) {
    ov.classList.remove('hidden');
  } else {
    // Slight delay so the overlay doesn't flash away instantly
    setTimeout(() => ov.classList.add('hidden'), 300);
  }
  // Disable all search buttons while loading
  $$('.search-btn').forEach(b => { b.disabled = on; });
}

// ─────────────────────────────────────────────────────────────
// 28 · ERROR HANDLING
// ─────────────────────────────────────────────────────────────
function showError(msg) {
  const overlay = $('errorOverlay');
  const msgEl   = $('errorMsg');
  if (msgEl) msgEl.textContent = msg || 'Please check the spelling and try again.';
  if (overlay) overlay.classList.remove('hidden');
}

function hideError() {
  $('errorOverlay')?.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// 29 · CORE SEARCH ORCHESTRATOR
// ─────────────────────────────────────────────────────────────
async function doSearch(query) {
  const city = (query ?? readSearchInputs()).trim();
  if (!city) return;

  hideError();
  setLoading(true);
  showSkeletons();

  try {
    // ── Step 1: current weather
    const weather = await apiFetch(urlCurrent(city));
    S.weather = weather;

    const { lat, lon } = weather.coord;

    // ── Step 2: parallel — forecast + AQI
    const [forecast, aqi] = await Promise.allSettled([
      apiFetch(urlForecast(lat, lon)),
      apiFetch(urlAQI(lat, lon)),
    ]);

    S.forecast = forecast.status === 'fulfilled' ? forecast.value : null;
    S.aqi      = aqi.status      === 'fulfilled' ? aqi.value      : null;

    const uv = estimateUV(weather);

    // ── Step 3: render
    renderHero(weather);
    renderDetailCards(weather, uv);
    renderAQI();
    renderSun(weather);
    if (S.forecast) {
      renderHourly(S.forecast, weather.timezone);
      renderDaily (S.forecast, weather.timezone);
      renderCharts(S.forecast, weather.timezone);
    }

    // ── Step 4: UI transitions
    revealDashboard();
    saveRecent(weather.name);

    // Sync both search inputs to canonical city name
    syncSearchInputs(weather.name);

  } catch (err) {
    if (err.message === 'city_not_found') {
      showError(`"${city}" was not found. Check the spelling and try again.`);
    } else {
      showError('Could not fetch weather data. Check your API key or try again later.');
    }
    console.error('[Nimbus]', err);
  } finally {
    setLoading(false);
  }
}

// Read whichever search input the user typed in
function readSearchInputs() {
  return ($('searchInputDash')?.value || $('searchInputLanding')?.value || '').trim();
}

// Keep both inputs in sync with the resolved city name
function syncSearchInputs(name) {
  const l = $('searchInputLanding');
  const d = $('searchInputDash');
  if (l) l.value = name;
  if (d) d.value = name;
}

// ─────────────────────────────────────────────────────────────
// 30 · GEOLOCATION  (auto-detect on first load)
// ─────────────────────────────────────────────────────────────
async function autoLocate() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async pos => {
      setLoading(true);
      showSkeletons();
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const weather = await apiFetch(urlCoords(lat, lon));
        S.weather = weather;

        const [forecast, aqi] = await Promise.allSettled([
          apiFetch(urlForecast(lat, lon)),
          apiFetch(urlAQI(lat, lon)),
        ]);
        S.forecast = forecast.status === 'fulfilled' ? forecast.value : null;
        S.aqi      = aqi.status      === 'fulfilled' ? aqi.value      : null;

        const uv = estimateUV(weather);

        renderHero(weather);
        renderDetailCards(weather, uv);
        renderAQI();
        renderSun(weather);
        if (S.forecast) {
          renderHourly(S.forecast, weather.timezone);
          renderDaily (S.forecast, weather.timezone);
          renderCharts(S.forecast, weather.timezone);
        }

        revealDashboard();
        saveRecent(weather.name);
        syncSearchInputs(weather.name);
      } catch (e) {
        console.warn('[Nimbus] Auto-locate weather fetch failed:', e.message);
      } finally {
        setLoading(false);
      }
    },
    err => console.warn('[Nimbus] Geolocation denied:', err.message),
    { timeout: 8000 }
  );
}

// ─────────────────────────────────────────────────────────────
// 31 · EVENT LISTENERS
// ─────────────────────────────────────────────────────────────
function attachListeners() {

  // ── Landing search ──
  $('searchBtnLanding')?.addEventListener('click', () => doSearch($('searchInputLanding').value));
  $('searchInputLanding')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(e.target.value); });

  // ── Dashboard search ──
  $('searchBtnDash')?.addEventListener('click', () => doSearch($('searchInputDash').value));
  $('searchInputDash')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(e.target.value); });

  // ── Locate button (topbar) ──
  $('locateBtn')?.addEventListener('click', autoLocate);

  // ── Error overlay close ──
  $('errorClose')?.addEventListener('click', hideError);

  // ── Close error by clicking backdrop ──
  $('errorOverlay')?.addEventListener('click', e => {
    if (e.target === $('errorOverlay')) hideError();
  });
}

// ─────────────────────────────────────────────────────────────
// 32 · INIT
// ─────────────────────────────────────────────────────────────
function init() {
  P.init();           // particle canvas
  renderChips();      // recent search chips
  attachListeners();  // all events
  autoLocate();       // try geolocation on first load

  console.log('%c🌿 Nimbus Weather initialised', 'color:#34D399;font-weight:700');
}

// Boot after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
