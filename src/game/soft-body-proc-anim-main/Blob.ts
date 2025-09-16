import Phaser from "phaser";

// Ensure a reusable radial alpha gradient canvas texture exists.
// Alpha is 0 at center and 1 at the border; color is white so it can be tinted.
function ensureRadialGradientTexture(
    scene: Phaser.Scene,
    key = "blob-radial-gradient",
    size = 256,
    startColor: number,
    endColor: number
) {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    if (!ctx) return;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // Transparent center to opaque edge
    grd.addColorStop(
        0,
        `rgba(${(startColor >> 16) & 0xff}, ${(startColor >> 8) & 0xff}, ${
            startColor & 0xff
        }, 0)`
    );
    grd.addColorStop(
        1,
        `rgba(${(endColor >> 16) & 0xff}, ${(endColor >> 8) & 0xff}, ${
            endColor & 0xff
        }, 1)`
    );
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
}

// A point making up the blob boundary, using Verlet integration
class BlobPoint {
    pos: Phaser.Math.Vector2;
    ppos: Phaser.Math.Vector2; // previous position

    displacement: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0);
    displacementWeight = 0;

    constructor(pos: Phaser.Math.Vector2) {
        this.pos = pos.clone();
        this.ppos = pos.clone();
    }

    verletIntegrate(damping = 0.99) {
        const temp = this.pos.clone();
        const vel = this.pos.clone().subtract(this.ppos).scale(damping);
        this.pos.add(vel);
        this.ppos = temp;
    }

    applyGravity(g = 1) {
        this.pos.y += g;
    }

    accumulateDisplacement(offset: Phaser.Math.Vector2) {
        this.displacement.add(offset);
        this.displacementWeight += 1;
    }

    applyDisplacement() {
        if (this.displacementWeight > 0) {
            this.displacement.scale(1 / this.displacementWeight);
            this.pos.add(this.displacement);
            this.displacement.set(0, 0);
            this.displacementWeight = 0;
        }
    }

    keepInBounds(width: number, height: number) {
        this.pos.x = Phaser.Math.Clamp(this.pos.x, 0, width);
        this.pos.y = Phaser.Math.Clamp(this.pos.y, 0, height);
    }

    // collideWithMatterBodies(scene: Phaser.Scene) {
    //     if (!scene.matter?.world) return;

    //     // Access Matter.js from Phaser plugin and get all world bodies
    //     const matterPlugin: any = (scene as any).matter;
    //     const MatterLib: any =
    //         (Phaser as any).Physics?.Matter?.Matter || matterPlugin?.matter;
    //     if (!MatterLib) return;

    //     const engine = matterPlugin.world.engine;
    //     const bodies: any[] = engine.world.bodies;

    //     // First: point-in-body test using Matter.Query
    //     const hits = MatterLib.Query.point(bodies, this.pos as any) as any[];
    //     for (const hit of hits) {
    //         const body = hit as any;
    //         if (!body.isStatic) continue;

    //         if (body.circleRadius) {
    //             // Push out from circle using true center / radius from Matter
    //             const center = new Phaser.Math.Vector2(
    //                 body.position.x,
    //                 body.position.y
    //             );
    //             let diff = this.pos.clone().subtract(center);
    //             const dist = diff.length();
    //             if (dist === 0) diff = new Phaser.Math.Vector2(1, 0);
    //             this.pos = center
    //                 .clone()
    //                 .add(diff.setLength(body.circleRadius + 1));
    //             return; // resolved for this point
    //         } else {
    //             // Assume axis-aligned rectangle (as created via this.matter.add.rectangle without rotation)
    //             const b = body.bounds;
    //             const left = Math.abs(this.pos.x - b.min.x);
    //             const right = Math.abs(b.max.x - this.pos.x);
    //             const top = Math.abs(this.pos.y - b.min.y);
    //             const bottom = Math.abs(b.max.y - this.pos.y);
    //             const min = Math.min(left, right, top, bottom);
    //             const pad = 1;
    //             if (min === left) this.pos.x = b.min.x - pad;
    //             else if (min === right) this.pos.x = b.max.x + pad;
    //             else if (min === top) this.pos.y = b.min.y - pad;
    //             else this.pos.y = b.max.y + pad;
    //             return;
    //         }
    //     }

    //     // Second: CCD using a ray from previous to current position
    //     const move = this.pos.clone().subtract(this.ppos);
    //     const len = move.length();
    //     if (len > 0.5) {
    //         const rayHits = MatterLib.Query.ray(
    //             bodies,
    //             this.ppos as any,
    //             this.pos as any,
    //             1
    //         ) as any[];
    //         for (const rh of rayHits) {
    //             const body = rh.body as any;
    //             if (!body?.isStatic) continue;
    //             // Compute hit point (prefer rh.point from Matter.js)
    //             let hitPoint: Phaser.Math.Vector2;
    //             if (rh.point) {
    //                 hitPoint = new Phaser.Math.Vector2(rh.point.x, rh.point.y);
    //             } else {
    //                 // Fallback: clamp to start point if no point provided
    //                 hitPoint = this.ppos.clone();
    //             }

    //             if (body.circleRadius) {
    //                 const center = new Phaser.Math.Vector2(
    //                     body.position.x,
    //                     body.position.y
    //                 );
    //                 let n = hitPoint.clone().subtract(center);
    //                 if (n.lengthSq() === 0) n = new Phaser.Math.Vector2(0, -1);
    //                 n.normalize();
    //                 this.pos = center
    //                     .clone()
    //                     .add(n.scale(body.circleRadius + 1));
    //                 return;
    //             } else {
    //                 // AABB normal from closest side
    //                 const b = body.bounds;
    //                 const left = Math.abs(hitPoint.x - b.min.x);
    //                 const right = Math.abs(b.max.x - hitPoint.x);
    //                 const top = Math.abs(hitPoint.y - b.min.y);
    //                 const bottom = Math.abs(hitPoint.y - b.max.y);
    //                 const min = Math.min(left, right, top, bottom);
    //                 let n = new Phaser.Math.Vector2(0, 0);
    //                 if (min === left) n.set(-1, 0);
    //                 else if (min === right) n.set(1, 0);
    //                 else if (min === top) n.set(0, -1);
    //                 else n.set(0, 1);
    //                 this.pos = hitPoint.clone().add(n.scale(2));
    //                 return;
    //             }
    //         }
    //     }
    // }

    collideWithPointer(pointerWorld: Phaser.Math.Vector2 | null) {
        if (!pointerWorld) return;
        const dist = Phaser.Math.Distance.Between(
            this.pos.x,
            this.pos.y,
            pointerWorld.x,
            pointerWorld.y
        );
        const radius = 100;
        if (dist < radius) {
            const diff = this.pos
                .clone()
                .subtract(pointerWorld)
                .setLength(radius);
            this.pos = pointerWorld.clone().add(diff);
        }
    }
}

