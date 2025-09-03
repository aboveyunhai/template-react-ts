import Phaser from "phaser";
import { SlimePhysics } from "./SlimePhysics";

/**
 * New slime implementation using particle-based physics
 * Compatible with the existing game interface
 */
export class SlimeNew {
    scene: Phaser.Scene;
    physics: SlimePhysics;
    canJump = true;
    isOnGround = false;

    // For compatibility with existing controls
    private lastKeyTime: { left: number; right: number } = {
        left: 0,
        right: 0,
    };
    private keyHeld: { left: boolean; right: boolean } = {
        left: false,
        right: false,
    };
    private isBoosting = false;
    private doubleTapDelay = 250;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;

        // Create the physics-based slime
        this.physics = new SlimePhysics(scene, x, y, 50);

        // Set up gravity for the physics system
        this.physics.gravity = 0.4;

        // Set up collision detection
        this.setupCollisionDetection();
    }

    /**
     * Setup collision detection with static bodies
     */
    private setupCollisionDetection(): void {
        // Simple ground detection - check if lowest particle is near ground
        // This is a simplified version; in a real game you'd use proper collision detection
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

    /**
     * Check if slime is on ground
     */
    private updateGroundState(): void {
        // Get all particles to check for ground contact
        const allParticles = [
            ...this.physics.outerParticles,
            ...this.physics.innerParticles,
            this.physics.centerParticle,
        ];

        // Simple ground check - if any particle is near bottom of screen
        const groundLevel = this.scene.scale.height - 100;
        const groundThreshold = 25; // Increased threshold for better ground detection

        // Check if any particle is close to ground
        let anyParticleOnGround = false;
        for (const particle of allParticles) {
            if (particle.y >= groundLevel - groundThreshold) {
                anyParticleOnGround = true;

                // Apply ground collision
                if (particle.y > groundLevel) {
                    particle.y = groundLevel;
                    particle.vy = Math.min(0, particle.vy * -0.2); // Small bounce
                }

                // Apply ground friction
                if (Math.abs(particle.vx) > 0.1) {
                    particle.vx *= 0.85; // Less friction for better movement
                }
            }
        }

        this.isOnGround = anyParticleOnGround;
    }

    /**
     * Update method compatible with existing game interface
     */
    update(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
        // Handle double-tap detection for boost
        if (cursors.left?.isDown) {
            if (!this.keyHeld.left) this.checkDoubleTap("left");
            this.keyHeld.left = true;
        } else {
            this.keyHeld.left = false;
        }

        if (cursors.right?.isDown) {
            if (!this.keyHeld.right) this.checkDoubleTap("right");
            this.keyHeld.right = true;
        } else {
            this.keyHeld.right = false;
        }

        // Update ground state
        this.updateGroundState();

        // Enhanced movement with boost
        const baseForce = 0.2; // Further reduced from 0.3 for more stability
        const boostMultiplier = this.isBoosting ? 1.3 : 1.0; // Reduced from 1.5
        const moveForce = baseForce * boostMultiplier;

        // Apply movement forces primarily to outer particles, less to center
        if (cursors.left?.isDown) {
            // Apply full force to outer particles
            for (const particle of this.physics.outerParticles) {
                particle.applyForce(-moveForce, 0);
            }
            // Apply reduced force to inner and center particles
            for (const particle of this.physics.innerParticles) {
                particle.applyForce(-moveForce * 0.7, 0);
            }
            this.physics.centerParticle.applyForce(-moveForce * 0.5, 0);
        }

        if (cursors.right?.isDown) {
            // Apply full force to outer particles
            for (const particle of this.physics.outerParticles) {
                particle.applyForce(moveForce, 0);
            }
            // Apply reduced force to inner and center particles
            for (const particle of this.physics.innerParticles) {
                particle.applyForce(moveForce * 0.7, 0);
            }
            this.physics.centerParticle.applyForce(moveForce * 0.5, 0);
        }

        // Enhanced jumping - apply stronger force for better jumping
        if (
            (cursors.space?.isDown || cursors.up?.isDown) &&
            this.isOnGround &&
            this.canJump
        ) {
            const jumpForce = this.isBoosting ? -8 : -6; // Increased from -5 and -3

            // Apply full jump force to outer particles
            for (const particle of this.physics.outerParticles) {
                particle.applyForce(0, jumpForce);
            }
            // Apply reduced jump force to inner and center particles
            for (const particle of this.physics.innerParticles) {
                particle.applyForce(0, jumpForce * 0.8);
            }
            this.physics.centerParticle.applyForce(0, jumpForce * 0.7); // Slightly increased

            this.canJump = false;
            this.isOnGround = false;
        }

        // Reset jump ability when key is released
        if (!cursors.space?.isDown && !cursors.up?.isDown) {
            this.canJump = true;
        }

        // Reset boost when no horizontal movement
        if (!cursors.left?.isDown && !cursors.right?.isDown) {
            this.isBoosting = false;
        }

        // Update physics simulation
        this.physics.update(1.0);
    }

    /**
     * Get center position for camera tracking, etc.
     */
    getCenter(): { x: number; y: number } {
        return {
            x: this.physics.centerX,
            y: this.physics.centerY,
        };
    }

    /**
     * Get position of specific reference point (for compatibility)
     */
    getPosition(): { x: number; y: number } {
        return this.getCenter();
    }

    /**
     * Apply external force (for interactions)
     */
    applyForce(fx: number, fy: number): void {
        for (const particle of this.physics.allParticles) {
            particle.applyForce(fx, fy);
        }
    }

    /**
     * Set position (for teleporting, reset, etc.)
     */
    setPosition(x: number, y: number): void {
        const dx = x - this.physics.centerX;
        const dy = y - this.physics.centerY;

        for (const particle of this.physics.allParticles) {
            particle.setPosition(particle.x + dx, particle.y + dy);
        }

        this.physics.centerX = x;
        this.physics.centerY = y;
    }

    /**
     * Toggle debug particle visibility
     */
    toggleDebug(): void {
        this.physics.toggleDebugParticles();
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.physics.destroy();
    }

    // Additional physics parameter adjustments for fine-tuning

    /**
     * Adjust slime stiffness (how rigid vs. jiggly it is)
     */
    setStiffness(stiffness: number): void {
        this.physics.structuralStrength = stiffness;
    }

    /**
     * Adjust slime bounciness
     */
    setBounciness(bounciness: number): void {
        this.physics.surfaceTension = bounciness;
    }

    /**
     * Adjust slime friction/damping
     */
    setFriction(friction: number): void {
        this.physics.viscosity = friction;
    }
}
