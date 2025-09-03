import Phaser from "phaser";
import matter from "matter-js";

interface LastKeyTime {
    left: number;
    right: number;
}
interface KeyHeld {
    left: boolean;
    right: boolean;
}

export class Slime {
    scene: Phaser.Scene;
    softBody: matter.Composite;
    cube: Phaser.GameObjects.Graphics;
    graphics: Phaser.GameObjects.Arc[] = [];
    targetCube: Phaser.GameObjects.Rectangle;
    canJump = true;
    isOnGround = false;
    lastKeyTime: LastKeyTime = { left: 0, right: 0 };
    keyHeld: KeyHeld = { left: false, right: false };
    isBoosting = false;
    doubleTapDelay = 250; // ms

    // Drag and drop properties
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private originalPositions: { x: number; y: number }[] = [];

    // Shape restoration properties
    private defaultPositions: { x: number; y: number }[] = [];
    private restoreStrength = 0.01; // Reduced restoration force

    // Global force limiting
    private maxForce = 0.002; // Further reduced from 0.003
    private maxVelocity = 2.5; // Further reduced from 4 for more stability

    private lastVel = new WeakMap<any, { x: number; y: number }>();

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        const MatterNS: typeof matter = (Phaser.Physics.Matter as any).Matter;

        const particleOptions = {
            friction: 0.8,
            frictionStatic: 1.2,
            restitution: 0.1,
            frictionAir: 0.15,
            render: { visible: false },
        };

        // Slime configuration
        const slimeRadius = 45;
        const particleRadius = 6;
        const bodies: matter.Body[] = [];
        const constraints: matter.Constraint[] = [];

        // 1. Create outer semi-circle shell (9 particles)
        const outerParticles = 9;
        for (let i = 0; i < outerParticles; i++) {
            // Create perfect semi-circle from 0 to π (top half)
            const angle = (i / (outerParticles - 1)) * Math.PI;
            const px = x + Math.cos(angle) * slimeRadius;
            const py = y + Math.sin(angle) * slimeRadius;
            bodies.push(
                MatterNS.Bodies.circle(px, py, particleRadius, particleOptions)
            );
        }

        // 2. Create inner circle (6 particles) - constrained within outer shell
        const innerParticles = 6;
        const innerRadius = slimeRadius * 0.5; // Inner circle is half the outer radius
        for (let i = 0; i < innerParticles; i++) {
            const angle = (i / innerParticles) * Math.PI * 2; // Full circle
            const px = x + Math.cos(angle) * innerRadius;
            const py = y + Math.sin(angle) * innerRadius * 0.7; // Slightly flattened
            bodies.push(
                MatterNS.Bodies.circle(px, py, particleRadius, particleOptions)
            );
        }

        // 3. Create center particle for stability
        bodies.push(
            MatterNS.Bodies.circle(x, y, particleRadius, particleOptions)
        );

        // Create constraints for outer shell (semi-circle perimeter)
        for (let i = 0; i < outerParticles - 1; i++) {
            constraints.push(
                MatterNS.Constraint.create({
                    bodyA: bodies[i],
                    bodyB: bodies[i + 1],
                    stiffness: 0.9, // High stiffness to maintain semi-circle shape
                    damping: 0.95,
                    render: { visible: false },
                })
            );
        }

        // Connect outer shell endpoints to form base of semi-circle
        constraints.push(
            MatterNS.Constraint.create({
                bodyA: bodies[0], // Left endpoint
                bodyB: bodies[outerParticles - 1], // Right endpoint
                stiffness: 0.8,
                damping: 0.95,
                render: { visible: false },
            })
        );

        // Create constraints for inner circle
        for (let i = 0; i < innerParticles; i++) {
            const nextIndex = (i + 1) % innerParticles;
            constraints.push(
                MatterNS.Constraint.create({
                    bodyA: bodies[outerParticles + i],
                    bodyB: bodies[outerParticles + nextIndex],
                    stiffness: 0.7,
                    damping: 0.9,
                    render: { visible: false },
                })
            );
        }