export class Blob {
    scene: Phaser.Scene;
    points: BlobPoint[] = [];

    radius: number;
    area: number;
    circumference: number;
    chordLength: number;

    // Rendering helpers for gradient fill
    private gradientImage?: Phaser.GameObjects.Image;
    private maskGraphics?: Phaser.GameObjects.Graphics;
    private geometryMask?: Phaser.Display.Masks.GeometryMask;
    private readonly gradientKey = "blob-radial-gradient";
    private readonly gradientBaseSize = 256; // px

    constructor(
        scene: Phaser.Scene,
        origin: Phaser.Math.Vector2,
        numPoints: number,
        radius: number,
        puffiness: number
    ) {
        this.scene = scene;
        this.radius = radius;
        this.area = radius * radius * Math.PI * puffiness;
        this.circumference = radius * Math.PI * 2;
        this.chordLength = this.circumference / numPoints;

        for (let i = 0; i < numPoints; i++) {
            const angle = (Math.PI * 2 * i) / numPoints - Math.PI / 2;
            const offset = new Phaser.Math.Vector2(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius
            );
            this.points.push(new BlobPoint(origin.clone().add(offset)));
        }
    }

    private getArea(): number {
        let area = 0;
        for (let i = 0; i < this.points.length; i++) {
            const cur = this.points[i].pos;
            const next = this.points[(i + 1) % this.points.length].pos;
            area += ((cur.x - next.x) * (cur.y + next.y)) / 2;
        }
        return area;
    }

