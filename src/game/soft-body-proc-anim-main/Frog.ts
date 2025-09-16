import Phaser from "phaser";
import { Blob } from "./Blob";
import { Limb } from "./Limb";

export class Frog {
	scene: Phaser.Scene;
	blob: Blob;

	leftFrontLeg: Limb;
	rightFrontLeg: Limb;
	leftHindLeg: Limb;
	rightHindLeg: Limb;

	constructor(scene: Phaser.Scene, origin: Phaser.Math.Vector2) {
		this.scene = scene;
		this.blob = new Blob(scene, origin, 16, 128, 1.5);

		this.leftFrontLeg = new Limb(
			origin.clone().subtract(new Phaser.Math.Vector2(80, 0)),
			56,
			Math.PI / 4,
			Math.PI / 8,
			Math.PI / 5,
			-Math.PI / 4
		);
		this.rightFrontLeg = new Limb(
			origin.clone().subtract(new Phaser.Math.Vector2(-80, 0)),
			56,
			Math.PI / 4,
			-Math.PI / 8,
			Math.PI / 5,
			Math.PI / 4
		);

		this.leftHindLeg = new Limb(
			origin.clone().subtract(new Phaser.Math.Vector2(100, 0)),
			100,
			1.9 * Math.PI / 5,
			2 * Math.PI / 5,
			2 * Math.PI / 5,
			-2 * Math.PI / 5
		);
		this.rightHindLeg = new Limb(
			origin.clone().subtract(new Phaser.Math.Vector2(-100, 0)),
			100,
			1.9 * Math.PI / 5,
			-2 * Math.PI / 5,
			2 * Math.PI / 5,
			2 * Math.PI / 5
		);
	}

	update() {
		this.blob.update();

		const points = this.blob.points.map((p) => p.pos);
		const leftFront = points[12];
		const rightFront = points[4];
		const leftFrontAnchor = leftFront
			.clone()
			.lerp(rightFront, 0.25)
			.add(new Phaser.Math.Vector2(0, 10));
		const rightFrontAnchor = leftFront
			.clone()
			.lerp(rightFront, 0.75)
			.add(new Phaser.Math.Vector2(0, 10));
		const midSecant = rightFront.clone().subtract(leftFront).setLength(64);
		const midNormal = midSecant.clone().rotate(-Math.PI / 2).angle();
		const leftHindAnchor = points[11]
			.clone()
			.add(midSecant)
			.add(new Phaser.Math.Vector2(0, 16));
		const rightHindAnchor = points[5]
			.clone()
			.subtract(midSecant)
			.add(new Phaser.Math.Vector2(0, 16));

		this.leftFrontLeg.resolve(this.scene, leftFrontAnchor, midNormal);
		this.rightFrontLeg.resolve(this.scene, rightFrontAnchor, midNormal);

		// Hack to make hind legs go back into position when approaching the ground
		const height = this.scene.scale.height;
		if (height - this.leftHindLeg.foot.pos.y < 100) {
			this.leftHindLeg.elbow.pos.y -= 1.5;
			this.leftHindLeg.foot.pos.x += 0.5;
		}
		if (height - this.rightHindLeg.foot.pos.y < 100) {
			this.rightHindLeg.elbow.pos.y -= 1.5;
			this.rightHindLeg.foot.pos.x -= 0.5;
		}

		this.leftHindLeg.resolve(this.scene, leftHindAnchor, midNormal);
		this.rightHindLeg.resolve(this.scene, rightHindAnchor, midNormal);
	}

	render(g: Phaser.GameObjects.Graphics) {
		g.save();
		this.drawHindLegs(g);
		this.drawBody(g);
		this.drawHead(g);
		this.drawFrontLegs(g);
		g.restore();
	}

	private drawBody(g: Phaser.GameObjects.Graphics) {
		this.blob.draw(g, 0x55917f);
	}

