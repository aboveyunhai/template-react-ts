import Phaser from 'phaser';

/**
 * A simple soft-body (mass-spring + volume preservation + verlet integration) "slime".
 * Layout: center point + N radial perimeter points connected by springs forming a ring.
 * Includes basic continuous collision detection (swept AABB against container) to prevent tunneling.
 */
export interface SlimeOptions {
	segments?: number;              // number of points around the perimeter
	radius?: number;                // rest radius
	stiffness?: number;             // spring stiffness (0..1)
	radialStiffness?: number;       // stiffness for center-to-perimeter springs
	volumePreservation?: number;    // 0..1 strength of volume maintenance
	damping?: number;               // velocity damping (air resistance)
	gravity?: Phaser.Math.Vector2;  // gravity acceleration (px/s^2)
	maxSubStep?: number;            // max movement per sub-step for CCD
	restitution?: number;           // bounciness on container walls
	viscosity?: number;             // 0..1 multiplier on damping/force spread
}

interface Particle {
	pos: Phaser.Math.Vector2;
	prev: Phaser.Math.Vector2; // previous position for verlet
	acc: Phaser.Math.Vector2;  // accumulated acceleration for external forces
}

interface Spring { a: number; b: number; rest: number; stiffness: number; }

export class SlimeSoftBody {
	private scene: Phaser.Scene;
	private particles: Particle[] = [];
	private springs: Spring[] = [];
	private graphics: Phaser.GameObjects.Graphics;
	private opts: Required<SlimeOptions>;
	private volume0: number = 0;
	private container: Phaser.Geom.Rectangle;
	private obstacles: Phaser.Geom.Polygon[] = [];
	// scratch vectors removed (not currently used)
	private inputForce = new Phaser.Math.Vector2();
	private draggingTarget?: Phaser.Math.Vector2;

	constructor(scene: Phaser.Scene, x: number, y: number, container: Phaser.Geom.Rectangle, options: SlimeOptions = {}) {
		this.scene = scene;
		this.container = container;
		const defaults: Required<SlimeOptions> = {
			segments: 16,
			radius: 120,
			stiffness: 0.35,
			radialStiffness: 0.55,
			volumePreservation: 0.4,
			damping: 0.98,
			gravity: new Phaser.Math.Vector2(0, 900),
			maxSubStep: 12, // max distance per substep
			restitution: 0.2,
			viscosity: 0.5
		};
		this.opts = { ...defaults, ...options };

		this.createParticles(x, y);
		this.createSprings();
		this.volume0 = this.computeArea();

		this.graphics = scene.add.graphics();
		this.graphics.setDepth(10);
	}

	setInputForce(force: Phaser.Math.Vector2) { this.inputForce.copy(force); }

	/** Start dragging the slime's center to the given world position */
	startDrag(x: number, y: number) {
		if (!this.draggingTarget) this.draggingTarget = new Phaser.Math.Vector2();
		this.draggingTarget.set(x, y);
	}

	/** Update current drag target (no-op if not dragging) */
	dragTo(x: number, y: number) {
		if (!this.draggingTarget) return;
		this.draggingTarget.set(x, y);
	}

	/** Stop dragging */
	stopDrag() { this.draggingTarget = undefined; }

	/** Whether the slime is currently being dragged */
	isDragging(): boolean { return !!this.draggingTarget; }

	/** Test whether a world point lies inside the current slime polygon */
	containsPoint(x: number, y: number): boolean {
		if (this.particles.length <= 1) return false;
		const pts = this.particles.slice(1).map(p => ({ x: p.pos.x, y: p.pos.y }));
		const poly = new Phaser.Geom.Polygon(pts as any);
		return Phaser.Geom.Polygon.Contains(poly, x, y);
	}

	addObstacle(poly: Phaser.Geom.Polygon) { this.obstacles.push(poly); }

	private createParticles(x: number, y: number) {
		// center
	this.particles.push(this.makeParticle(x, y));
		for (let i = 0; i < this.opts.segments; i++) {
			const ang = (i / this.opts.segments) * Math.PI * 2;
			const px = x + Math.cos(ang) * this.opts.radius;
			const py = y + Math.sin(ang) * this.opts.radius;
			this.particles.push(this.makeParticle(px, py));
		}
	}

	private makeParticle(x: number, y: number): Particle {
		return { pos: new Phaser.Math.Vector2(x, y), prev: new Phaser.Math.Vector2(x, y), acc: new Phaser.Math.Vector2() };
	}