    update(iterations = 10) {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const pointer = this.scene.input.activePointer;
        const cam = this.scene.cameras.main;
        const pointerWorld = pointer.isDown
            ? cam.getWorldPoint(pointer.x, pointer.y)
            : null;

        // Verlet step and gravity
        for (const p of this.points) {
            p.verletIntegrate(0.99);
            p.applyGravity(1);
        }

        for (let j = 0; j < iterations; j++) {
            // Distance constraints along the ring
            for (let i = 0; i < this.points.length; i++) {
                const cur = this.points[i];
                const next = this.points[(i + 1) % this.points.length];
                const diff = next.pos.clone().subtract(cur.pos);
                const mag = diff.length();
                if (mag > this.chordLength) {
                    const error = (mag - this.chordLength) / 2;
                    const offset = diff.clone().setLength(error);
                    const negOffset = offset.clone().scale(-1);
                    cur.accumulateDisplacement(offset);
                    next.accumulateDisplacement(negOffset);
                }
            }

            // Dilation to preserve area
            const error = this.area - this.getArea();
            const offset = error / this.circumference;
            for (let i = 0; i < this.points.length; i++) {
                const prev =
                    this.points[
                        (i - 1 + this.points.length) % this.points.length
                    ];
                const cur = this.points[i];
                const next = this.points[(i + 1) % this.points.length];
                const secant = next.pos.clone().subtract(prev.pos);
                const normal = secant
                    .clone()
                    .rotate(-Math.PI / 2)
                    .setLength(offset);
                cur.accumulateDisplacement(normal);
            }

            // Apply accumulated displacement
            for (const p of this.points) {
                p.applyDisplacement();
            }

            // Collisions
            for (const p of this.points) {
                p.keepInBounds(width, height);
                // p.collideWithMatterBodies(this.scene);
                if (pointerWorld) p.collideWithPointer(pointerWorld);
            }
        }
    }

    // Draw filled smooth shape approximating Processing's curveVertex body
    draw(
        graphics: Phaser.GameObjects.Graphics,
        {
            bodyColor,
            borderColor,
            opacity,
        }: {
            bodyColor: number;
            borderColor: number;
            opacity: number;
        }
    ) {
        if (this.points.length < 3) return;

        // Build a closed centripetal Catmull–Rom sampling around the ring
        const n = this.points.length;
        const controls: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < n; i++) controls.push(this.points[i].pos.clone());

        const alpha = 0.5; // centripetal to avoid loops/self-intersections
        const samplesPerSegment = 12; // higher = smoother
        const samplePoints: Phaser.Math.Vector2[] = [];

