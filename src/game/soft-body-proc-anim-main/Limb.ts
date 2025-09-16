import Phaser from "phaser";

// Angle utilities translated from Util.pde
export function simplifyAngle(angle: number): number {
	const TWO_PI = Math.PI * 2;
	while (angle >= TWO_PI) angle -= TWO_PI;
	while (angle < 0) angle += TWO_PI;
	return angle;
}

export function relativeAngleDiff(angle: number, anchor: number): number {
	// Rotate so that PI is at the anchor to avoid seam
	angle = simplifyAngle(angle + Math.PI - anchor);
	anchor = Math.PI;
	return anchor - angle;
}

export function constrainAngle(
	angle: number,
	anchor: number,
	constraint: number
): number {
	if (Math.abs(relativeAngleDiff(angle, anchor)) <= constraint) {
		return simplifyAngle(angle);
	}

	if (relativeAngleDiff(angle, anchor) > constraint) {
		return simplifyAngle(anchor - constraint);
	}

	return simplifyAngle(anchor + constraint);
}

class LimbPoint {
	pos: Phaser.Math.Vector2;
	ppos: Phaser.Math.Vector2;
	angle: number = 0;

	constructor(pos: Phaser.Math.Vector2) {
		this.pos = pos.clone();
		this.ppos = pos.clone();
	}

	verletIntegrate(damping = 0.95) {
		const temp = this.pos.clone();
		const vel = this.pos.clone().subtract(this.ppos).scale(damping);
		this.pos.add(vel);
		this.ppos = temp;
	}

	applyConstraint(
		anchor: Phaser.Math.Vector2,
		normal: number,
		distance: number,
		angleRange: number,
		angleOffset: number
	) {
		const anchorAngle = normal + angleOffset;
		const curAngle = anchor.clone().subtract(this.pos).angle();
		this.angle = constrainAngle(curAngle, anchorAngle, angleRange);
		const dir = new Phaser.Math.Vector2(
			Math.cos(this.angle),
			Math.sin(this.angle)
		).setLength(distance);
		this.pos = anchor.clone().subtract(dir);
	}

	applyGravity(g = 1) {
		this.pos.y += g;
	}

	keepInBounds(width: number, height: number) {
		this.pos.x = Phaser.Math.Clamp(this.pos.x, 0, width);
		this.pos.y = Phaser.Math.Clamp(this.pos.y, 0, height);
	}
}

export class Limb {
	elbow: LimbPoint;
	foot: LimbPoint;

	distance: number;
	elbowRange: number;
	elbowOffset: number;
	footRange: number;
	footOffset: number;

	constructor(
		origin: Phaser.Math.Vector2,
		distance: number,
		elbowRange: number,
		elbowOffset: number,
		footRange: number,
		footOffset: number
	) {
		this.distance = distance;
		this.elbowRange = elbowRange;
		this.elbowOffset = elbowOffset;
		this.footRange = footRange;
		this.footOffset = footOffset;

		const elbowPos = origin.clone().add(new Phaser.Math.Vector2(0, distance));
		this.elbow = new LimbPoint(elbowPos);
		this.foot = new LimbPoint(elbowPos.clone().add(new Phaser.Math.Vector2(0, distance)));
	}

	resolve(
		scene: Phaser.Scene,
		anchor: Phaser.Math.Vector2,
		normal: number
	) {
		const width = scene.scale.width;
		const height = scene.scale.height;

		this.elbow.verletIntegrate(0.95);
		this.elbow.applyGravity(1);
		this.elbow.applyConstraint(
			anchor,
			normal,
			this.distance,
			this.elbowRange,
			this.elbowOffset
		);
		this.elbow.keepInBounds(width, height);

		this.foot.verletIntegrate(0.95);
		this.foot.applyGravity(1);
		this.foot.applyConstraint(
			this.elbow.pos,
			this.elbow.angle,
			this.distance,
			this.footRange,
			this.footOffset
		);
		this.foot.keepInBounds(width, height);
	}
}

