/** Throws when `svg` carries script, event-handler attributes, or
 * `javascript:` URIs. Exported for tests; `renderMermaid` is the only caller
 * in production. */
export declare function assertSafeSvg(svg: string): void;
/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export declare function renderMermaid(code: string): Promise<string>;
//# sourceMappingURL=mermaid-lazy.d.ts.map