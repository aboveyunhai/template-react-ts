import Phaser from "phaser";
import { Blob } from "./Blob";

type InitialConfigs = {
    bodyColor?: number;
    borderColor?: number;
};

export class Slime {
    scene: Phaser.Scene;
    blob: Blob;

    bodyColor: number = Phaser.Display.Color.HexStringToColor("#2d87d7").color;
    borderColor: number =
        Phaser.Display.Color.HexStringToColor("#1d49ce").color;

    // Eyes state
    private eyeAngle = 0; // current world-rotation of the eyes (radians)
    private eyeTargetAngle = 0; // desired angle based on motion/tilt
    private eyeIdleTimer = 0; // seconds until we relax fully upright
    private prevCentroid: Phaser.Math.Vector2 | null = null;
    private eyeVel = 0; // angular velocity (for spring-damper smoothing)
    private wanderPhase = 0; // for gentle idle wander
    private eyeAnchor: Phaser.Math.Vector2 | null = null; // smoothed anchor for eyes
    private eyeSideBias = 0; // -1 left, +1 right, 0 unknown
    private eyeLeanX = 0; // horizontal lean offset for both eyes (pixels)

    constructor(
        scene: Phaser.Scene,
        origin: Phaser.Math.Vector2,
        { bodyColor, borderColor }: InitialConfigs = {}
    ) {
        this.scene = scene;
        this.blob = new Blob(scene, origin, 16, 27, 1.5);
        if (bodyColor) this.bodyColor = bodyColor;
        if (borderColor) this.borderColor = borderColor;
    }

    update() {
        this.blob.update();

        // Update eye orientation toward movement/tilt, then relax toward upright
        const dt = (this.scene.game.loop as any).delta
            ? (this.scene.game.loop as any).delta / 1000
            : 1 / 60;

        const points = this.blob.points.map((p) => p.pos);
        if (points.length >= 3) {
            // Centroid and movement speed
            const centroid = this.getCentroid(points);
            const moved = this.prevCentroid
                ? Phaser.Math.Distance.Between(
                      centroid.x,
                      centroid.y,
                      this.prevCentroid.x,
                      this.prevCentroid.y
                  )
                : 0;

            // Compute bounding box to estimate overall blob size
            let minX = Number.POSITIVE_INFINITY,
                minY = Number.POSITIVE_INFINITY,
                maxX = Number.NEGATIVE_INFINITY,
                maxY = Number.NEGATIVE_INFINITY;
            for (const p of points) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            const radiusEstimate = 0.5 * Math.max(maxX - minX, maxY - minY);
            const lift = Phaser.Math.Clamp(radiusEstimate * 0.25, 6, 24);
            const anchorTarget = new Phaser.Math.Vector2(
                centroid.x,
                centroid.y - lift
            );
            // Smooth the anchor to avoid jitter as the blob moves
            if (!this.eyeAnchor) this.eyeAnchor = anchorTarget.clone();
            else this.eyeAnchor = this.eyeAnchor.lerp(anchorTarget, 0.18);

            // Drive eyes by centroid horizontal velocity only (prevents shape flip)
            const dx = this.prevCentroid ? centroid.x - this.prevCentroid.x : 0;
            const dy = this.prevCentroid ? centroid.y - this.prevCentroid.y : 0;
            const speed = Math.hypot(dx, dy);
            const nx = speed > 1e-4 ? dx / speed : 0; // left/right direction

            // Hysteresis based only on centroid speed
            const moveHigh = 3.0,
                moveLow = 1.2;
            const wasActive = this.eyeIdleTimer > 0;
            const isActiveHigh = moved > moveHigh;
            const isActiveLow = moved > moveLow;
            const isActive = isActiveHigh || (wasActive && isActiveLow);

            const maxTilt = 0.12; // ~±6.9°
            const tilt = Phaser.Math.Clamp(nx * maxTilt, -maxTilt, maxTilt);

            if (isActive) {
                this.eyeTargetAngle = tilt;
                this.eyeIdleTimer = 0.8;
                // Update side bias from horizontal direction
                if (nx > 0.2) this.eyeSideBias = 1;
                else if (nx < -0.2) this.eyeSideBias = -1;
            } else if (this.eyeIdleTimer <= 0) {
                // Relax to the last dominant side with a tiny wander
                if (this.eyeSideBias === 0) {
                    this.eyeSideBias = Math.sign(this.eyeAngle) || 1;
                }
                const rest = 0.09 * this.eyeSideBias; // ~5.1° to either side
                this.wanderPhase += dt * 0.3; // slower
                const wander = 0.008 * Math.sin(this.wanderPhase); // very small sway
                this.eyeTargetAngle = rest + wander;
            }

            // Horizontal lean of the eyes toward motion or last side
            const leanMax = Phaser.Math.Clamp(radiusEstimate * 0.25, 6, 24);
            let leanTarget = 0;
            if (isActive) {
                leanTarget = nx * leanMax;
            } else if (this.eyeIdleTimer <= 0) {
                leanTarget = this.eyeSideBias * (leanMax * 0.6);
            }
            // Smooth toward target; clamp interpolation factor to avoid jumps
            const lerpAmt = Phaser.Math.Clamp(
                1 - Math.pow(0.001, dt),
                0.05,
                0.2
            );
            this.eyeLeanX = Phaser.Math.Linear(
                this.eyeLeanX,
                leanTarget,
                lerpAmt
            );

            // Spring-damper smoothing for slow, steady motion
            const k = 3.2; // stiffness
            const c = 2 * Math.sqrt(k); // critical damping
            const acc =
                k * (this.eyeTargetAngle - this.eyeAngle) - c * this.eyeVel;
            this.eyeVel += acc * dt;
            this.eyeAngle += this.eyeVel * dt;

            // Clamp to safe range and avoid drift
            // Counter-clockwise
            this.eyeAngle = -Phaser.Math.Clamp(this.eyeAngle, -0.25, 0.25);
            this.eyeVel = Phaser.Math.Clamp(this.eyeVel, -2.0, 2.0);

            // Tick idle timer down
            this.eyeIdleTimer = Math.max(0, this.eyeIdleTimer - dt);

            this.prevCentroid = centroid;
            // store nothing else; orientation relies on smoothed tangent only
        }
    }