        const catmullCentripetal = (
            p0: Phaser.Math.Vector2,
            p1: Phaser.Math.Vector2,
            p2: Phaser.Math.Vector2,
            p3: Phaser.Math.Vector2,
            t: number
        ) => {
            // Parametrize distances
            const pow = (v: number, a: number) => Math.pow(v, a);
            const d01 = Math.sqrt(p0.distanceSq(p1));
            const d12 = Math.sqrt(p1.distanceSq(p2));
            const d23 = Math.sqrt(p2.distanceSq(p3));
            const t0 = 0;
            const t1 = t0 + pow(d01, alpha);
            const t2 = t1 + pow(d12, alpha);
            const t3 = t2 + pow(d23, alpha);
            const tt = t1 + (t2 - t1) * t; // t in [t1, t2]

            const lerp = (
                a: Phaser.Math.Vector2,
                b: Phaser.Math.Vector2,
                u: number
            ) =>
                new Phaser.Math.Vector2(
                    a.x + (b.x - a.x) * u,
                    a.y + (b.y - a.y) * u
                );

            const A1 = lerp(p0, p1, (tt - t0) / (t1 - t0 || 1));
            const A2 = lerp(p1, p2, (tt - t1) / (t2 - t1 || 1));
            const A3 = lerp(p2, p3, (tt - t2) / (t3 - t2 || 1));

            const B1 = lerp(A1, A2, (tt - t0) / (t2 - t0 || 1));
            const B2 = lerp(A2, A3, (tt - t1) / (t3 - t1 || 1));

            const C = lerp(B1, B2, (tt - t1) / (t2 - t1 || 1));
            return C;
        };

        for (let i = 0; i < n; i++) {
            const p0 = controls[(i - 1 + n) % n];
            const p1 = controls[i];
            const p2 = controls[(i + 1) % n];
            const p3 = controls[(i + 2) % n];
            for (let s = 0; s < samplesPerSegment; s++) {
                const t = s / samplesPerSegment; // [0,1)
                samplePoints.push(catmullCentripetal(p0, p1, p2, p3, t));
            }
        }
        // Append start point at the end so the implicit fill close is zero-length
        if (samplePoints.length > 0) {
            samplePoints.push(samplePoints[0].clone());
        }

        // Compute centroid and approximate radius for positioning the gradient
        let cx = 0;
        let cy = 0;
        for (const p of samplePoints) {
            cx += p.x;
            cy += p.y;
        }
        cx /= samplePoints.length;
        cy /= samplePoints.length;
        let maxR = 0;
        for (const p of samplePoints) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxR) maxR = d;
        }

        // Prepare gradient texture and objects lazily
        // Use the main camera's background color if available; fall back to bodyColor.
        // ScenePlugin (this.scene.scene) doesn't expose backgroundColor in some Phaser typings,
        // so inspect the camera and cast to any to access the color safely.
        ensureRadialGradientTexture(
            this.scene,
            this.gradientKey,
            this.gradientBaseSize,
            borderColor,
            this.scene.cameras.main.backgroundColor.color || bodyColor
        );
        if (!this.gradientImage) {
            this.gradientImage = this.scene.add
                .image(cx, cy, this.gradientKey)
                .setOrigin(0.5);
        }
        if (!this.maskGraphics) {
            this.maskGraphics = this.scene.add.graphics();
            this.maskGraphics.setVisible(false);
            this.geometryMask = this.maskGraphics.createGeometryMask();
            this.gradientImage!.setMask(this.geometryMask!);
        }

        // Update mask geometry to match blob shape
        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff, 1);
        this.maskGraphics.beginPath();
        this.maskGraphics.moveTo(samplePoints[0].x, samplePoints[0].y);
        for (let i = 1; i < samplePoints.length; i++) {
            this.maskGraphics.lineTo(samplePoints[i].x, samplePoints[i].y);
        }
        this.maskGraphics.fillPath();

        // Position, scale, tint gradient sprite and place it below the stroke
        const diameter = Math.max(1, maxR * 2);
        const scale = diameter / this.gradientBaseSize;
        this.gradientImage
            .setPosition(cx, cy)
            .setScale(scale)
            .setTint(bodyColor)
            .setAlpha(opacity)
            .setDepth((graphics as any).depth - 1 || -1);

        // Stroke: draw the same loop without explicit close
        graphics.lineStyle(2.5, borderColor, 0.9);
        graphics.beginPath();
        graphics.moveTo(samplePoints[0].x, samplePoints[0].y);
        for (let i = 1; i < samplePoints.length; i++) {
            graphics.lineTo(samplePoints[i].x, samplePoints[i].y);
        }
        graphics.strokePath();
    }
}

export { BlobPoint };
