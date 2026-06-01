const statusPanel = document.getElementById("statusPanel");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const posterCanvas = document.getElementById("posterCanvas");
const posterContext = posterCanvas.getContext("2d");

const modalFields = {
  type: document.getElementById("modalType"),
  title: document.getElementById("modalTitle"),
  date: document.getElementById("modalDate"),
  status: document.getElementById("modalStatus"),
  source: document.getElementById("modalSource"),
  overview: document.getElementById("modalOverview")
};

function setStatus(meta) {
  const failed = (meta?.services || []).filter((service) => !service.ok);

  if (!meta) {
    statusPanel.innerHTML = '<span class="status-pill warning">Unable to load calendar metadata</span>';
    return;
  }

  if (failed.length === 0) {
    statusPanel.innerHTML = '<span class="status-pill ok">Radarr and Sonarr synced</span>';
    return;
  }

  const message = failed
    .map((service) => `${service.name}: ${service.error || "unavailable"}`)
    .join(" | ");

  statusPanel.innerHTML = `<span class="status-pill warning">Partial sync - ${escapeHtml(message)}</span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date) {
  if (!date) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: date.getHours() || date.getMinutes() ? "short" : undefined
  }).format(date);
}

function drawPosterFallback(label, color) {
  const width = posterCanvas.width;
  const height = posterCanvas.height;

  posterContext.clearRect(0, 0, width, height);
  posterContext.fillStyle = "#0a0e14";
  posterContext.fillRect(0, 0, width, height);
  posterContext.fillStyle = color || "#2f80ed";
  posterContext.fillRect(0, 0, width, 10);
  posterContext.fillStyle = "#eef4fb";
  posterContext.font = "700 24px system-ui, sans-serif";
  posterContext.textAlign = "center";
  posterContext.textBaseline = "middle";

  const words = String(label || "No Poster").split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const testLine = current ? `${current} ${word}` : word;
    if (posterContext.measureText(testLine).width > width - 44 && current) {
      lines.push(current);
      current = word;
    } else {
      current = testLine;
    }
  });

  if (current) {
    lines.push(current);
  }

  lines.slice(0, 5).forEach((line, index) => {
    posterContext.fillText(line, width / 2, height / 2 + (index - lines.length / 2) * 32);
  });
}

function drawPoster(url, fallbackLabel, color) {
  if (!url) {
    drawPosterFallback(fallbackLabel, color);
    return;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const canvasRatio = posterCanvas.width / posterCanvas.height;
    const imageRatio = image.width / image.height;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let sourceX = 0;
    let sourceY = 0;

    if (imageRatio > canvasRatio) {
      sourceWidth = image.height * canvasRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / canvasRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    posterContext.clearRect(0, 0, posterCanvas.width, posterCanvas.height);
    posterContext.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      posterCanvas.width,
      posterCanvas.height
    );
  };
  image.onerror = () => drawPosterFallback(fallbackLabel, color);
  image.src = url;
}

function openModal(eventInfo) {
  const event = eventInfo.event;
  const props = event.extendedProps || {};

  modalFields.type.textContent = props.type || "Media";
  modalFields.title.textContent = event.title;
  modalFields.date.textContent = formatDate(event.start);
  modalFields.status.textContent = props.status || "Unknown";
  modalFields.source.textContent = props.source === "radarr" ? "Radarr" : "Sonarr";
  modalFields.overview.textContent = props.overview || "No summary is available for this item.";

  drawPoster(props.poster, event.title, event.backgroundColor || event.borderColor);
  modalBackdrop.hidden = false;
  modalClose.focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
}

async function fetchEvents(info, successCallback, failureCallback) {
  try {
    const url = new URL("/api/calendar", window.location.origin);
    url.searchParams.set("start", info.startStr);
    url.searchParams.set("end", info.endStr);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Calendar API returned ${response.status}`);
    }

    const payload = await response.json();
    setStatus(payload.meta);
    successCallback(payload.events || []);
  } catch (error) {
    statusPanel.innerHTML = `<span class="status-pill warning">${escapeHtml(error.message)}</span>`;
    failureCallback(error);
  }
}

function getPreferredView() {
  return window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches
    ? "listMonth"
    : "dayGridMonth";
}

document.addEventListener("DOMContentLoaded", () => {
  const calendarElement = document.getElementById("calendar");
  const calendar = new FullCalendar.Calendar(calendarElement, {
    initialView: getPreferredView(),
    height: "auto",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listMonth"
    },
    buttonText: {
      today: "Today",
      month: "Month",
      list: "Agenda"
    },
    nowIndicator: true,
    displayEventTime: false,
    eventSources: [{ events: fetchEvents }],
    eventClick: openModal,
    loading(isLoading) {
      if (isLoading) {
        statusPanel.innerHTML = '<span class="status-pill loading">Syncing calendar data</span>';
      }
    }
  });

  calendar.render();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const preferredView = getPreferredView();
      if (calendar.view.type !== preferredView) {
        calendar.changeView(preferredView, calendar.getDate());
      }
    }, 180);
  });
});

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    closeModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});
