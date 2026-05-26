const state = {
  trips: [],
  selectedId: null,
  map: null,
  mapReady: false,
  markers: new Map(),
};

const mapStage = document.querySelector("#mapStage");
const googleMapElement = document.querySelector("#googleMap");
const tripCount = document.querySelector("#tripCount");
const inspector = document.querySelector("#inspector");
const timelineInner = document.querySelector("#timelineInner");
const timelineTrack = document.querySelector("#timelineTrack");
const drawer = document.querySelector("#drawer");
const form = document.querySelector("#tripForm");
const formStatus = document.querySelector("#formStatus");

const longitudeToX = (longitude) => ((Number(longitude) + 180) / 360) * 100;
const latitudeToY = (latitude) => ((90 - Number(latitude)) / 180) * 100;

const mapStyles = [
  { elementType: "geometry", stylers: [{ color: "#101114" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d7d7d7" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#101114" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#34363a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#15171a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#24272c" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050608" }] },
];

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return String(tags || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function markerIcon(trip, active = false) {
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: trip.status === "future" ? "#58a6ff" : "#d8b35a",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 0.92,
    strokeWeight: active ? 3 : 2,
    scale: active ? 10 : 7,
  };
}

function updateMarkerStates() {
  if (!state.mapReady) return;
  state.trips.forEach((trip) => {
    const marker = state.markers.get(Number(trip.id));
    if (!marker) return;
    marker.setIcon(markerIcon(trip, Number(trip.id) === state.selectedId));
  });
}

function selectTrip(id) {
  state.selectedId = id;
  const trip = state.trips.find((item) => item.id === id);
  document.querySelectorAll(".pin").forEach((pin) => {
    pin.classList.toggle("active", Number(pin.dataset.id) === id);
  });

  if (!trip) return;

  updateMarkerStates();
  if (state.mapReady) {
    state.map.panTo({ lat: Number(trip.latitude), lng: Number(trip.longitude) });
  }

  inspector.classList.add("visible");
  inspector.innerHTML = `
    <h2>${trip.title}</h2>
    <p>${trip.location} · ${formatDate(trip.trip_date)}</p>
    <p>${trip.diary || "尚未新增旅行筆記。"}</p>
    <div class="tag-row">${normalizeTags(trip.tags).map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
  `;
}

function renderPins() {
  mapStage.querySelectorAll(".pin").forEach((pin) => pin.remove());

  if (state.mapReady) {
    state.markers.forEach((marker) => marker.setMap(null));
    state.markers.clear();

    const bounds = new window.google.maps.LatLngBounds();

    state.trips.forEach((trip) => {
      const position = { lat: Number(trip.latitude), lng: Number(trip.longitude) };
      const marker = new window.google.maps.Marker({
        map: state.map,
        position,
        title: trip.title,
        icon: markerIcon(trip, Number(trip.id) === state.selectedId),
      });

      marker.addListener("click", () => selectTrip(trip.id));
      state.markers.set(Number(trip.id), marker);
      bounds.extend(position);
    });

    if (state.trips.length === 1) {
      state.map.setCenter(bounds.getCenter());
      state.map.setZoom(6);
    } else if (state.trips.length > 1) {
      state.map.fitBounds(bounds, 92);
    }

    return;
  }

  state.trips.forEach((trip) => {
    const pin = document.createElement("button");
    pin.className = "pin";
    pin.type = "button";
    pin.dataset.id = trip.id;
    pin.dataset.status = trip.status;
    pin.style.left = `${longitudeToX(trip.longitude)}%`;
    pin.style.top = `${latitudeToY(trip.latitude)}%`;
    pin.setAttribute("aria-label", trip.title);
    pin.addEventListener("click", () => selectTrip(trip.id));
    mapStage.appendChild(pin);
  });
}

function renderTimeline() {
  timelineInner.querySelectorAll(".timeline-item").forEach((item) => item.remove());

  const sortedTrips = [...state.trips].sort((a, b) => new Date(a.trip_date) - new Date(b.trip_date));
  const today = new Date();
  const dates = sortedTrips.map((trip) => new Date(trip.trip_date).getTime());
  const min = Math.min(...dates, today.getTime());
  const max = Math.max(...dates, today.getTime());
  const range = Math.max(max - min, 1);

  sortedTrips.forEach((trip) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    const position = ((new Date(trip.trip_date).getTime() - min) / range) * 86 + 7;
    item.style.left = `${position}%`;
    item.innerHTML = `
      <button type="button">
        <strong>${trip.title}</strong>
        <span>${formatDate(trip.trip_date)}</span>
      </button>
    `;
    item.querySelector("button").addEventListener("click", () => selectTrip(trip.id));
    timelineInner.appendChild(item);
  });
}

function render() {
  tripCount.textContent = `${state.trips.length} 趟旅程`;
  renderPins();
  renderTimeline();

  if (state.trips.length > 0 && !state.selectedId) {
    selectTrip(state.trips[0].id);
  }
}

async function loadTrips() {
  tripCount.textContent = "同步中";
  const response = await fetch("/api/trips");
  if (!response.ok) throw new Error("無法載入旅程資料");
  state.trips = await response.json();
  render();
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const callbackName = "__travelOSGoogleMapsReady";
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&language=zh-TW&region=TW&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("無法載入 Google 地圖"));
    document.head.appendChild(script);
  });
}

