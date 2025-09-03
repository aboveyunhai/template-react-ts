import Phaser from "phaser";
import { SlimeParticle } from "./SlimeParticle";

/**
 * Physics-based slime simulator with semi-circle shape and particle dynamics
 */
export class SlimePhysics {
    public scene: Phaser.Scene;
    public outerParticles: SlimeParticle[] = [];
    public innerParticles: SlimeParticle[] = [];
    public centerParticle: SlimeParticle;
    public allParticles: SlimeParticle[] = [];

    // Hybrid physics parameters - strong constraints + droplet forces
    public structuralStrength: number = 1.2; // Strong structural forces
    public surfaceTension: number = 0.6;
    public internalPressure: number = 0.4;
    public cohesionStrength: number = 0.3;
    public viscosity: number = 0.93;
    public gravity: number = 0.3;
    public maxSpeed: number = 4;
    public restArea: number = 0;
    public restPerimeter: number = 0;
    public idealSegmentLength: number = 0; // Ideal distance between boundary particles

    // Slime properties
    public radius: number = 50;
    public centerX: number;
    public centerY: number;

    // Shape restoration (currently unused)
    // private originalPositions: { x: number; y: number }[] = [];
    // private shapeRestoreStrength: number = 0.02; // Much gentler restoration

    // Visual
    public graphics: Phaser.GameObjects.Graphics;
    public showDebugParticles: boolean = true;

