/**
 * Lazy three.js scene renderer. Imported only when a spec contains a
 * `scene3d` node, so three never enters the main chat bundle.
 *
 * Security: the model only supplies white-listed primitive shapes, numeric
 * transforms, and colors. No textures, no external URLs, no scripts, no
 * custom shaders — everything is geometry + material colors constructed
 * locally. The renderer mounts into a caller-owned container and returns a
 * disposer that tears down the WebGL context.
 */
import type { GenuiScene3D } from './spec.ts';
/**
 * Mount a GenUI 3D scene into `container`.
 * @param container - the DOM node to host the WebGL canvas.
 * @param scene - the declarative scene spec.
 * @returns a disposer that removes the renderer and its context.
 */
export declare function mountScene(container: HTMLElement, scene: GenuiScene3D): Promise<() => void>;
//# sourceMappingURL=scene3d-lazy.d.ts.map