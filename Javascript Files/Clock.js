function updateClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;

    const now = new Date();

    // Date as M/D/YYYY (e.g. 11/1/2026)
    const dateString = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

    // Time in 24-hour (military) format (e.g. 21:51:07)
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    clock.innerText = `${dateString} | ${timeString}`;
}

// Update the clock every second
setInterval(updateClock, 1000);

// Initial call to avoid one second delay
updateClock();