    render(g: Phaser.GameObjects.Graphics) {
        g.save();
        this.drawBody(g);
        // this.drawHead(g);
        this.drawEyes(g);
        g.restore();
    }

    private drawBody(g: Phaser.GameObjects.Graphics) {
        this.blob.draw(g, {
            bodyColor: this.bodyColor,
            borderColor: this.borderColor,
            opacity: 0.8,
        });
    }

    // private drawHead(g: Phaser.GameObjects.Graphics) {
    //     const points = this.blob.points.map((p) => p.pos);
    //     const top = points[0];
    //     const topNormal = points[2]
    //         .clone()
    //         .subtract(points[points.length - 2])
    //         .angle();

    //     g.save();
    //     g.translateCanvas(top.x, top.y);
    //     g.rotateCanvas(topNormal);

    //     // Head base
    //     g.lineStyle(7, this.borderColor, 1);
    //     g.fillStyle(this.bodyColor, 1);
    //     // Approximate arcs with circle segments
    //     g.strokeCircle(0, 75, 125);
    //     g.fillCircle(0, 75, 122);

    //     // Eye sockets
    //     g.lineStyle(7, this.borderColor, 1);
    //     g.beginPath();
    //     g.arc(-75, -10, 37.5, -Math.PI - Math.PI / 4.6, -Math.PI / 5.6);
    //     g.strokePath();
    //     g.beginPath();
    //     g.arc(75, -10, 37.5, -Math.PI + Math.PI / 5.6, Math.PI / 4.6);
    //     g.strokePath();
    //     g.fillStyle(this.bodyColor, 1);
    //     g.fillCircle(-75, -10, 35);
    //     g.fillCircle(75, -10, 35);

    //     // Eyes
    //     g.lineStyle(4, 0x000000, 1);
    //     g.fillStyle(0xf0995b, 1);
    //     g.fillCircle(-75, -10, 24);
    //     g.fillCircle(75, -10, 24);

    //     // Pupils (ellipses approximated with scaled circles via canvas save/scale)
    //     g.save();
    //     g.translateCanvas(-75, -10);
    //     g.rotateCanvas(-Math.PI / 24);
    //     g.fillStyle(0x000000, 1);
    //     g.fillEllipse(0, 0, 32, 18);
    //     g.restore();

    //     g.save();
    //     g.translateCanvas(75, -10);
    //     g.rotateCanvas(Math.PI / 24);
    //     g.fillStyle(0x000000, 1);
    //     g.fillEllipse(0, 0, 32, 18);
    //     g.restore();

