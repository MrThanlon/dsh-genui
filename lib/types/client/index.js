import { jsx as _jsx } from "react/jsx-runtime";
import { CodeBlock, registerFenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives';
import { getActiveSessionId, setActiveSessionId } from "./active-session.js";
import { GenuiBlock } from "./GenuiBlock.js";
import { repairGenuiSpec } from "./guard.js";
import { parsePartialGenuiSpec } from "./parse-partial.js";
import { GenuiPanel } from "./panel.js";
import { publishPanelSpec } from "./panel-store.js";
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
export const renderGenuiFence = (raw, key) => {
    const parsed = parsePartialGenuiSpec(raw);
    const spec = parsed === null ? null : repairGenuiSpec(parsed);
    if (spec === null)
        return _jsx(CodeBlock, { code: `${raw}\n`, lang: "dsh-ui" }, key);
    if (spec.panel === true) {
        const sessionId = getActiveSessionId();
        if (sessionId !== null)
            publishPanelSpec(sessionId, spec);
        return null;
    }
    return _jsx(GenuiBlock, { spec: spec }, key);
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
            void conversation.send(`[genui-action] ${action}。用户刚刚在面板中触发了动作 "${action}"，请根据组件数据执行相应操作，并再次调用 render_ui 工具更新面板。${payloadText}`).catch(() => {
                // A failed prompt (session gone, agent busy) drops the action; the
                // panel stays interactive — the component is not disabled.
            });
        },
    };
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
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
/** Browser services: the slots registry (toolview + dock) and sessions (for
 * the scoped conversation send behind panel actions). */
export const inject = ['slots', 'sessions'];
//# sourceMappingURL=index.js.map