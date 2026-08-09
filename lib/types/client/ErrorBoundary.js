import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Rendering error boundary: a component render failure inside one GenUI
 * block must never take down the whole chat surface (pre-2026-08-09 builds
 * crashed the entire conversation tree on a missing API). Every fence,
 * toolview card and panel body renders under this boundary; on error the
 * block degrades to a compact inline alert instead of unmounting the tree.
 * @module @deepseek-ai/dsh-genui/client
 */
import { Component } from 'react';
const fallbackStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 12px',
    margin: '4px 0',
    borderRadius: '8px',
    border: '1px solid rgba(127,127,127,0.35)',
    background: 'rgba(127,127,127,0.08)',
    color: 'inherit',
    fontSize: '12px',
    lineHeight: 1.5,
    fontFamily: 'inherit',
};
/**
 * Class boundary because function components cannot catch their own subtree
 * errors. `getDerivedStateFromError` flips to the fallback render; the error
 * itself is logged (and its message surfaced in the alert) so the user sees
 * a hint instead of a silent white region.
 */
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[dsh-genui] render failed:', error, info.componentStack ?? '');
    }
    render() {
        const { error } = this.state;
        if (error === null)
            return this.props.children;
        return (_jsxs("div", { style: fallbackStyle, role: "alert", "data-genui-error": true, children: [_jsxs("span", { style: { fontWeight: 600 }, children: ["\u26A0\uFE0F ", this.props.label ?? '此界面', "\u6E32\u67D3\u5931\u8D25\uFF08\u5DF2\u9694\u79BB\uFF0C\u4E0D\u5F71\u54CD\u5176\u4ED6\u5185\u5BB9\uFF09"] }), _jsx("span", { style: { opacity: 0.75, overflowWrap: 'anywhere' }, children: error.message })] }));
    }
}
//# sourceMappingURL=ErrorBoundary.js.map