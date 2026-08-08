import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PlotBlock: renders one or more math functions as an SVG line chart. The
 * model supplies expressions (e.g. "sin(x)") which are evaluated by the
 * SafeMath white-listed evaluator — never eval — and sampled into polylines.
 * Pure SVG: linear x/y scales computed in place, no chart library.
 *
 * v2 interactivity: series may declare `params` (e.g. {a: 2} in "a*sin(x)")
 * which render as live sliders under the chart — dragging re-samples the
 * curve in place. The plot itself supports drag-to-pan and wheel-to-zoom.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { sampleExpr } from "./safe-math.js";
import css from './PlotBlock.module.css';
/** Categorical palette for multi-series plots (muted, dark-theme friendly). */
export const PLOT_COLORS = ['#4f8ef7', '#3ecf8e', '#e0a458', '#e07b6a', '#9a86d8', '#5cb8b8', '#d487b6', '#8aaa6e'];
/** Series color: explicit wins; multi-series auto-assign from the palette. */
const seriesColor = (i, n, c) => c ?? (n > 1 ? PLOT_COLORS[i % PLOT_COLORS.length] : undefined);
const WIDTH = 480;
const HEIGHT = 220;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 14;
const PAD_B = 24;
const SAMPLES = 240;
/** Auto-fit y-range from finite samples with a small margin. */
function fitY(points) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [, y] of points) {
        if (y < lo)
            lo = y;
        if (y > hi)
            hi = y;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi))
        return [-1, 1];
    if (lo === hi) {
        lo -= 1;
        hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}
function niceTicks(min, max, count = 5) {
    const span = max - min;
    if (!Number.isFinite(span) || span <= 0)
        return [];
    const step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = span / count / step;
    const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const size = step * mult;
    const ticks = [];
    for (let v = Math.ceil(min / size) * size; v <= max + size * 1e-9; v += size) {
        ticks.push(Math.round(v * 1e9) / 1e9);
    }
    return ticks;
}
function formatTick(v) {
    if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0))
        return v.toExponential(1);
    return String(Math.round(v * 100) / 100);
}
/** Polyline with manual points sync: React 18 does not reliably update the
 * SVG `points` attribute when only the value changes (the element is diffed
 * but the attribute write is skipped), so this wrapper writes it through a
 * ref on every render. */