    //     // Chin
    //     // g.lineStyle(7, 0x000000, 1);
    //     // g.beginPath();
    //     // g.arc(0, 80, 46, Math.PI / 8, Math.PI - Math.PI / 8);
    //     // g.strokePath();

    //     // Mouth (bezier approximated with line segments)
    //     g.lineStyle(5, 0x000000, 1);
    //     g.beginPath();
    //     g.moveTo(-90, 40);
    //     g.lineTo(-10, 25);
    //     g.lineTo(10, 25);
    //     g.lineTo(90, 40);
    //     g.strokePath();

    //     // Nostrils
    //     // g.save();
    //     // g.translateCanvas(-9, 5);
    //     // g.rotateCanvas(Math.PI / 6);
    //     // g.fillStyle(0x000000, 1);
    //     // g.fillEllipse(0, 0, 2, 5);
    //     // g.restore();
    //     // g.save();
    //     // g.translateCanvas(9, 5);
    //     // g.rotateCanvas(-Math.PI / 6);
    //     // g.fillStyle(0x000000, 1);
    //     // g.fillEllipse(0, 0, 2, 5);
    //     // g.restore();
    // }

    private drawEyes(g: Phaser.GameObjects.Graphics) {
        const points = this.blob.points.map((p) => p.pos);
        if (points.length < 3) return;

        // Recompute bounds for sizing
        let minX = Number.POSITIVE_INFINITY,
            minY = Number.POSITIVE_INFINITY,
            maxX = Number.NEGATIVE_INFINITY,
            maxY = Number.NEGATIVE_INFINITY;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const approxRadius = Math.max(
            12,
            0.5 * Math.max(maxX - minX, maxY - minY)
        );

        // Eye geometry (rectangle sticks)
        const scale = 1.0; // this.eyeScale;
        const h = Phaser.Math.Clamp(approxRadius * 0.4 * scale, 12, 96); // height
        const w = Phaser.Math.Clamp(approxRadius * 0.11 * scale, 4, 28); // width
        const sep = Phaser.Math.Clamp(approxRadius * 0.16 * scale, 10, 72); // half spacing

        // Stable anchor: smoothed centroid-lift computed in update()
        const centroid = this.getCentroid(points);
        const anchor = this.eyeAnchor ?? centroid;
        const baseX = anchor.x + this.eyeLeanX;
        const left = new Phaser.Math.Vector2(baseX - sep, anchor.y);
        const right = new Phaser.Math.Vector2(baseX + sep, anchor.y);

        // Draw one eye helper
        const drawEye = (cx: number, cy: number) => {
            g.save();
            g.translateCanvas(cx, cy);
            // Rotate by current eye angle (returns to 0/upright when idle)
            g.rotateCanvas(this.eyeAngle);

            // Black fill with thin white stroke
            const corner = Math.min(w, h) * 0.35; // rounded corner radius
            g.fillStyle(0xffffff, 1);
            g.fillRoundedRect(-w / 2, -h / 2, w, h, corner);
            g.lineStyle(1, 0xffffff, 1);
            g.strokeRoundedRect(-w / 2, -h / 2, w, h, corner);

            // Small white curve inside (specular-ish)
            g.lineStyle(1, 0xffffff, 0.9);
            g.beginPath();
            const r = Math.min(w * 0.55, h * 0.35);
            // Straight highlight line (replaces previous arc)
            //  g.arc(0, h * 0.25, r, Math.PI * 0.9, Math.PI * 0.1);
            const a0 = Math.PI * 0.9;
            const a1 = Math.PI * 0.1;
            const hx = 0; // highlight center x (relative)
            const hy = h * 0.25; // highlight center y (relative)
            g.moveTo(hx + r * Math.cos(a0), hy + r * Math.sin(a0));
            g.lineTo(hx + r * Math.cos(a1), hy + r * Math.sin(a1));
            g.strokePath();

            g.restore();
        };

        drawEye(left.x, left.y);
        drawEye(right.x, right.y);
    }

    private getCentroid(pts: Phaser.Math.Vector2[]): Phaser.Math.Vector2 {
        let x = 0,
            y = 0;
        for (const p of pts) {
            x += p.x;
            y += p.y;
        }
        const n = Math.max(1, pts.length);
        return new Phaser.Math.Vector2(x / n, y / n);
    }
}