	private createSprings() {
		// center to perimeter
		for (let i = 1; i < this.particles.length; i++) {
			const rest = Phaser.Math.Distance.BetweenPoints(this.particles[0].pos, this.particles[i].pos);
			this.springs.push({ a: 0, b: i, rest, stiffness: this.opts.radialStiffness });
		}
		// ring springs (structural + bending via next-nearest neighbor)
		const segs = this.opts.segments;
		for (let i = 0; i < segs; i++) {
			const a = 1 + i;
			const b = 1 + ((i + 1) % segs);
			const rest = Phaser.Math.Distance.BetweenPoints(this.particles[a].pos, this.particles[b].pos);
			this.springs.push({ a, b, rest, stiffness: this.opts.stiffness });
		}
		// bending (skip one)
		for (let i = 0; i < segs; i++) {
			const a = 1 + i;
			const b = 1 + ((i + 2) % segs);
			const rest = Phaser.Math.Distance.BetweenPoints(this.particles[a].pos, this.particles[b].pos);
			this.springs.push({ a, b, rest, stiffness: this.opts.stiffness * 0.5 });
		}
	}

	/** External impulse to entire body */
	applyImpulse(ix: number, iy: number) {
		for (const p of this.particles) {
			const vel = p.pos.clone().subtract(p.prev);
			vel.x += ix; vel.y += iy;
			p.prev = p.pos.clone().subtract(vel);
		}
	}

	private integrate(dt: number) {
		const dt2 = dt * dt;
		for (const p of this.particles) {
			// accumulate gravity + input force (apply input only to center to propagate)
			let overrideNext: Phaser.Math.Vector2 | undefined;
			if (p === this.particles[0]) {
				p.acc.add(this.inputForce);
				// if dragging, compute a desired next position and let CCD resolve collisions
				if (this.draggingTarget) {
					const toTarget = this.draggingTarget.clone().subtract(p.pos);
					const followStrength = 12; // larger = stiffer follow
					const desired = p.pos.clone().add(toTarget.scale(Math.min(1, followStrength * dt)));
					overrideNext = desired;
				}
			}
			p.acc.add(this.opts.gravity.clone().scale(1 - this.opts.viscosity * 0.2));

			const pos = p.pos;
			const prev = p.prev;
			const velocity = pos.clone().subtract(prev).scale(this.opts.damping);
			const next = overrideNext ? overrideNext : pos.clone().add(velocity).add(p.acc.clone().scale(dt2));

			// CCD: subdivide movement if too large
			const disp = next.clone().subtract(pos);
			const steps = Math.max(1, Math.ceil(disp.length() / this.opts.maxSubStep));
			let cur = pos.clone();
			let prevSeg = pos.clone();
			for (let s = 0; s < steps; s++) {
				const segTarget = pos.clone().add(disp.clone().scale((s + 1) / steps));
				// sweep vs container walls
				cur = this.sweepAABB(prevSeg, segTarget);
				// polygon obstacle resolution
				cur = this.resolveObstacles(prevSeg, cur);
				prevSeg.copy(cur);
			}
			p.prev.copy(pos); // store previous
			p.pos.copy(cur);
			// clear acc
			p.acc.set(0, 0);
		}
	}

	private sweepAABB(_from: Phaser.Math.Vector2, to: Phaser.Math.Vector2): Phaser.Math.Vector2 {
		// Swept segment vs each side of container, clamp and reflect if crossing
		const result = to.clone();
		const rect = this.container;
		// left
		if (result.x < rect.left) {
			result.x = rect.left;
		}
		if (result.x > rect.right) {
			result.x = rect.right;
		}
		if (result.y < rect.top) {
			result.y = rect.top;
		}
		if (result.y > rect.bottom) {
			result.y = rect.bottom;
		}
		return result;
	}

