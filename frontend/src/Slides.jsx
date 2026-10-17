import { Children, useEffect, useRef, useState } from "react";
import Stage3D from "./Stage3D.jsx";

const pad = (n) => String(n).padStart(3, "0");

// Full-height slides: wheel, arrow keys, swipe or dots move between them.
// children is a function receiving go(index) and returning an array of slides.
export default function Slides({ children }) {
  const [index, setIndex] = useState(0);
  const boxRef = useRef(null);
  const idx = useRef(0);
  const count = useRef(0);
  const lock = useRef(0);

  const go = (n) => {
    const c = Math.max(0, Math.min(count.current - 1, n));
    if (c === idx.current) return;
    idx.current = c;
    lock.current = Date.now();
    setIndex(c);
  };
  const slides = Children.toArray(children(go));
  count.current = slides.length;

  useEffect(() => {
    const box = boxRef.current;
    const innerScroll = (down) => {
      const cur = box.querySelector(".slide.current");
      if (!cur || cur.scrollHeight <= cur.clientHeight + 2) return false;
      const atEnd = cur.scrollTop + cur.clientHeight >= cur.scrollHeight - 2;
      return down ? !atEnd : cur.scrollTop > 0;
    };
    const onWheel = (e) => {
      if (innerScroll(e.deltaY > 0)) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 8 || Date.now() - lock.current < 1000) return;
      go(idx.current + (e.deltaY > 0 ? 1 : -1));
    };
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") go(idx.current + 1);
      if (e.key === "ArrowUp" || e.key === "PageUp") go(idx.current - 1);
    };
    let y0 = 0;
    const onStart = (e) => { y0 = e.touches[0].clientY; };
    const onEnd = (e) => {
      const dy = y0 - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 60 && !innerScroll(dy > 0)) go(idx.current + (dy > 0 ? 1 : -1));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("touchstart", onStart, { passive: true });
    box.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("touchstart", onStart);
      box.removeEventListener("touchend", onEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="slides" ref={boxRef}>
      {slides.map((s, i) => (
        <section key={i} className={`slide ${i === index ? "current" : ""}`} style={{ transform: `translateY(${(i - index) * 100}%)` }} aria-hidden={i !== index}>
          {s}
        </section>
      ))}
      <Stage3D index={index} />
      <div className="slide-count"><b>{pad(index + 1)}</b> / {pad(slides.length)}</div>
      <nav className="slide-dots" aria-label="Slides">
        {slides.map((_, i) => (
          <button key={i} className={i === index ? "on" : ""} onClick={() => go(i)} aria-label={`Go to slide ${i + 1}`} />
        ))}
      </nav>
    </div>
  );
}