        // Connect center to inner circle particles
        const centerIndex = outerParticles + innerParticles;
        for (let i = 0; i < innerParticles; i++) {
            constraints.push(
                MatterNS.Constraint.create({
                    bodyA: bodies[centerIndex],
                    bodyB: bodies[outerParticles + i],
                    stiffness: 0.6,
                    damping: 0.9,
                    render: { visible: false },
                })
            );
        }

        // Connect inner circle to outer shell to prevent escape
        // Each inner particle connects to nearest outer particles
        for (let i = 0; i < innerParticles; i++) {
            const innerParticle = bodies[outerParticles + i];
            
            // Find closest outer particles and create constraining connections
            let minDist1 = Infinity, minDist2 = Infinity;
            let closest1 = 0, closest2 = 0;
            
            for (let j = 0; j < outerParticles; j++) {
                const outerParticle = bodies[j];
                const dist = Math.sqrt(
                    Math.pow(innerParticle.position.x - outerParticle.position.x, 2) +
                    Math.pow(innerParticle.position.y - outerParticle.position.y, 2)
                );
                
                if (dist < minDist1) {
                    minDist2 = minDist1;
                    closest2 = closest1;
                    minDist1 = dist;
                    closest1 = j;
                } else if (dist < minDist2) {
                    minDist2 = dist;
                    closest2 = j;
                }
            }
            
            // Create constraining connections to prevent escape
            constraints.push(
                MatterNS.Constraint.create({
                    bodyA: innerParticle,
                    bodyB: bodies[closest1],
                    stiffness: 0.3, // Lower stiffness for flexibility
                    damping: 0.8,
                    length: minDist1 * 0.8, // Shorter than actual distance to contain
                    render: { visible: false },
                })
            );
            
            if (closest1 !== closest2) {
                constraints.push(
                    MatterNS.Constraint.create({
                        bodyA: innerParticle,
                        bodyB: bodies[closest2],
                        stiffness: 0.3,
                        damping: 0.8,
                        length: minDist2 * 0.8,
                        render: { visible: false },
                    })
                );
            }
        }

        // Connect center to key outer shell points for overall stability
        const keyOuterPoints = [Math.floor(outerParticles / 4), Math.floor(outerParticles / 2), Math.floor(3 * outerParticles / 4)];
        keyOuterPoints.forEach(idx => {
            constraints.push(
                MatterNS.Constraint.create({
                    bodyA: bodies[centerIndex],
                    bodyB: bodies[idx],
                    stiffness: 0.2, // Very low stiffness for gentle centering
                    damping: 0.9,
                    render: { visible: false },
                })
            );
        });

        this.softBody = MatterNS.Composite.create({ bodies, constraints });
        scene.matter.world.add(this.softBody);

        // Store default positions for shape restoration (relative to center)
        const centerPos = bodies[centerIndex].position;
        this.defaultPositions = this.softBody.bodies.map((body) => ({
            x: body.position.x - centerPos.x,
            y: body.position.y - centerPos.y,
        }));

        this.cube = scene.add.graphics();
        this.cube.fillStyle(0x0000ff);

        // Debug particles (green dots)
        this.graphics = this.softBody.bodies.map((part: any) => {
            const circ = scene.add.circle(
                part.position.x,
                part.position.y,
                3,
                0x00ff00,
                1
            );
            circ.setDepth(10);
            return circ;
        });

        this.targetCube = scene.add
            .rectangle(x, y, 10, 10, 0xff0000, 1)
            .setAlpha(0);

        // gravity (also configurable via world config)
        scene.matter.world.setGravity(0, 1.1);

        scene.matter.world.on("collisionactive", this.handleCollision, this);