	private resolveObstacles(_from: Phaser.Math.Vector2, to: Phaser.Math.Vector2): Phaser.Math.Vector2 {
		if (!this.obstacles.length) return to;
		const out = to.clone();
		for (const poly of this.obstacles) {
			if (Phaser.Geom.Polygon.Contains(poly, out.x, out.y)) {
				// push out along minimal penetration direction (per-edge normals)
				let bestPush = new Phaser.Math.Vector2();
				let bestDepth = -Infinity;
				const pts = poly.points.map(p => new Phaser.Math.Vector2(p.x, p.y));
				for (let i = 0; i < pts.length; i++) {
					const a = pts[i];
					const b = pts[(i + 1) % pts.length];
					const edge = new Phaser.Math.Vector2(b.x - a.x, b.y - a.y);
					const normal = new Phaser.Math.Vector2(-edge.y, edge.x).normalize(); // outward? we guess
					// signed distance from point to line
					const dist = normal.dot(new Phaser.Math.Vector2(out.x - a.x, out.y - a.y));
					if (dist > bestDepth) {
						bestDepth = dist;
						bestPush = normal.clone();
					}
				}
				out.subtract(bestPush.scale(bestDepth + 0.5));
			}
		}
		return out;
	}

	private satisfySprings(iterations: number) {
		for (let it = 0; it < iterations; it++) {
			for (const s of this.springs) {
				const pa = this.particles[s.a].pos;
				const pb = this.particles[s.b].pos;
				const delta = pb.clone().subtract(pa);
				const dist = Math.max(0.0001, delta.length());
				const diff = (dist - s.rest) / dist;
				const correction = delta.scale(0.5 * s.stiffness * diff);
				pa.add(correction);
				pb.subtract(correction);
			}
		}
	}

	private preserveVolume() {
		const currentArea = this.computeArea();
		if (currentArea === 0) return;
		const ratio = (this.volume0 - currentArea) / currentArea; // positive if we shrunk
		const strength = this.opts.volumePreservation;
		const center = this.particles[0].pos;
		for (let i = 1; i < this.particles.length; i++) {
			const p = this.particles[i].pos;
			const dir = p.clone().subtract(center);
			p.add(dir.scale(ratio * strength * 0.02));
		}
	}

	private computeArea(): number {
		// polygon area (center + perimeter fan)
		let area = 0;
		const c = this.particles[0].pos;
		for (let i = 1; i <= this.opts.segments; i++) {
			const a = this.particles[i].pos;
			const b = this.particles[1 + (i % this.opts.segments)].pos;
			area += (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
		}
		return Math.abs(area) * 0.5;
	}

	update(dt: number) {
	// reference scene time scale to mark scene as used
	if (this.scene.sys.isPaused()) return;
		if (dt > 0.05) dt = 0.05; // clamp large frame gaps
		this.integrate(dt);
		this.satisfySprings(4);
		this.preserveVolume();
		this.constrainToContainer();
		this.render();
		// reset input force gradually (impulse-like)
		this.inputForce.scale(0.85);
	}

	private constrainToContainer() {
		const rect = this.container;
		for (const p of this.particles) {
			if (p.pos.x < rect.left) p.pos.x = rect.left;
			if (p.pos.x > rect.right) p.pos.x = rect.right;
			if (p.pos.y < rect.top) p.pos.y = rect.top;
			if (p.pos.y > rect.bottom) p.pos.y = rect.bottom;
		}
	}

	private render() {
		const g = this.graphics;
		g.clear();
		// gradient fill imitation using alpha layering
		const color = 0x3dd9d5;
		const alpha = 0.65;
		const pts: Phaser.Math.Vector2[] = [];
		for (let i = 1; i < this.particles.length; i++) pts.push(this.particles[i].pos);
		// sort by angle around center to keep shape stable
		const c = this.particles[0].pos;
		pts.sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
		if (pts.length < 3) return;
	g.fillStyle(color, alpha);
		g.beginPath();
		g.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
		g.closePath();
		g.fillPath();
		// outline
		g.lineStyle(2, 0xffffff, 0.7);
		g.strokePath();

		// optional radial lines (debug-style slime look)
		g.lineStyle(1, 0xffffff, 0.25);
		for (let i = 0; i < pts.length; i += 2) {
			g.beginPath();
			g.moveTo(c.x, c.y);
			g.lineTo(pts[i].x, pts[i].y);
			g.strokePath();
		}

		// obstacle debug
		g.lineStyle(2, 0xffaa00, 0.6);
		for (const poly of this.obstacles) {
			g.beginPath();
			const p0 = poly.points[0];
			g.moveTo(p0.x, p0.y);
			for (let i = 1; i < poly.points.length; i++) g.lineTo(poly.points[i].x, poly.points[i].y);
			g.closePath();
			g.strokePath();
		}
	}
}

export default SlimeSoftBody;

