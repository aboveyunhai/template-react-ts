import Phaser from "phaser";

// Create a pre-rendered pixel-art styled "sea wheat" background as a single sprite
// This does not interact with gameplay; it's a static image drawn behind everything.
// The style aims to feel like silhouetted sea plants with subtle color bands.
export function createSeawheatBackground(
    scene: Phaser.Scene,
    opts: { key?: string; depth?: number; alpha?: number } = {}
): Phaser.GameObjects.Image {
    const key = opts.key ?? "bg-seawheat";
    const depth = opts.depth ?? -100; // behind gameplay
    const alpha = Phaser.Math.Clamp(opts.alpha ?? 0.35, 0, 1);

    const w = Math.max(1, scene.scale.width);
    const h = 50;

    // Recreate safely on hot-reload
    if (scene.textures.exists(key)) scene.textures.remove(key);

    const g = scene.make.graphics({ x: 0, y: 0 });

    // Transparent canvas; draw layered stalks from darker back to lighter front
    const backColors = [0x0e1b22, 0x132430, 0x182d3a];
    const midColors = [0x1a3644, 0x214250, 0x274b59];
    const frontColors = [0x2a5666, 0x2d5f70, 0x306979];

    // Helper to draw a stalk as stacked small rectangles to keep a pixel-art feel
    const drawStalk = (
        baseX: number,
        baseY: number,
        height: number,
        col: number,
        amp: number,
        segH: number,
        segW: number,
        phase: number
    ) => {
        g.fillStyle(col, 1);
        const steps = Math.max(4, Math.floor(height / segH));
        for (let i = 0; i < steps; i++) {
            const y = baseY - i * segH;
            const t = i / steps;
            // Gentle lateral sway over height
            const off = Math.sin(phase + t * 4.0) * amp * (0.6 + 0.4 * t);
            // Slight taper toward the top
            const wMul = 1.0 - 0.5 * t;
            const sw = Math.max(1, Math.floor(segW * wMul));
            const x = Math.floor(baseX + off - sw / 2);
            const yy = Math.floor(y - segH);
            g.fillRect(x, yy, sw, segH);
        }
        // Simple seed head at the top
        const headW = Math.max(2, Math.floor(segW * 0.9));
        g.fillRect(
            Math.floor(baseX - headW / 2),
            Math.floor(baseY - height - segH * 1.5),
            headW,
            Math.max(2, Math.floor(segH * 0.8))
        );
    };

    const drawLayer = (
        count: number,
        colors: number[],
        amp: number,
        segH: number,
        segW: number,
        heightMin: number,
        heightMax: number,
        yBaseOffset: number,
        jitter: number
    ) => {
        const baseY = h - yBaseOffset;
        for (let i = 0; i < count; i++) {
            const x = Math.floor(
                (i + 0.5) * (w / count) + Phaser.Math.Between(-jitter, jitter)
            );
            const col = colors[i % colors.length];
            const height = Phaser.Math.Between(heightMin, heightMax);
            const phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
            drawStalk(x, baseY, height, col, amp, segH, segW, phase);
        }
    };

    // Back layer: tall, thin, very dark
    const startPosition = scene.scale.height - h;
    drawLayer(
        18,
        backColors,
        6,
        6,
        3,
        Math.floor(h * 0.35),
        Math.floor(h * 0.55),
        6,
        18
    );
    // Mid layer: medium height/width
    drawLayer(
        14,
        midColors,
        9,
        7,
        4,
        Math.floor(h * 0.28),
        Math.floor(h * 0.46),
        4,
        20
    );
    // Front layer: shorter but thicker and slightly brighter
    drawLayer(
        12,
        frontColors,
        12,
        8,
        5,
        Math.floor(h * 0.22),
        Math.floor(h * 0.36),
        2,
        22
    );

    // Ground silhouette band to anchor the plants
    g.fillStyle(0x0b1419, 1);
    g.fillRect(0, Math.floor(h), w, 0);

    g.generateTexture(key, w, h);
    g.destroy();

    // Place the image so its top aligns to startPosition and bottom meets scene bottom
    const img = scene.add.image(w / 2, startPosition, key);
    img.setOrigin(0.5, 0); // top-aligned
    img.setAlpha(alpha);
    img.setDepth(depth);
    return img;
}
