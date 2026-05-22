// External JS — if this runs, the server served it and the iframe executed it.
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("js-proof");
  if (el) {
    el.textContent = "JavaScript ran ✓ — external script loaded from app.js";
    el.classList.add("ok");
  }
});