async function initializeMap() {
  const response = await fetch("/api/config/maps");
  if (!response.ok) throw new Error("無法載入地圖設定");

  const config = await response.json();
  if (!config.enabled || !config.apiKey) throw new Error("尚未設定 Maps API key");

  await loadGoogleMaps(config.apiKey);

  state.map = new window.google.maps.Map(googleMapElement, {
    center: { lat: 24.5, lng: 15 },
    zoom: 3,
    styles: mapStyles,
    backgroundColor: "#050505",
    clickableIcons: false,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    zoomControl: true,
  });

  state.mapReady = true;
  mapStage.classList.add("map-ready");
  renderPins();
}

function openDrawer() {
  drawer.classList.add("open");
}

function closeDrawer() {
  drawer.classList.remove("open");
  formStatus.textContent = "";
}

async function submitTrip(event) {
  event.preventDefault();
  formStatus.textContent = "儲存中...";

  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  payload.latitude = Number(payload.latitude);
  payload.longitude = Number(payload.longitude);
  payload.tags = normalizeTags(payload.tags);

  const response = await fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "儲存失敗" }));
    formStatus.textContent = error.error || "儲存失敗";
    return;
  }

  form.reset();
  formStatus.textContent = "已儲存";
  closeDrawer();
  state.selectedId = null;
  await loadTrips();
}

let isDragging = false;
let dragStartX = 0;
let scrollStart = 0;

function startTimelineDrag(event) {
  isDragging = true;
  dragStartX = event.pageX || event.touches?.[0]?.pageX || 0;
  scrollStart = timelineTrack.scrollLeft;
}

function moveTimelineDrag(event) {
  if (!isDragging) return;
  const pageX = event.pageX || event.touches?.[0]?.pageX || 0;
  timelineTrack.scrollLeft = scrollStart - (pageX - dragStartX) * 1.18;
}

function stopTimelineDrag() {
  isDragging = false;
}

document.querySelector("#openDrawer").addEventListener("click", openDrawer);
document.querySelector("#closeDrawer").addEventListener("click", closeDrawer);
form.addEventListener("submit", submitTrip);
mapStage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  openDrawer();
});
timelineTrack.addEventListener("mousedown", startTimelineDrag);
timelineTrack.addEventListener("mousemove", moveTimelineDrag);
window.addEventListener("mouseup", stopTimelineDrag);
timelineTrack.addEventListener("touchstart", startTimelineDrag, { passive: true });
timelineTrack.addEventListener("touchmove", moveTimelineDrag, { passive: true });
window.addEventListener("touchend", stopTimelineDrag);

Promise.allSettled([initializeMap(), loadTrips()]).then((results) => {
  const tripsResult = results[1];
  if (tripsResult.status === "rejected") {
    tripCount.textContent = "離線";
    inspector.classList.add("visible");
    inspector.innerHTML = `<h2>後端未連線</h2><p>${tripsResult.reason.message}</p>`;
  }
});
