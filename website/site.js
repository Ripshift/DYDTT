/* DYDTT site — tiny helpers. Edit the two constants below. */
const WEB_APP_URL = "";          // e.g. "https://dydtt.vercel.app" — web-app buttons stay hidden until set
const APK_FILE    = "downloads/dydtt-0.4b.apk";

document.querySelectorAll("[data-webapp]").forEach(a => {
  if (WEB_APP_URL) { a.href = WEB_APP_URL; a.target = "_blank"; a.rel = "noopener"; }
  else a.hidden = true;
});
document.querySelectorAll("[data-apk]").forEach(a => { a.href = APK_FILE; });

/* one big spoiler — the cat is the button */
const bigSpoil = document.getElementById("bigspoil");
if (bigSpoil) {
  const reveal = () => {
    if (bigSpoil.classList.contains("revealed")) return;
    bigSpoil.classList.add("purring");
    setTimeout(() => bigSpoil.classList.add("revealed"), 650);
  };
  document.getElementById("catbtn").addEventListener("click", reveal);
}

/* FAQ search + topic chips */
const faq = document.getElementById("faq");
if (faq) {
  const q = document.getElementById("q"), chips = document.getElementById("chips"), empty = document.getElementById("empty");
  let topic = "all";
  const apply = () => {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    faq.querySelectorAll(".faq-group").forEach(g => {
      const inTopic = topic === "all" || g.dataset.g === topic;
      let any = 0;
      g.querySelectorAll("details").forEach(d => {
        const hit = inTopic && (!term || (d.textContent + " " + (d.dataset.t || "")).toLowerCase().includes(term));
        d.hidden = !hit; if (hit) any++;
        if (term && hit) d.open = true;
      });
      g.hidden = !any; shown += any;
    });
    empty.style.display = shown ? "none" : "block";
  };
  q.addEventListener("input", apply);
  chips.addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    topic = c.dataset.g;
    chips.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === c));
    apply();
  });
  const fromHash = location.hash.slice(1);
  if (["secret","account","start","views","tasks","sync","social","a11y"].includes(fromHash)) {
    topic = fromHash;
    chips.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x.dataset.g === fromHash));
    apply();
  }
}