        // Set up drag and drop functionality
        this.setupDragAndDrop();
    }

    private setupDragAndDrop() {
        // Set up scene-level input handlers instead of graphics-specific ones
        this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            // Check if the pointer is over any of the slime particles
            const worldPoint = this.scene.cameras.main.getWorldPoint(
                pointer.x,
                pointer.y
            );
            const slimeCenter = this.softBody.bodies[12].position; // Center particle (new index)
            const distance = Phaser.Math.Distance.Between(
                worldPoint.x,
                worldPoint.y,
                slimeCenter.x,
                slimeCenter.y
            );

            // If clicked within slime radius, start dragging
            if (distance < 50) {
                this.startDrag(worldPoint.x, worldPoint.y);
            }
        });

        this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                const worldPoint = this.scene.cameras.main.getWorldPoint(
                    pointer.x,
                    pointer.y
                );
                this.updateDrag(worldPoint.x, worldPoint.y);
            }
        });

        this.scene.input.on("pointerup", () => {
            this.endDrag();
        });
    }

    private startDrag(x: number, y: number) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartY = y;

        // Store original positions of all particles
        this.originalPositions = this.softBody.bodies.map((body) => ({
            x: body.position.x,
            y: body.position.y,
        }));
    }

    private updateDrag(x: number, y: number) {
        if (!this.isDragging) return;

        const { Body } = (Phaser.Physics as any).Matter.Matter;

        // Get scene boundaries
        const sceneWidth = this.scene.scale.width;
        const sceneHeight = this.scene.scale.height;
        const slimeRadius = 50;

        // Clamp mouse position to boundaries
        const clampedX = Phaser.Math.Clamp(
            x,
            slimeRadius,
            sceneWidth - slimeRadius
        );
        const clampedY = Phaser.Math.Clamp(
            y,
            slimeRadius,
            sceneHeight - slimeRadius
        );

        // Get the center particle
        const centerParticle = this.softBody.bodies[12]; // Center particle (new index)

        // Very gentle interpolation to the target position
        const lerpFactor = 0.08; // Much slower, smoother movement
        const newX = Phaser.Math.Linear(
            centerParticle.position.x,
            clampedX,
            lerpFactor
        );
        const newY = Phaser.Math.Linear(
            centerParticle.position.y,
            clampedY,
            lerpFactor
        );

        // Set the center particle position directly
        Body.setPosition(centerParticle, { x: newX, y: newY });

        // Reset center particle velocity to prevent accumulation
        Body.setVelocity(centerParticle, { x: 0, y: 0 });

        // Apply very gentle shape-maintaining forces during drag
        this.applyDragShapeForces(newX, newY);

        // Apply stronger damping to reduce bouncing
        this.softBody.bodies.forEach((body, index) => {
            if (index === 12) return; // Skip center particle

            // Different damping for outer vs inner particles
            let dampingX, dampingY;
            if (index < 8) {
                // Outer particles (0-7) - gentler damping to keep them stable
                dampingX = 0.95;
                dampingY = 0.96;
            } else {
                // Inner particles (8-11) - stronger damping for control
                dampingX = 0.9;
                dampingY = 0.92;
            }

            Body.setVelocity(body, {
                x: body.velocity.x * dampingX,
                y: body.velocity.y * dampingY,
            });

            // Apply global velocity limiting
            this.limitVelocity(body);
        });
    }

    private endDrag() {
        this.isDragging = false;
    }

    private limitForce(
        forceX: number,
        forceY: number
    ): { x: number; y: number } {
        const forceMagnitude = Math.sqrt(forceX * forceX + forceY * forceY);

        if (forceMagnitude > this.maxForce) {
            const scale = this.maxForce / forceMagnitude;
            return {
                x: forceX * scale,
                y: forceY * scale,
            };
        }

        return { x: forceX, y: forceY };
    }

    private limitVelocity(body: matter.Body) {
        const { Body } = (Phaser.Physics as any).Matter.Matter;
        const velocity = body.velocity;
        const speed = Math.sqrt(
            velocity.x * velocity.x + velocity.y * velocity.y
        );

        if (speed > this.maxVelocity) {
            const scale = this.maxVelocity / speed;
            Body.setVelocity(body, {
                x: velocity.x * scale,
                y: velocity.y * scale,
            });
        }

        // Additional check for extremely small velocities to reduce jitter
        if (Math.abs(velocity.x) < 0.01 && Math.abs(velocity.y) < 0.01) {
            Body.setVelocity(body, { x: 0, y: 0 });
        }
    }

    private applyDragShapeForces(centerX: number, centerY: number) {
        const { Body } = (Phaser.Physics as any).Matter.Matter;
        const shapeForceStrength = 0.02; // Much gentler force strength

        // Only apply forces to inner particles (8-11), not outer particles (0-7)
        this.softBody.bodies.forEach((body, index) => {
            if (index === 12) return; // Skip center particle
            if (index < 8) return; // Skip outer particles (bottom and middle layers)

            const defaultRelativePos = this.defaultPositions[index];
            const targetX = centerX + defaultRelativePos.x;
            const targetY = centerY + defaultRelativePos.y;

            // Only apply force if the particle is significantly out of place
            const distance = Math.sqrt(
                Math.pow(targetX - body.position.x, 2) +
                    Math.pow(targetY - body.position.y, 2)
            );

            if (distance > 10) {
                // Only apply force if deformation is significant
                // Calculate gentle force to guide particle back to shape
                const forceX = (targetX - body.position.x) * shapeForceStrength;
                const forceY = (targetY - body.position.y) * shapeForceStrength;

                // Apply force limiting to prevent bouncing
                const limitedForce = this.limitForce(
                    forceX * body.mass,
                    forceY * body.mass
                );

                // Apply the limited shape-maintaining force
                Body.applyForce(body, body.position, limitedForce);
            }
        });
    }

    private applyShapeRestoration(
        cursors: Phaser.Types.Input.Keyboard.CursorKeys
    ) {
        // Only apply restoration when completely idle
        const isMoving =
            cursors.left?.isDown ||
            cursors.right?.isDown ||
            cursors.up?.isDown ||
            cursors.space?.isDown;
        const hasVelocity = this.softBody.bodies.some(
            (body) =>
                Math.abs(body.velocity.x) > 0.2 ||
                Math.abs(body.velocity.y) > 0.2
        );

        const shouldRestore =
            !this.isDragging && !isMoving && this.isOnGround && !hasVelocity;

        if (!shouldRestore) return;

        const { Body } = (Phaser.Physics as any).Matter.Matter;

        // Get current center position
        const currentCenter = this.softBody.bodies[12].position; // Center particle (new index)

        // Only apply restoration forces to inner particles (8-11), not outer particles (0-7)
        this.softBody.bodies.forEach((body, index) => {
            if (index < 8) return; // Skip outer particles (bottom and middle layers)
            if (index === 12) return; // Skip center particle

            const defaultRelativePos = this.defaultPositions[index];
            const targetX = currentCenter.x + defaultRelativePos.x;
            const targetY = currentCenter.y + defaultRelativePos.y;

            // Only apply very gentle restoration if significantly out of place
            const distanceFromTarget = Math.sqrt(
                Math.pow(targetX - body.position.x, 2) +
                    Math.pow(targetY - body.position.y, 2)
            );

            if (distanceFromTarget > 5) {
                // Only restore if significantly deformed
                const restoreForceX =
                    (targetX - body.position.x) * this.restoreStrength * 0.5;
                const restoreForceY =
                    (targetY - body.position.y) * this.restoreStrength * 0.5;

                // Apply force limiting to prevent bouncing
                const limitedForce = this.limitForce(
                    restoreForceX * body.mass,
                    restoreForceY * body.mass
                );

                Body.applyForce(body, body.position, limitedForce);
            }
        });
    }

    private handleCollision(event: any) {
        event.pairs.forEach((pair: any) => {
            const { bodyA, bodyB } = pair;
            if (
                this.softBody.bodies.includes(bodyA) ||
                this.softBody.bodies.includes(bodyB)
            ) {
                if (bodyA.isStatic || bodyB.isStatic) {
                    this.isOnGround = true;
                }
            }
        });
    }

    private checkDoubleTap(direction: "left" | "right") {
        const currentTime = this.scene.time.now;
        if (
            currentTime - this.lastKeyTime[direction] < this.doubleTapDelay &&
            !this.keyHeld[direction]
        ) {
            this.isBoosting = true;
            this.lastKeyTime[direction] = 0;
        } else {
            this.isBoosting = false;
        }
        this.lastKeyTime[direction] = currentTime;
    }

    update(cursors: Phaser.Types.Input.Keyboard.CursorKeys) {
        // Skip keyboard controls if currently being dragged
        if (this.isDragging) {
            // Update debug circles and target while dragging
            this.softBody.bodies.forEach((part: any, index: number) => {
                this.graphics[index].setPosition(
                    part.position.x,
                    part.position.y
                );
            });

            // Use center particle (index 12) for target positioning
            const targetPosition = this.softBody.bodies[12].position; // Center particle (new index)
            this.targetCube.setPosition(targetPosition.x, targetPosition.y);

            this.updateSoftBodyGraphics();
            return;
        }

        const { Body } = (Phaser.Physics as any).Matter.Matter;
        const baseSpeed = 1.5; // Further reduced from 2.0 for more stability
        const speedBoost = 1.2; // Further reduced from 1.4 for more control
        const baseJumpVelocity = -6; // Further reduced from -8 for gentler jumps

        let playerSpeed = baseSpeed;
        const jumpVelocity = baseJumpVelocity;

        if (cursors.left?.isDown) {
            if (!this.keyHeld.left) this.checkDoubleTap("left");
            this.keyHeld.left = true;
        } else this.keyHeld.left = false;
        if (cursors.right?.isDown) {
            if (!this.keyHeld.right) this.checkDoubleTap("right");
            this.keyHeld.right = true;
        } else this.keyHeld.right = false;

        if (cursors.shift?.isDown || this.isBoosting) {
            playerSpeed *= speedBoost;
            this.cube.fillStyle(0xff0000);
        } else {
            this.cube.fillStyle(0x0000ff);
        }

        // Horizontal with smoothing
        const desiredX = cursors.left?.isDown
            ? -playerSpeed
            : cursors.right?.isDown
            ? playerSpeed
            : 0;

        // Higher smoothing factor for better responsiveness and less drift
        const smoothFactor = desiredX !== 0 ? 0.1 : 0.5; // Slower response, faster damping

        this.softBody.bodies.forEach((part) => {
            const prev = this.lastVel.get(part) || {
                x: part.velocity.x,
                y: part.velocity.y,
            };
            let vx = Phaser.Math.Linear(prev.x, desiredX, smoothFactor);

            // Apply stronger damping when no horizontal input to prevent drift
            if (desiredX === 0) {
                vx *= 0.6; // Stronger damping when not moving (was 0.75)
                // Zero out very small velocities to prevent micro-drifting
                if (Math.abs(vx) < 0.03) {
                    // Reduced threshold from 0.05
                    vx = 0;
                }
            }

            const vy = part.velocity.y;
            Body.setVelocity(part, { x: vx, y: vy });
            this.lastVel.set(part, { x: vx, y: vy });

            // Apply global velocity limiting
            this.limitVelocity(part);
        });

        // Jump
        if (
            (cursors.space?.isDown || cursors.up?.isDown) &&
            this.isOnGround &&
            this.canJump
        ) {
            this.softBody.bodies.forEach((part: any) => {
                const prev = this.lastVel.get(part) || {
                    x: part.velocity.x,
                    y: part.velocity.y,
                };
                const vy = jumpVelocity;
                Body.setVelocity(part, { x: prev.x, y: vy });
                this.lastVel.set(part, { x: prev.x, y: vy });
            });
            if (cursors.shift?.isDown || this.isBoosting) {
                this.softBody.bodies.forEach((part: any) =>
                    Body.setVelocity(part, {
                        x: part.velocity.x * speedBoost,
                        y: part.velocity.y,
                    })
                );
            }
            this.canJump = false;
            this.isOnGround = false;
        }
        if (!cursors.space?.isDown && !cursors.up?.isDown) this.canJump = true;
        if (!cursors.left?.isDown && !cursors.right?.isDown)
            this.isBoosting = false;

        // Apply shape restoration when not being dragged and no active movement
        this.applyShapeRestoration(cursors);

        // Apply continuous velocity limiting to all particles to prevent explosiveness
        this.softBody.bodies.forEach((body) => {
            this.limitVelocity(body);

            // More aggressive damping for any remaining high velocities
            const currentSpeed = Math.sqrt(
                body.velocity.x * body.velocity.x +
                    body.velocity.y * body.velocity.y
            );
            if (currentSpeed > 1.5) {
                // Reduced threshold from 2 to 1.5
                // If moving faster than 1.5 units, apply extra damping
                Body.setVelocity(body, {
                    x: body.velocity.x * 0.7, // Stronger damping (was 0.85)
                    y: body.velocity.y * 0.75, // Stronger damping, less for Y to maintain gravity
                });
            }
        });

        // Update debug circles and target
        this.softBody.bodies.forEach((part: any, index: number) => {
            this.graphics[index].setPosition(part.position.x, part.position.y);
        });

        // Use center particle (index 12) for target positioning
        const targetPosition = this.softBody.bodies[12].position; // Center particle (new index)
        this.targetCube.setPosition(targetPosition.x, targetPosition.y);

        this.updateSoftBodyGraphics();
    }

    private updateSoftBodyGraphics() {
        this.cube.clear();
        const bodies = this.softBody.bodies;
        if (!bodies || bodies.length < 13) return; // Updated for new particle count

        // Create a smooth semicircle using the outer particles for boundary
        const bottomParticles = bodies.slice(0, 5); // Bottom layer (indices 0-4)
        const middleParticles = bodies.slice(5, 8); // Middle layer (indices 5-7)
        // Inner layer particles are at indices 8-11, center at index 12

        // Draw filled semicircle shape
        this.cube.fillStyle(0x3dd9d5, 0.95);
        this.cube.beginPath();

        // Start from leftmost bottom particle and trace the outline
        this.cube.moveTo(
            bottomParticles[0].position.x,
            bottomParticles[0].position.y
        );

        // Connect bottom particles
        for (let i = 1; i < bottomParticles.length; i++) {
            this.cube.lineTo(
                bottomParticles[i].position.x,
                bottomParticles[i].position.y
            );
        }

        // Connect to rightmost middle particle
        this.cube.lineTo(
            middleParticles[2].position.x,
            middleParticles[2].position.y
        );

        // Trace through middle layer (reversed)
        for (let i = 1; i >= 0; i--) {
            this.cube.lineTo(
                middleParticles[i].position.x,
                middleParticles[i].position.y
            );
        }

        // Close back to start
        this.cube.closePath();
        this.cube.fillPath();

        // Add outline
        this.cube.lineStyle(2, 0xffffff, 0.8);
        this.cube.strokePath();

        // Add inner glow effect
        this.cube.fillStyle(0x5df4f0, 0.4);
        this.cube.beginPath();
        // this.cube.arc(center.x, center.y, 12, 0, Math.PI, true);
        this.cube.fillPath();
    }
}
