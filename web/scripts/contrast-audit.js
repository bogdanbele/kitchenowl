/**
 * Contrast audit — paste into the browser console on any screen.
 *
 *     copy(await fetch('/scripts/contrast-audit.js').then(r => r.text()))
 *
 * or just paste the file. Then:
 *
 *     contrastAudit()            // failures on this screen
 *     contrastAudit({all: true}) // every text node with its ratio
 *
 * It exists because "it looks a bit low contrast" is an argument and 3.49:1 is
 * a fact. The planner was reported as unreadable; measuring found 37 failing
 * nodes sharing one colour, and the fix was three token changes rather than a
 * redesign.
 *
 * Thresholds are WCAG 2.2 AA: 4.5:1 for text, 3:1 for text at 24px or 18.66px
 * bold. Elements whose text sits on a gradient are reported separately — a
 * gradient has no single background colour, so the honest answer is "check the
 * lightest stop by hand", not a number that averages a lie.
 */
(() => {
  const relativeLuminance = ([r, g, b]) => {
    const channel = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const parseColor = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { rgb: [parts[0], parts[1], parts[2]], alpha: parts.length > 3 ? parts[3] : 1 };
  };

  // Semi-transparent text over its backdrop, which is what the eye actually sees.
  const flatten = (fg, bg) => fg.rgb.map((c, i) => c * fg.alpha + bg[i] * (1 - fg.alpha));

  const backgroundOf = (element) => {
    let node = element;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/gradient/.test(style.backgroundImage)) return { gradient: true };
      const color = parseColor(style.backgroundColor);
      if (color && color.alpha > 0.98) return { rgb: color.rgb };
      node = node.parentElement;
    }
    return { rgb: parseColor(getComputedStyle(document.body).backgroundColor)?.rgb ?? [0, 0, 0] };
  };

  const contrast = (a, b) => {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
  };

  window.contrastAudit = ({ all = false } = {}) => {
    const failures = [];
    const onGradient = [];

    for (const element of document.querySelectorAll("body *")) {
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        .map((node) => node.textContent.trim())
        .join(" ");
      if (!text) continue;

      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // The wordmark is background-clip:text — transparent by design, not a fault.
      if (style.color === "rgba(0, 0, 0, 0)") continue;

      const foreground = parseColor(style.color);
      if (!foreground) continue;

      const background = backgroundOf(element);
      if (background.gradient) {
        onGradient.push({ text: text.slice(0, 40), color: style.color });
        continue;
      }

      const size = parseFloat(style.fontSize);
      const weight = parseInt(style.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const required = large ? 3 : 4.5;
      const ratio = contrast(flatten(foreground, background.rgb), background.rgb);

      if (all || ratio < required) {
        failures.push({
          text: text.slice(0, 40),
          ratio: Number(ratio.toFixed(2)),
          required,
          px: Number(size.toFixed(1)),
          color: style.color,
        });
      }
    }

    failures.sort((a, b) => a.ratio - b.ratio);
    console.table(failures);
    if (onGradient.length) {
      console.info(`${onGradient.length} nodes sit on a gradient — check the lightest stop by hand.`);
    }
    return { failures, onGradient };
  };

  console.info("contrastAudit() ready");
})();
