const state = {
  trips: [],
  selectedId: null,
};

const mapStage = document.querySelector("#mapStage");
const tripCount = document.querySelector("#tripCount");
const inspector = document.querySelector("#inspector");
const timelineInner = document.querySelector("#timelineInner");
const timelineTrack = document.querySelector("#timelineTrack");
const drawer = document.querySelector("#drawer");
const form = document.querySelector("#tripForm");
const formStatus = document.querySelector("#formStatus");

const longitudeToX = (longitude) => ((Number(longitude) + 180) / 360) * 100;
const latitudeToY = (latitude) => ((90 - Number(latitude)) / 180) * 100;

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return String(tags || "")
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function selectTrip(id) {
  state.selectedId = id;
  const trip = state.trips.find((item) => item.id === id);
  document.querySelectorAll(".pin").forEach((pin) => {
    pin.classList.toggle("active", Number(pin.dataset.id) === id);
  });

  if (!trip) return;

  inspector.classList.add("visible");
  inspector.innerHTML = `
    <h2>${trip.title}</h2>
    <p>${trip.location} · ${formatDate(trip.trip_date)}</p>
    <p>${trip.diary || "No diary yet."}</p>
    <div class="tag-row">${normalizeTags(trip.tags).map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
  `;
}

function renderPins() {
  mapStage.querySelectorAll(".pin").forEach((pin) => pin.remove());

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
  tripCount.textContent = `${state.trips.length} trips`;
  renderPins();
  renderTimeline();

  if (state.trips.length > 0 && !state.selectedId) {
    selectTrip(state.trips[0].id);
  }
}

async function loadTrips() {
  tripCount.textContent = "Syncing";
  const response = await fetch("/api/trips");
  if (!response.ok) throw new Error("Unable to load trips");
  state.trips = await response.json();
  render();
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
  formStatus.textContent = "Saving...";

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
    const error = await response.json().catch(() => ({ error: "Save failed" }));
    formStatus.textContent = error.error || "Save failed";
    return;
  }

  form.reset();
  formStatus.textContent = "Saved";
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

loadTrips().catch((error) => {
  tripCount.textContent = "Offline";
  inspector.classList.add("visible");
  inspector.innerHTML = `<h2>Backend offline</h2><p>${error.message}</p>`;
});