    // Input handling
    private isDragging: boolean = false;
    private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        radius: number = 50
    ) {
        this.scene = scene;
        this.centerX = x;
        this.centerY = y;
        this.radius = radius;
        this.restArea = Math.PI * radius * radius * 0.5; // Half circle area
        this.restPerimeter = Math.PI * radius + 2 * radius; // Semicircle perimeter
        this.idealSegmentLength = (Math.PI * radius) / (10 - 1); // Perimeter divided by segments

        this.graphics = scene.add.graphics();
        this.setupSlimeStructure();
        this.setupInputHandling();
    }

    /**
     * Create the slime particle structure
     */
    private setupSlimeStructure(): void {
        // Create outer semicircle particles
        const outerCount = 10; // Reduced from 12 for better stability
        for (let i = 0; i < outerCount; i++) {
            const angle = Math.PI + (i / (outerCount - 1)) * Math.PI; // From π to 2π
            const x = this.centerX + Math.cos(angle) * this.radius;
            const y = this.centerY + Math.sin(angle) * this.radius * 0.7; // More flattened

            const particle = new SlimeParticle(x, y, 1.5, 5); // Increased mass
            this.outerParticles.push(particle);
            this.allParticles.push(particle);

            if (this.showDebugParticles) {
                particle.createGraphic(this.scene, 0x00ff00, 0.7);
            }
        }

        // Connect outer particles in a chain - simple adjacency for surface tension
        // (We'll use surface tension forces instead of spring connections)

        // Create inner circle particles
        const innerCount = 5; // Reduced from 6
        const innerRadius = this.radius * 0.25; // Smaller inner radius
        for (let i = 0; i < innerCount; i++) {
            const angle = (i / innerCount) * Math.PI * 2;
            const x = this.centerX + Math.cos(angle) * innerRadius;
            const y = this.centerY + Math.sin(angle) * innerRadius * 0.6; // More flattened

            const particle = new SlimeParticle(x, y, 0.6, 3); // Smaller, lighter
            this.innerParticles.push(particle);
            this.allParticles.push(particle);

            if (this.showDebugParticles) {
                particle.createGraphic(this.scene, 0x0088ff, 0.6);
            }
        }

        // Create center particle with higher mass for stability
        this.centerParticle = new SlimeParticle(
            this.centerX,
            this.centerY,
            3.0,
            2
        ); // Increased mass from 2.0 to 3.0
        this.allParticles.push(this.centerParticle);

        if (this.showDebugParticles) {
            this.centerParticle.createGraphic(this.scene, 0xff0000, 0.8);
        }

        // Store original positions for shape restoration (currently disabled)
        // this.storeOriginalPositions();
    }

    /**
     * Store original particle positions relative to center for shape restoration
     * (Currently unused)
     */
    /* private storeOriginalPositions(): void {
        this.originalPositions = this.allParticles.map(particle => ({
            x: particle.x - this.centerX,
            y: particle.y - this.centerY
        }));
    } */

    /**
     * Setup mouse/touch input handling
     */
    private setupInputHandling(): void {
        this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            const worldPoint = this.scene.cameras.main.getWorldPoint(
                pointer.x,
                pointer.y
            );

            // Check if clicking near the slime center
            const distance = Math.sqrt(
                Math.pow(worldPoint.x - this.centerParticle.x, 2) +
                    Math.pow(worldPoint.y - this.centerParticle.y, 2)
            );

            if (distance < this.radius * 1.2) {
                this.isDragging = true;
                this.dragOffset.x = worldPoint.x - this.centerParticle.x;
                this.dragOffset.y = worldPoint.y - this.centerParticle.y;
            }
        });

        this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                const worldPoint = this.scene.cameras.main.getWorldPoint(
                    pointer.x,
                    pointer.y
                );
                const targetX = worldPoint.x - this.dragOffset.x;
                const targetY = worldPoint.y - this.dragOffset.y;

                // Apply gentler dragging force to center particle
                const fx = (targetX - this.centerParticle.x) * 0.05; // Reduced from 0.1
                const fy = (targetY - this.centerParticle.y) * 0.05;
                this.centerParticle.applyForce(fx, fy);

                // Also apply force to outer particles to help maintain shape
                for (const outer of this.outerParticles) {
                    const outerFx = (targetX - outer.x) * 0.02;
                    const outerFy = (targetY - outer.y) * 0.02;
                    outer.applyForce(outerFx, outerFy);
                }
            }
        });

        this.scene.input.on("pointerup", () => {
            this.isDragging = false;
        });
    }

    /**
     * Apply strong structural forces to maintain semi-circle shape
     */
    private applyStructuralForces(): void {
        // 1. Maintain boundary chain integrity
        for (let i = 0; i < this.outerParticles.length; i++) {
            const current = this.outerParticles[i];
            const next =
                this.outerParticles[(i + 1) % this.outerParticles.length];

            const dx = next.x - current.x;
            const dy = next.y - current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                const displacement = distance - this.idealSegmentLength;
                const force = displacement * this.structuralStrength;

                const fx = (dx / distance) * force * 0.5;
                const fy = (dy / distance) * force * 0.5;

                current.applyForce(fx, fy);
                next.applyForce(-fx, -fy);
            }
        }

        // 2. Maintain radial structure from center
        for (const particle of this.outerParticles) {
            const dx = particle.x - this.centerParticle.x;
            const dy = particle.y - this.centerParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const idealRadius = this.radius * 0.8;

            if (distance > 0) {
                const displacement = distance - idealRadius;
                const force = displacement * this.structuralStrength * 0.3;

                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                particle.applyForce(-fx, -fy); // Pull toward center
                this.centerParticle.applyForce(fx * 0.1, fy * 0.1); // Gentle push on center
            }
        }

        // 3. Keep inner particles in formation with much stronger containment
        for (const inner of this.innerParticles) {
            const dx = inner.x - this.centerParticle.x;
            const dy = inner.y - this.centerParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const idealRadius = this.radius * 0.25;

            if (distance > 0) {
                // Much stronger containment force for inner particles
                let force = 0;
                if (distance > idealRadius) {
                    // Exponentially increasing force to prevent escape
                    const excess = distance - idealRadius;
                    force = excess * this.structuralStrength * 1.5; // Increased from 0.4 to 1.5

                    // Emergency containment if too far from center
                    if (distance > this.radius * 0.6) {
                        force += (distance - this.radius * 0.6) * 3.0; // Emergency pull

                        // Add strong damping to stop runaway particles
                        inner.vx *= 0.3;
                        inner.vy *= 0.3;
                    }
                } else {
                    // Normal containment
                    const displacement = distance - idealRadius;
                    force = displacement * this.structuralStrength * 0.8;
                }

                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                inner.applyForce(-fx, -fy);
                // Reduce impact on center to prevent drift - much smaller force
                this.centerParticle.applyForce(fx * 0.02, fy * 0.02); // Reduced from 0.05
            }
        }

        // 4. Maintain semi-circle shape - prevent flattening
        for (let i = 0; i < this.outerParticles.length; i++) {
            const particle = this.outerParticles[i];
            const angle =
                Math.PI + (i / (this.outerParticles.length - 1)) * Math.PI;
            const idealX =
                this.centerParticle.x + Math.cos(angle) * this.radius * 0.8;
            const idealY =
                this.centerParticle.y + Math.sin(angle) * this.radius * 0.6;

            const dx = idealX - particle.x;
            const dy = idealY - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                // Only apply if significantly displaced
                const force = distance * 0.05; // Gentle shape restoration
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                particle.applyForce(fx, fy);
            }
        }

        // 5. Handle inner-outer particle collisions to prevent pushing
        this.handleInnerOuterCollisions();
    }
    /**
     * Apply simplified surface tension for smoothness
     */
    private applySurfaceTension(): void {
        // Simple smoothing forces between adjacent boundary particles
        for (let i = 0; i < this.outerParticles.length; i++) {
            const current = this.outerParticles[i];
            const prev =
                this.outerParticles[
                    i === 0 ? this.outerParticles.length - 1 : i - 1
                ];
            const next =
                this.outerParticles[(i + 1) % this.outerParticles.length];

            // Simple averaging force for smoothness
            const avgX = (prev.x + next.x) * 0.5;
            const avgY = (prev.y + next.y) * 0.5;

            const dx = avgX - current.x;
            const dy = avgY - current.y;

            const force = this.surfaceTension * 0.1; // Very gentle smoothing
            current.applyForce(dx * force, dy * force);
        }
    }

    /**
     * Apply simplified internal pressure
     */
    /**
     * Apply simplified internal pressure
     */
    private applyInternalPressure(): void {
        // Simple outward pressure from center to maintain volume
        for (const particle of this.outerParticles) {
            const dx = particle.x - this.centerParticle.x;
            const dy = particle.y - this.centerParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0 && distance < this.radius) {
                const pressure =
                    this.internalPressure * (1 - distance / this.radius);
                const fx = (dx / distance) * pressure;
                const fy = (dy / distance) * pressure;
                particle.applyForce(fx, fy);
            }
        }

        // Lighter pressure for inner particles
        for (const particle of this.innerParticles) {
            const dx = particle.x - this.centerParticle.x;
            const dy = particle.y - this.centerParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                const pressure = this.internalPressure * 0.3;
                const fx = (dx / distance) * pressure;
                const fy = (dy / distance) * pressure;
                particle.applyForce(fx, fy);
            }
        }
    }

    /**
     * Apply simplified cohesion forces
     */
    /**
     * Apply simplified cohesion forces
     */
    private applyCohesionForces(): void {
        // Only apply cohesion between nearby particles to prevent global attraction
        const cohesionRange = this.radius * 0.6; // Reduced range

        // Only check cohesion for particles that are close
        for (let i = 0; i < this.allParticles.length; i++) {
            for (let j = i + 1; j < this.allParticles.length; j++) {
                const p1 = this.allParticles[i];
                const p2 = this.allParticles[j];

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0 && distance < cohesionRange) {
                    const cohesionForce =
                        this.cohesionStrength *
                        (1 - distance / cohesionRange) *
                        0.5;
                    const fx = (dx / distance) * cohesionForce;
                    const fy = (dy / distance) * cohesionForce;

                    p1.applyForce(fx, fy);
                    p2.applyForce(-fx, -fy);
                }
            }
        }
    }

    /**
     * Apply shape restoration forces to maintain original form
     * (Currently unused - kept for potential future use)
     */
    /* private applyShapeRestorationForces(): void {
        if (this.originalPositions.length !== this.allParticles.length) return;

        // Calculate current center
        let currentCenterX = 0;
        let currentCenterY = 0;
        for (const particle of this.allParticles) {
            currentCenterX += particle.x;
            currentCenterY += particle.y;
        }
        currentCenterX /= this.allParticles.length;
        currentCenterY /= this.allParticles.length;

        // Apply restoration forces only when significantly displaced
        for (let i = 0; i < this.allParticles.length; i++) {
            const particle = this.allParticles[i];
            const originalPos = this.originalPositions[i];
            
            // Calculate ideal position based on current center
            const idealX = currentCenterX + originalPos.x;
            const idealY = currentCenterY + originalPos.y;
            
            // Apply gentle restoration force
            const dx = idealX - particle.x;
            const dy = idealY - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only restore if significantly displaced and moving slowly
            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            if (distance > 8 && speed < 1) { // Only when displaced and not moving fast
                const force = Math.min(distance * this.shapeRestoreStrength, 0.1);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                
                particle.applyForce(fx, fy);
            }
        }
    } */

    /**
     * Keep center particle within the outer boundary
     */
    private applyCenterConstraints(): void {
        // Calculate the boundary center from outer particles
        let boundaryX = 0;
        let boundaryY = 0;
        for (const particle of this.outerParticles) {
            boundaryX += particle.x;
            boundaryY += particle.y;
        }
        boundaryX /= this.outerParticles.length;
        boundaryY /= this.outerParticles.length;

        // Find the maximum allowed distance from boundary center
        let minDistToOuter = Infinity;
        for (const outer of this.outerParticles) {
            const dist = Math.sqrt(
                Math.pow(outer.x - boundaryX, 2) +
                    Math.pow(outer.y - boundaryY, 2)
            );
            minDistToOuter = Math.min(minDistToOuter, dist);
        }

        // Constrain center particle to stay within 50% of the boundary (stronger)
        const maxAllowedDist = minDistToOuter * 0.5; // Reduced from 0.6
        const centerDist = Math.sqrt(
            Math.pow(this.centerParticle.x - boundaryX, 2) +
                Math.pow(this.centerParticle.y - boundaryY, 2)
        );

        if (centerDist > maxAllowedDist) {
            // Push center particle back toward boundary center (stronger force)
            const dx = boundaryX - this.centerParticle.x;
            const dy = boundaryY - this.centerParticle.y;
            const pushStrength = (centerDist - maxAllowedDist) * 1.5; // Increased from 0.8

            this.centerParticle.applyForce(
                (dx * pushStrength) / centerDist,
                (dy * pushStrength) / centerDist
            );
        }
    }

    /**
     * Handle keyboard input for movement
     */
    public handleInput(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
        const moveForce = 0.5;
        const jumpForce = -8;

        // Horizontal movement
        if (cursors.left?.isDown) {
            for (const particle of this.allParticles) {
                particle.applyForce(-moveForce, 0);
            }
        }
        if (cursors.right?.isDown) {
            for (const particle of this.allParticles) {
                particle.applyForce(moveForce, 0);
            }
        }

        // Jumping
        if (cursors.space?.isDown || cursors.up?.isDown) {
            // Check if slime is on ground (simple check)
            const lowestParticle = this.outerParticles.reduce(
                (lowest, particle) =>
                    particle.y > lowest.y ? particle : lowest
            );

            if (lowestParticle.y > this.scene.scale.height - 100) {
                for (const particle of this.allParticles) {
                    particle.applyForce(0, jumpForce);
                }
            }
        }
    }

    /**
     * Update physics simulation with strong structural constraints
     */
    public update(deltaTime: number = 1): void {
        // Apply forces in order of importance
        this.applyStructuralForces(); // MOST IMPORTANT - maintain shape
        this.applyCenterConstraints(); // Keep center within boundary
        this.applyInternalPressure(); // Maintain volume
        this.applySurfaceTension(); // Smooth boundary
        this.applyCohesionForces(); // Particle attraction
        // Shape restoration is less important now due to structural forces

        // Update all particles
        for (const particle of this.allParticles) {
            particle.update(
                deltaTime,
                this.gravity,
                this.viscosity,
                this.maxSpeed
            );
        }

        // Prevent unwanted drift by checking for net movement
        this.preventDrift();

        // Update center position (average of all particles)
        let totalX = 0;
        let totalY = 0;
        for (const particle of this.allParticles) {
            totalX += particle.x;
            totalY += particle.y;
        }
        this.centerX = totalX / this.allParticles.length;
        this.centerY = totalY / this.allParticles.length;

        // Update visual representation
        this.updateGraphics();
    }

    /**
     * Update visual graphics
     */
    private updateGraphics(): void {
        this.graphics.clear();

        // Draw outer boundary as a filled shape
        this.graphics.fillStyle(0x3dd9d5, 0.8);
        this.graphics.beginPath();

        if (this.outerParticles.length > 0) {
            this.graphics.moveTo(
                this.outerParticles[0].x,
                this.outerParticles[0].y
            );

            for (let i = 1; i < this.outerParticles.length; i++) {
                this.graphics.lineTo(
                    this.outerParticles[i].x,
                    this.outerParticles[i].y
                );
            }

            // Close the shape
            this.graphics.closePath();
            this.graphics.fillPath();

            // Add outline
            this.graphics.lineStyle(2, 0xffffff, 0.6);
            this.graphics.strokePath();
        }

        // Draw inner area with slight transparency
        this.graphics.fillStyle(0x5df4f0, 0.3);
        if (this.innerParticles.length > 0) {
            this.graphics.beginPath();
            this.graphics.moveTo(
                this.innerParticles[0].x,
                this.innerParticles[0].y
            );

            for (let i = 1; i < this.innerParticles.length; i++) {
                this.graphics.lineTo(
                    this.innerParticles[i].x,
                    this.innerParticles[i].y
                );
            }

            this.graphics.closePath();
            this.graphics.fillPath();
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        for (const particle of this.allParticles) {
            particle.destroyGraphic();
        }
        this.graphics.destroy();
        this.allParticles = [];
        this.outerParticles = [];
        this.innerParticles = [];
    }

    /**
     * Toggle debug particle visibility
     */
    public toggleDebugParticles(): void {
        this.showDebugParticles = !this.showDebugParticles;

        for (const particle of this.allParticles) {
            if (this.showDebugParticles) {
                if (!particle.graphic) {
                    const color = this.outerParticles.includes(particle)
                        ? 0x00ff00
                        : this.innerParticles.includes(particle)
                        ? 0x0088ff
                        : 0xff0000;
                    particle.createGraphic(this.scene, color, 0.7);
                }
            } else {
                particle.destroyGraphic();
            }
        }
    }

    /**
     * Handle collisions between inner and outer particles to prevent pushing
     */
    private handleInnerOuterCollisions(): void {
        const collisionDistance = 8; // Minimum distance between inner and outer particles

        for (const inner of this.innerParticles) {
            for (const outer of this.outerParticles) {
                const dx = inner.x - outer.x;
                const dy = inner.y - outer.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < collisionDistance && distance > 0) {
                    // Collision detected - push inner particle away, don't push outer
                    const overlap = collisionDistance - distance;
                    const pushStrength = overlap * 0.5;

                    const fx = (dx / distance) * pushStrength;
                    const fy = (dy / distance) * pushStrength;

                    // Only push the inner particle back toward center
                    inner.applyForce(fx, fy);

                    // Add damping to prevent bouncing
                    inner.vx *= 0.7;
                    inner.vy *= 0.7;
                }
            }
        }
    }

    /**
     * Prevent unwanted drift caused by force imbalances
     */
    private preventDrift(): void {
        // Calculate average velocity of all particles
        let avgVx = 0;
        let avgVy = 0;
        for (const particle of this.allParticles) {
            avgVx += particle.vx;
            avgVy += particle.vy;
        }
        avgVx /= this.allParticles.length;
        avgVy /= this.allParticles.length;

        // If there's significant horizontal drift without user input, counter it
        const driftThreshold = 0.2;
        if (Math.abs(avgVx) > driftThreshold) {
            const correction = -avgVx * 0.1; // Gentle correction
            for (const particle of this.allParticles) {
                particle.vx += correction;
            }
        }

        // Also prevent individual particles from drifting too much
        for (const inner of this.innerParticles) {
            // If inner particle is moving too fast horizontally, slow it down
            if (Math.abs(inner.vx) > 2) {
                inner.vx *= 0.8;
            }
        }
    }
}
