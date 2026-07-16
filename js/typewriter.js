/* Headings stream in like an LLM response: characters appear in small
   uneven chunks behind a blinking caret, triggered on scroll into view.
   Layout never shifts — every character is laid out up front and merely
   hidden, so line-wrapping is identical before, during, and after. */

(function initTypewriter() {
  console.log("[typewriter] loaded, reduced-motion:",
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return; // content stays visible if we can't reveal it

  const headings = [...document.querySelectorAll("h1, h2, h3")];
  if (!headings.length) return;

  // Wrap each character of every text node in a hidden span, preserving
  // nested markup (.acc-blue spans, <sub>, entities, …).
  function wrapChars(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const chars = [];
    textNodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      for (const ch of node.nodeValue) {
        const s = document.createElement("span");
        s.className = "tw-ch tw-hidden";
        s.textContent = ch;
        frag.appendChild(s);
        chars.push(s);
      }
      node.parentNode.replaceChild(frag, node);
    });
    return chars;
  }

  function type(h) {
    const chars = h._twChars;
    // hard fallback: whatever happens to the timers below (throttled tab,
    // paused engine), every character is unhidden after a bounded time
    setTimeout(() => chars.forEach((c) => c.classList.remove("tw-hidden")),
      chars.length * 130 + 2500);
    const cursor = document.createElement("span");
    cursor.className = "tw-cursor";
    if (chars.length) chars[0].before(cursor);

    let i = 0;
    (function step() {
      // reveal a token-sized chunk: mostly 1–2 chars, occasionally a burst
      const chunk = Math.random() < 0.2 ? 3 + (Math.random() * 3 | 0) : 1 + (Math.random() * 2 | 0);
      for (let n = 0; n < chunk && i < chars.length; n++, i++)
        chars[i].classList.remove("tw-hidden");
      if (i < chars.length) {
        cursor.remove();
        chars[i].before(cursor);
        // uneven cadence, with an occasional longer "thinking" pause
        const delay = Math.random() < 0.1 ? 180 + Math.random() * 220 : 38 + Math.random() * 52;
        setTimeout(step, delay);
      } else {
        h.appendChild(cursor);
        setTimeout(() => cursor.remove(), 1400);
      }
    })();
  }

  headings.forEach((h) => { h._twChars = wrapChars(h); });

  // Fire only once the heading has risen well into view (bottom third of
  // the screen), so the user actually sees it type rather than it having
  // finished off-screen. Small delay so headings visible on load don't
  // finish before the first paint registers.
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        setTimeout(() => type(e.target), 350);
      });
    },
    { rootMargin: "0px 0px -33% 0px" }
  );
  headings.forEach((h) => obs.observe(h));
})();