	private drawHead(g: Phaser.GameObjects.Graphics) {
		const points = this.blob.points.map((p) => p.pos);
		const top = points[0];
		const topNormal = points[2].clone().subtract(points[points.length - 2]).angle();

		g.save();
		g.translateCanvas(top.x, top.y);
		g.rotateCanvas(topNormal);

		// Head base
		g.lineStyle(7, 0x000000, 1);
		g.fillStyle(0x55917f, 1);
		// Approximate arcs with circle segments
		g.strokeCircle(0, 75, 125);
		g.fillCircle(0, 75, 122);

		// Eye sockets
		g.lineStyle(7, 0x000000, 1);
		g.beginPath();
		g.arc(-75, -10, 37.5, -Math.PI - Math.PI / 4.6, -Math.PI / 5.6);
		g.strokePath();
		g.beginPath();
		g.arc(75, -10, 37.5, -Math.PI + Math.PI / 5.6, Math.PI / 4.6);
		g.strokePath();
		g.fillStyle(0x55917f, 1);
		g.fillCircle(-75, -10, 35);
		g.fillCircle(75, -10, 35);

		// Eyes
		g.lineStyle(4, 0x000000, 1);
		g.fillStyle(0xf0995b, 1);
		g.fillCircle(-75, -10, 24);
		g.fillCircle(75, -10, 24);

		// Pupils (ellipses approximated with scaled circles via canvas save/scale)
		g.save();
		g.translateCanvas(-75, -10);
		g.rotateCanvas(-Math.PI / 24);
		g.fillStyle(0x000000, 1);
		g.fillEllipse(0, 0, 32, 18);
		g.restore();

		g.save();
		g.translateCanvas(75, -10);
		g.rotateCanvas(Math.PI / 24);
		g.fillStyle(0x000000, 1);
		g.fillEllipse(0, 0, 32, 18);
		g.restore();

		// Chin
		g.lineStyle(7, 0x000000, 1);
		g.beginPath();
		g.arc(0, 80, 46, Math.PI / 8, Math.PI - Math.PI / 8);
		g.strokePath();

		// Mouth (bezier approximated with line segments)
		g.lineStyle(5, 0x000000, 1);
		g.beginPath();
		g.moveTo(-90, 40);
		g.lineTo(-10, 25);
		g.lineTo(10, 25);
		g.lineTo(90, 40);
		g.strokePath();

		// Nostrils
		g.save();
		g.translateCanvas(-9, 5);
		g.rotateCanvas(Math.PI / 6);
		g.fillStyle(0x000000, 1);
		g.fillEllipse(0, 0, 2, 5);
		g.restore();
		g.save();
		g.translateCanvas(9, 5);
		g.rotateCanvas(-Math.PI / 6);
		g.fillStyle(0x000000, 1);
		g.fillEllipse(0, 0, 2, 5);
		g.restore();

		g.restore();
	}

	private drawFrontLegs(g: Phaser.GameObjects.Graphics) {
		const pts = this.blob.points.map((p) => p.pos);
		const left = pts[12];
		const right = pts[4];
		const leftAnchor = left.clone().lerp(right, 0.25).add(new Phaser.Math.Vector2(0, 10));
		const rightAnchor = left.clone().lerp(right, 0.75).add(new Phaser.Math.Vector2(0, 10));
		this.drawFrontLeg(g, leftAnchor, this.leftFrontLeg);
		this.drawFrontLeg(g, rightAnchor, this.rightFrontLeg);
	}

	private drawHindLegs(g: Phaser.GameObjects.Graphics) {
		const pts = this.blob.points.map((p) => p.pos);
		const left = pts[12];
		const right = pts[4];
		const midSecant = right.clone().subtract(left).setLength(64);
		const leftAnchor = pts[11].clone().add(midSecant).add(new Phaser.Math.Vector2(0, 16));
		const rightAnchor = pts[5].clone().subtract(midSecant).add(new Phaser.Math.Vector2(0, 16));
		this.drawHindLeg(g, leftAnchor, this.leftHindLeg, false);
		this.drawHindLeg(g, rightAnchor, this.rightHindLeg, true);
	}