function Polyline({ points, className, color }) {
    // React 18 does not reliably update the SVG `points` attribute when the
    // value changes on an existing element (the DOM write is skipped). Keying
    // the element on a prefix of the points string forces a fresh element per
    // distinct curve, which sidesteps the update entirely. The prefix must
    // change whenever the curve changes: include the first and last point.
    const key = points.length > 40 ? `${points.slice(0, 16)}|${points.slice(-16)}` : points;
    return (_jsx("polyline", { points: points, className: className, style: color !== undefined ? { stroke: color } : undefined }, key));
}
/** Render one plot: grid, axes, one polyline per series, legend, sliders. */
export const PlotBlock = memo(function PlotBlock({ series, xMin: propXMin = -5, xMax: propXMax = 5, yMin, yMax, title, }) {
    // Pan/zoom view state: x range plus a LOCKED y range. The y range is fit
    // ONCE from the initial parameters and then fixed, so dragging a parameter
    // slider changes the curve's SHAPE (amplitude/slope) instead of rescaling
    // the axis every time — the user sees the function move, not the numbers.
    const [view, setView] = useState(() => {
        // Fit y from the default parameter values (the same fallback the render
        // path uses), so the initial axis already frames the default curve.
        const defaults = {};
        for (const [si, s] of series.entries()) {
            for (const p of s.params ?? []) {
                if (p !== null && p !== undefined)
                    defaults[`${si}:${p.name}`] = p.value;
            }
        }
        const probe = series.map((s, si) => {
            const p = {};
            for (const param of s.params ?? []) {
                if (param === null || param === undefined)
                    continue;
                p[param.name] = defaults[`${si}:${param.name}`] ?? param.value;
            }
            return sampleExpr(s.expr, propXMin, propXMax, SAMPLES, p);
        });
        const [autoLo, autoHi] = fitY(probe.flatMap(p => p));
        return {
            xMin: propXMin,
            xMax: propXMax,
            yMin: yMin ?? autoLo,
            yMax: yMax ?? autoHi,
        };
    });
    const dragRef = useRef(null);
    // Parameter values keyed by series index + param name; slider drag updates.
    // Deliberately starts EMPTY: the initializer must never read series props
    // (a parent re-mount can rebuild them mid-interaction), so every value
    // falls back to the param's declared default at render time. This makes
    // remounts during slider drags crash-proof.
    const [params, setParams] = useState(() => ({}));
    // Animation: pick the first parameter that declares animateTo. A play/pause
    // button drives it from its current value to animateTo over durationMs
    // using requestAnimationFrame; the curve moves in place (y axis is locked).
    const animParam = (() => {
        for (const [si, s] of series.entries()) {
            for (const p of s.params ?? []) {
                if (p !== null && p !== undefined && p.animateTo !== undefined) {
                    return { si, param: p };
                }
            }
        }
        return null;
    })();
    const [playing, setPlaying] = useState(false);
    const [animProgress, setAnimProgress] = useState(0);
    const animRef = useRef(null);
    useEffect(() => {
        if (!playing || animParam === null)
            return;
        const from = params[`${animParam.si}:${animParam.param.name}`] ?? animParam.param.value;
        const to = animParam.param.animateTo;
        const duration = animParam.param.durationMs ?? 4000;
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            const value = from + (to - from) * eased;
            setParams(prev => ({ ...prev, [`${animParam.si}:${animParam.param.name}`]: value }));
            setAnimProgress(t);
            if (t < 1) {
                animRef.current = requestAnimationFrame(tick);
            }
            else if (animParam.param.loop === true) {
                setParams(prev => ({ ...prev, [`${animParam.si}:${animParam.param.name}`]: animParam.param.value }));
                setAnimProgress(0);
                animRef.current = requestAnimationFrame(() => setPlaying(p => p));
            }
            else {
                setPlaying(false);
            }
        };
        animRef.current = requestAnimationFrame(tick);
        return () => { if (animRef.current !== null)
            cancelAnimationFrame(animRef.current); };
    }, [playing, animParam?.si, animParam?.param.name, animParam?.param.animateTo]);
    const xMin = view.xMin;
    const xMax = view.xMax;
    const lo = view.yMin;
    const hi = view.yMax;
    const plotW = WIDTH - PAD_L - PAD_R;
    const plotH = HEIGHT - PAD_T - PAD_B;
    const fromX = (px) => xMin + ((px - PAD_L) / plotW) * (xMax - xMin);
    const toX = (x) => PAD_L + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y) => PAD_T + (1 - (y - lo) / (hi - lo)) * plotH;
    // Sample with current parameter values, then convert to screen coordinates
    // in one pass against the LOCKED y range — the `points` string changes with
    // the parameters, so the curve's shape visibly responds to the slider.
    const sampled = series.map((s, si) => {
        const p = {};
        for (const param of s.params ?? []) {
            if (param === null || param === undefined)
                continue;
            p[param.name] = params[`${si}:${param.name}`] ?? param.value;
        }
        const pts = sampleExpr(s.expr, xMin, xMax, SAMPLES, p);
        return {
            series: s,
            points: pts.map(([x, y]) => `${toX(x).toFixed(2)},${toY(y).toFixed(2)}`).join(' '),
        };
    });
    const xTicks = niceTicks(xMin, xMax);
    const yTicks = niceTicks(lo, hi);
    const hasData = sampled.some(p => p.points.length > 1);
    const hasValidRange = Number.isFinite(xMin) && Number.isFinite(xMax) && xMax > xMin && Number.isFinite(hi) && Number.isFinite(lo) && hi > lo;
    // Drag-to-pan and wheel-to-zoom on the SVG surface. Pan/zoom move the x
    // window only; the y range stays locked so parameter changes stay visible.
    const onPointerDown = (e) => {
        dragRef.current = { startX: e.clientX, startY: e.clientY, xMin, xMax };
        e.target.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        const d = dragRef.current;
        if (d === null)
            return;
        const span = d.xMax - d.xMin;
        const dx = ((d.startX - e.clientX) / plotW) * span;
        setView(prev => ({ xMin: d.xMin + dx, xMax: d.xMax + dx, yMin: prev.yMin, yMax: prev.yMax }));
    };
    const onPointerUp = () => { dragRef.current = null; };
    const onWheel = (e) => {
        const span = xMax - xMin;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const next = span * factor;
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = fromX(((e.clientX - rect.left) / rect.width) * WIDTH);
        const left = cx - ((cx - xMin) / span) * next;
        setView(prev => ({ xMin: left, xMax: left + next, yMin: prev.yMin, yMax: prev.yMax }));
    };
    const hasParams = series.some(s => (s.params?.length ?? 0) > 0);
    return (_jsxs("div", { className: css.block, "data-genui-plot": true, children: [title !== undefined && _jsx("div", { className: css.title, children: title }), hasData && hasValidRange ? (_jsxs("svg", { width: "100%", viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: "img", "aria-label": title ?? 'function plot', className: css.surface, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerLeave: onPointerUp, onWheel: onWheel, children: [yTicks.map(t => (_jsxs("g", { children: [_jsx("line", { x1: PAD_L, x2: WIDTH - PAD_R, y1: toY(t), y2: toY(t), className: css.gridLine }), _jsx("text", { x: PAD_L - 6, y: toY(t) + 4, className: css.tick, textAnchor: "end", children: formatTick(t) })] }, `y${t}`))), xTicks.map(t => (_jsxs("g", { children: [_jsx("line", { x1: toX(t), x2: toX(t), y1: PAD_T, y2: HEIGHT - PAD_B, className: css.gridLine }), _jsx("text", { x: toX(t), y: HEIGHT - PAD_B + 14, className: css.tick, textAnchor: "middle", children: formatTick(t) })] }, `x${t}`))), _jsx("line", { x1: PAD_L, x2: WIDTH - PAD_R, y1: HEIGHT - PAD_B, y2: HEIGHT - PAD_B, className: css.axis }), _jsx("line", { x1: PAD_L, x2: PAD_L, y1: PAD_T, y2: HEIGHT - PAD_B, className: css.axis }), sampled.map(({ series: s, points }, i) => (_jsx(Polyline, { points: points, className: css.line, color: seriesColor(i, sampled.length, s.color) }, i)))] })) : (_jsx("div", { className: css.empty, children: series.map((s, i) => _jsxs("div", { className: css.emptyRow, children: [s.expr, " \u2014 \u65E0\u6CD5\u7ED8\u5236\uFF08\u8868\u8FBE\u5F0F\u65E0\u6548\u6216\u8303\u56F4\u975E\u6CD5\uFF09"] }, i)) })), hasParams && (_jsxs("div", { className: css.sliders, children: [_jsxs("div", { className: css.slidersHead, children: [_jsx("span", { className: css.slidersTitle, children: "\u53C2\u6570\u8C03\u8282" }), _jsx("button", { type: "button", className: css.resetBtn, onClick: () => {
                                    setPlaying(false);
                                    const reset = {};
                                    for (const [si, s] of series.entries()) {
                                        for (const p of s.params ?? []) {
                                            if (p !== null && p !== undefined)
                                                reset[`${si}:${p.name}`] = p.value;
                                        }
                                    }
                                    setParams(reset);
                                    setAnimProgress(0);
                                }, children: "\u21BA \u91CD\u7F6E" })] }), series.map((s, si) => (s.params ?? []).map(p => {
                        if (p === null || p === undefined)
                            return null;
                        const key = `${si}:${p.name}`;
                        const value = params[key] ?? p.value;
                        return (_jsxs("label", { className: css.sliderRow, children: [_jsxs("span", { className: css.sliderName, children: [s.label ?? s.expr, " \u00B7 ", p.name] }), _jsx("input", { type: "range", className: css.slider, min: p.min ?? 0, max: p.max ?? 10, step: p.step ?? 0.1, value: value, onChange: e => {
                                        // Read the value synchronously: React 18 may null out
                                        // currentTarget after the handler in concurrent renders.
                                        const next = Number(e.currentTarget.value);
                                        setParams(prev => ({ ...prev, [key]: next }));
                                    } }), _jsx("span", { className: css.sliderValue, children: Math.round(value * 100) / 100 })] }, key));
                    }))] })), animParam !== null && (_jsxs("div", { className: css.animBar, children: [_jsx("button", { type: "button", className: css.playBtn, onClick: () => {
                            if (playing) {
                                setPlaying(false);
                            }
                            else {
                                // Reset to the declared start value before playing.
                                setParams(prev => ({ ...prev, [`${animParam.si}:${animParam.param.name}`]: animParam.param.value }));
                                setAnimProgress(0);
                                setPlaying(true);
                            }
                        }, children: playing ? '⏸ 暂停' : '▶ 播放动画' }), playing && (_jsx("div", { className: css.animTrack, children: _jsx("div", { className: css.animFill, style: { width: `${animProgress * 100}%` } }) }))] })), (series.length > 1 || hasParams) && (_jsx("div", { className: css.legend, children: series.map((s, i) => (_jsxs("span", { className: css.legendItem, children: [_jsx("span", { className: css.legendSwatch, style: { background: seriesColor(i, series.length, s.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)' } }), s.label ?? s.expr] }, i))) }))] }));
});
//# sourceMappingURL=PlotBlock.js.map