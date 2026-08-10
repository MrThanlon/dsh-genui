import { publishPanelSpec, requestPanelExpand } from "./panel-store.js";
/** Default panel content published by `/panel`: the component overview. */
export const DEFAULT_PANEL_SPEC = {
    title: 'GenUI 面板',
    items: [
        { type: 'text', size: 'h3', content: 'GenUI 生成式界面' },
        { type: 'text', size: 'muted', content: '面板会原地更新：对话里说「更新面板」，或再次执行 /panel 刷新。' },
        {
            type: 'grid', cols: 4, items: [
                { type: 'stat', label: '组件', value: '38' },
                { type: 'stat', label: '单个', value: '12' },
                { type: 'stat', label: '组合', value: '8' },
                { type: 'stat', label: '高级', value: '18' },
            ],
        },
        {
            type: 'list', items: [
                { title: '单个 ×12', desc: 'text button input select checkbox link badge stat progress divider avatar spacer' },
                { title: '组合 ×8', desc: 'row col grid card list table chart tabs' },
                { title: '数据 ×7', desc: 'plot callout steps keyvalue diff json code' },
                { title: '交互 ×5', desc: 'radio switch textarea accordion copy' },
                { title: '高级 ×5', desc: 'mermaid scene3d timeline file-tree breadcrumb' },
                { title: '教学 ×1', desc: 'quiz' },
            ],
        },
        { type: 'callout', tone: 'info', title: '更新方式', content: '对话说「更新面板」→ 模型输出 panel:true 围栏；/panel clear 清空面板。' },
    ],
};
/** Shared command application: publish the default spec (and expand) or clear. */
function applyPanelCommand(sessionId, args) {
    const cmd = args.trim().toLowerCase();
    if (cmd === 'clear' || cmd === 'off' || cmd === 'close') {
        publishPanelSpec(sessionId, null);
        return;
    }
    publishPanelSpec(sessionId, DEFAULT_PANEL_SPEC);
    requestPanelExpand(sessionId);
}
/**
 * Build the command claim for one session (span CAS is handled by the input).
 * `sendInstruction` relays a /panel instruction to the model when the user
 * typed more than a bare command — otherwise the instruction would be
 * swallowed (the draft is cleared on submit) and the panel would never leave
 * its default content.
 */
function panelClaim(sessionId, sendInstruction) {
    return {
        token: '/panel',
        hint: '开启 GenUI 面板；/panel <指令> 让模型定制；/panel clear 清空',
        submit: async (args) => {
            const instruction = args.trim();
            if (instruction === '') {
                applyPanelCommand(sessionId, '');
            }
            else if (/^(clear|off|close)$/i.test(instruction)) {
                applyPanelCommand(sessionId, instruction);
            }
            else {
                // Instructed panel: show the default spec instantly for feedback,
                // then let the model replace it with the requested content.
                applyPanelCommand(sessionId, '');
                sendInstruction(sessionId, instruction);
            }
            // Success clears the draft without sending a message (the dock itself
            // is the feedback); no `text` so the input shows no notice either.
            return { kind: 'success' };
        },
    };
}
/**
 * The /panel source. Menu group `genui` under the '/' trigger; the panel
 * candidate claims the line so both the menu pick and a bare `/panel` enter
 * resolve to the same command. `matchEnter` is implemented so the command
 * works without opening the menu (leading-token adjudication), and it also
 * catches `/panel clear` style args.
 */
export function createPanelSlashSource(sendInstruction) {
    return {
        trigger: '/',
        name: 'genui',
        order: 60,
        candidates: async () => [{
                name: 'panel',
                description: '开启 GenUI 面板（/panel clear 清空；/panel <指令> 定制内容）',
                hint: '/panel',
            }],
        onPick({ session }) {
            return { claim: panelClaim(session.sessionId, sendInstruction) };
        },
        matchEnter: async (_session, line) => {
            if (!/^\/panel(?:\s|$)/.test(line.trim()))
                return undefined;
            return { claim: panelClaim(_session.sessionId, sendInstruction) };
        },
    };
}
//# sourceMappingURL=panel-command.js.map