	private drawFrontLeg(
		g: Phaser.GameObjects.Graphics,
		anchor: Phaser.Math.Vector2,
		limb: Limb
	) {
		// Outline
		g.lineStyle(48, 0x000000, 1);
		g.beginPath();
		g.moveTo(anchor.x, anchor.y);
		g.lineTo(limb.elbow.pos.x, limb.elbow.pos.y);
		g.lineTo(limb.foot.pos.x, limb.foot.pos.y);
		g.strokePath();

		// Fill
		g.lineStyle(34, 0x55917f, 1);
		g.beginPath();
		g.moveTo(anchor.x, anchor.y);
		g.lineTo(limb.elbow.pos.x, limb.elbow.pos.y);
		g.lineTo(limb.foot.pos.x, limb.foot.pos.y);
		g.strokePath();

		// Toes
		const footNormal = limb.elbow.pos.clone().subtract(limb.foot.pos).angle() + Math.PI / 2;
		g.lineStyle(6, 0x000000, 1);
		g.fillStyle(0x55917f, 1);
		g.save();
		g.translateCanvas(limb.foot.pos.x, limb.foot.pos.y);
		g.rotateCanvas(footNormal - Math.PI / 4);
		g.fillEllipse(0, 16, 16, 55);
		g.strokeEllipse(0, 16, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 28, 16, 55);
		g.strokeEllipse(0, 28, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 28, 16, 55);
		g.strokeEllipse(0, 28, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 16, 16, 55);
		g.strokeEllipse(0, 16, 16, 55);
		// Hide overlaps
		g.fillStyle(0x55917f, 1);
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 28, 10, 49);
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 28, 10, 49);
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 16, 10, 49);
		g.restore();

		// Shoulder cover
		const shoulderNormal = anchor.clone().subtract(limb.elbow.pos).angle();
		g.fillStyle(0x55917f, 1);
		g.slice(anchor.x, anchor.y, 24.5, -Math.PI / 2 + shoulderNormal, Math.PI / 2 + shoulderNormal);
		g.fillPath();

		// Toe connection cover
		g.fillCircle(limb.foot.pos.x, limb.foot.pos.y, 17.5);
	}

	private drawHindLeg(
		g: Phaser.GameObjects.Graphics,
		anchor: Phaser.Math.Vector2,
		limb: Limb,
		right: boolean
	) {
		const offset = right ? -Math.PI / 8 : Math.PI / 8;
		const footNormal = limb.elbow.pos.clone().subtract(limb.foot.pos).angle() + Math.PI / 2 + offset;
		const footShift = limb.foot.pos
			.clone()
			.add(new Phaser.Math.Vector2().setToPolar(footNormal + Math.PI / 2, 24));

		// Outline
		g.lineStyle(48, 0x000000, 1);
		g.beginPath();
		g.moveTo(anchor.x, anchor.y);
		g.lineTo(limb.elbow.pos.x, limb.elbow.pos.y);
		g.lineTo(limb.foot.pos.x, limb.foot.pos.y);
		g.lineTo(footShift.x, footShift.y);
		g.strokePath();

		// Fill
		g.lineStyle(34, 0x55917f, 1);
		g.beginPath();
		g.moveTo(anchor.x, anchor.y);
		g.lineTo(limb.elbow.pos.x, limb.elbow.pos.y);
		g.lineTo(limb.foot.pos.x, limb.foot.pos.y);
		g.lineTo(footShift.x, footShift.y);
		g.strokePath();

		// Toes
		g.lineStyle(6, 0x000000, 1);
		g.fillStyle(0x55917f, 1);
		g.save();
		g.translateCanvas(footShift.x, footShift.y);
		g.rotateCanvas(footNormal - Math.PI / 4 + offset);
		g.fillEllipse(0, 16, 16, 55);
		g.strokeEllipse(0, 16, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 28, 16, 55);
		g.strokeEllipse(0, 28, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 28, 16, 55);
		g.strokeEllipse(0, 28, 16, 55);
		g.rotateCanvas(Math.PI / 6);
		g.fillEllipse(0, 16, 16, 55);
		g.strokeEllipse(0, 16, 16, 55);
		// Hide overlaps
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 28, 10, 49);
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 28, 10, 49);
		g.rotateCanvas(-Math.PI / 6);
		g.fillEllipse(0, 16, 10, 49);
		g.restore();

		// Shoulder cover
		const shoulderNormal = anchor.clone().subtract(limb.elbow.pos).angle();
		g.fillStyle(0x55917f, 1);
		g.slice(anchor.x, anchor.y, 24.5, -Math.PI / 2 + shoulderNormal, Math.PI / 2 + shoulderNormal);
		g.fillPath();

		// Toe connection cover
		g.fillCircle(footShift.x, footShift.y, 17.5);
	}
}

