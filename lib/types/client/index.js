import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState } from 'react';
import { CodeBlock, registerFenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives';
import { getActiveSessionId, setActiveSessionId } from "./active-session.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { GenuiBlock } from "./GenuiBlock.js";
import { repairGenuiSpec, validateGenuiSpec } from "./guard.js";
import { fenceStateKey } from "./interaction-store.js";
import { parsePartialGenuiSpec } from "./parse-partial.js";
import { createPanelSlashSource } from "./panel-command.js";
import { GenuiPanel } from "./panel.js";
import { publishPanelAppend, publishPanelSpec } from "./panel-store.js";
import { GenuiToolView } from "./toolview.js";
/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI.
 *
 * A spec flagged `"panel": true` is PANEL-ONLY: it publishes to the session
 * panel store (targeted by the active-session feed) and renders nothing in
 * the message flow — the model updates the dock surface without stacking UI
 * blocks per round. */
/** A fence body counts as complete when it parses as a whole JSON value —
 * used to gate append publishes, which must merge exactly once (never per
 * streaming chunk). */
function isCompleteJson(raw) {
    try {
        JSON.parse(raw);
        return true;
    }
    catch {
        return false;
    }
}
/** Short human-readable reason for a body that fails whole-JSON parsing, or
 * null when it parses. Positions come from the host's JSON.parse error. */
function describeJsonFailure(raw) {
    try {
        JSON.parse(raw);
        return null;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const pos = msg.match(/position (\d+)/i);
        const where = pos !== null ? `（字符 ${pos[1]} 附近）` : '';
        return `${where}${msg.slice(0, 140)}`;
    }
}
/** Inline diagnostic banner for a settled-but-malformed fence body. Kept
 * minimal and self-contained (inline styles only — the host may override
 * stylesheet rules), tone-friendly on both light and dark themes. */
const FENCE_ERROR_STYLE = {
    margin: '0 0 6px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(239, 68, 68, 0.14)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#f87171',
    fontSize: 12,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
};
/**
 * Fallback for a ```dsh-ui fence whose body has no finished component yet.
 * Two very different situations land here and they must not be conflated:
 *
 * 1. **Streaming partial** — the reply is still being written and the JSON
 *    simply is not complete. The host marks the streaming message with
 *    `[data-streaming]` on the AssistantMarkdown root, which is an ancestor
 *    of every fence. While that marker is present, a plain code block is the
 *    correct rendering (partial JSON must never look like an error).
 *
 * 2. **Settled defect** — the message is finished but the body still does
 *    not parse as JSON (a malformed fence like a missing `}`). This used to
 *    fail silently: the fence degraded to a code block with no hint, and the
 *    author had no way to know the UI never rendered. Once the streaming
 *    marker is gone, surface a compact diagnostic with the parse position so
 *    the defect is visible instead of silent.
 *
 * The settle transition is observed with a layout effect that re-runs on
 * every render: the host removes `[data-streaming]` in the final update, so
 * the effect sees the marker disappear and flips `settled` once. Hosts that
 * never carry the marker (toolview, panel, static text) count as settled
 * from the first mount.
 */
function FenceFallback({ raw, fenceKey }) {
    const ref = useRef(null);
    const [settled, setSettled] = useState(false);
    useLayoutEffect(() => {
        const node = ref.current;
        if (node !== null && node.closest('[data-streaming]') === null)
            setSettled(true);
    });
    const diagnostic = settled && raw.trim() !== '' ? describeJsonFailure(raw) : null;
    return (_jsxs("div", { ref: ref, children: [diagnostic !== null && (_jsxs("div", { style: FENCE_ERROR_STYLE, role: "alert", children: ["\u26A0\uFE0F dsh-ui fence JSON \u89E3\u6790\u5931\u8D25", diagnostic, " \u2014\u2014 \u56F4\u680F\u4FDD\u6301\u4E3A\u4EE3\u7801\u5757\uFF1B\u8BF7\u8BA9\u6A21\u578B\u68C0\u67E5\u5E76\u4FEE\u590D JSON \u540E\u91CD\u53D1\u3002"] })), _jsx(CodeBlock, { code: `${raw}\n`, lang: "dsh-ui" }, fenceKey)] }));
}
/** Amber note style for a parseable-but-invalid spec (invalid nodes were
 * dropped/repaired silently by the guard; make that visible instead). */
const SPEC_ISSUE_STYLE = {
    margin: '0 0 6px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(245, 158, 11, 0.14)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    color: '#fbbf24',
    fontSize: 12,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
};
/**
 * Issues worth surfacing for a parsed spec: structural defects the guard
 * healed by dropping/clamping (empty arrays, positional arrays, wrong-typed
 * fields). `unknown type` entries are excluded — plugin-registered custom
 * components are valid when a renderer is registered, and the guard cannot
 * know, so they must not look like errors.
 */
function visibleSpecIssues(parsed) {
    const issues = validateGenuiSpec(parsed).errors.filter((e) => !e.includes('unknown type'));
    return issues.slice(0, 3);
}
/** Small amber note above the repaired UI when the raw spec contained
 * defects the guard had to heal. Kept invisible for clean specs. */
function SpecIssuesNote({ issues }) {
    if (issues.length === 0)
        return null;
    return (_jsxs("div", { style: SPEC_ISSUE_STYLE, role: "note", children: ["\u26A0\uFE0F dsh-ui \u56F4\u680F\u542B\u4E0D\u5408\u6CD5\u5185\u5BB9\uFF0C\u5DF2\u81EA\u52A8\u4FEE\u590D/\u5FFD\u7565\uFF1A", issues.join('；')] }));
}
export const renderGenuiFence = (raw, key) => {
    const parsed = parsePartialGenuiSpec(raw);
    const spec = parsed === null ? null : repairGenuiSpec(parsed);
    if (spec === null)
        return _jsx(FenceFallback, { fenceKey: key, raw: raw }, key);
    if (spec.panel === true) {
        const sessionId = getActiveSessionId();
        if (sessionId !== null) {
            if (spec.append === true) {
                // Append merges INTO the existing panel (tabs by label, else tail),
                // keeping prior content and growing the panel without size limits.
                // Gate on a complete body so the streaming partial parses never
                // double-merge; a broken transfer simply leaves the panel unchanged.
                // The fence key makes the merge idempotent per source — the renderer
                // re-invokes a completed fence on settle/re-render passes.
                if (isCompleteJson(raw))
                    publishPanelAppend(sessionId, spec, Number.POSITIVE_INFINITY, String(key));
            }
            else {
                publishPanelSpec(sessionId, spec);
            }
        }
        return null;
    }
    const sessionId = getActiveSessionId();
    return (_jsxs(ErrorBoundary, { label: "\u8BE5\u754C\u9762", children: [_jsx(SpecIssuesNote, { issues: visibleSpecIssues(parsed) }), _jsx(GenuiBlock, { spec: spec, 
                // v2.7 durable state: session + fence slot + content fingerprint —
                // replaying the same content restores answers/lock/field values.
                stateKey: sessionId === null ? undefined : fenceStateKey(sessionId, String(key), JSON.stringify(spec)) }, key)] }));
};
/** Session panel action loop: same [genui-action] contract as inline fences,
 * routed through the scoped conversation send (queued user message). The
 * prompt asks the model to re-run render_ui so the panel updates in place. */
function panelActionSend(ctx, sessionId) {
    const scoped = ctx.sessions.scope(sessionId);
    const conversation = scoped?.get('conversation');
    return {
        sessionId,
        sendGenuiAction: (action, payload) => {
            if (conversation === undefined)
                return;
            const payloadText = Object.keys(payload).length === 0
                ? ''
                : ` 组件数据: ${JSON.stringify(payload)}`;
            void conversation.send(`[genui-action] ${action}。用户刚刚在面板中触发了动作 "${action}"，请根据组件数据执行相应操作，只输出一个 panel:true 的 dsh-ui 围栏来更新面板，回复文本至多一行 10 字以内的确认（如"已刷新"），不要解释、不要普通围栏。${payloadText}`).catch(() => {
                // A failed prompt (session gone, agent busy) drops the action; the
                // panel stays interactive — the component is not disabled.
            });
        },
    };
}
/** Relay a `/panel <指令>` instruction to the model: the scoped conversation
 * send with an explicit panel-only directive, so the model replaces the
 * default panel with content tailored to the request. */
function sendPanelInstruction(ctx, sessionId, instruction) {
    const scoped = ctx.sessions.scope(sessionId);
    const conversation = scoped?.get('conversation');
    if (conversation === undefined)
        return;
    void conversation.send(`用户执行了 /panel 并请求：${instruction}。请只输出一个 panel:true 的 dsh-ui 围栏来更新会话面板，内容按请求定制；回复文本至多一行 10 字以内的确认（如"已更新"），不要解释、不要普通围栏。`).catch(() => {
        // A failed prompt (session gone, agent busy) drops the instruction; the
        // default panel stays visible.
    });
}
/** Cordis client entry: register the fence renderer on boot, the keyed
 * toolview for the render_ui tool, and the session panel dock; returning the
 * disposers lets cordis tear all registrations down on plugin unload. */
export function apply(ctx) {
    const disposers = [registerFenceRenderer('dsh-ui', renderGenuiFence)];
    // Active-session feed: keeps the panel-target for panel-only fences
    // (renderers run synchronously without a session-scoped component seat).
    const syncActive = () => {
        const info = ctx.sessions.currentProvideInfo.getSnapshot();
        setActiveSessionId(info?.sessionId ?? null);
    };
    syncActive();
    disposers.push(ctx.sessions.currentProvideInfo.subscribe(syncActive));
    // Keyed toolview: the harness dispatches 'tool.call.toolview' by wire tool
    // name; registering under 'render_ui' gives the tool's result card the
    // GenUI renderer (reading the repaired spec from result meta). The toolview
    // also publishes every settled spec to the session panel store.
    disposers.push(ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'render_ui',
    }, GenuiToolView)));
    // Session panel dock: a session-scoped, always-present seat above the
    // composer (TodoDock posture). Renders the session's latest render_ui
    // spec in place; absent spec = no panel.
    disposers.push(ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'genui-panel',
        order: 50,
        inject: (sessionId) => panelActionSend(ctx, sessionId),
    }, GenuiPanel)));
    // /panel slash command: a deterministic, client-side entry point that
    // opens the panel dock (publishes the default spec + expand request),
    // clears it (/panel clear), or relays an instruction to the model
    // (/panel <指令>) so the panel gets tailored content.
    const slash = ctx.get('slash');
    if (slash !== undefined) {
        disposers.push(ctx.effect(() => slash.registerSource(createPanelSlashSource((sessionId, instruction) => sendPanelInstruction(ctx, sessionId, instruction))), 'genui: /panel'));
    }
    else {
        console.warn('[genui] slash service unavailable; /panel command disabled');
    }
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
/** Browser services: the slots registry (toolview + dock), sessions (for
 * the scoped conversation send behind panel actions), and slash (the /panel
 * command source). */
export const inject = ['slots', 'sessions', 'slash'];
//# sourceMappingURL=index.js.map