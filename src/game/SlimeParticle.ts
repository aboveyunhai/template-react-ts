import Phaser from "phaser";

/**
 * Individual particle that makes up the slime body
 */
export class SlimeParticle {
    public x: number;
    public y: number;
    public vx: number = 0;
    public vy: number = 0;
    public forceX: number = 0;
    public forceY: number = 0;
    public mass: number = 1;
    public radius: number = 4;
    public connections: SlimeParticle[] = [];
    public idealDistances: Map<SlimeParticle, number> = new Map();
    public isFixed: boolean = false; // For pinning particles during drag
    
    // Visual representation
    public graphic?: any;

    constructor(x: number, y: number, mass: number = 1, radius: number = 4) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.radius = radius;
    }

    /**
     * Connect this particle to another with a specific ideal distance
     */
    connectTo(other: SlimeParticle, idealDistance?: number): void {
        if (!this.connections.includes(other)) {
            this.connections.push(other);
            other.connections.push(this);
            
            // Calculate ideal distance if not provided
            const distance = idealDistance || Math.sqrt(
                Math.pow(this.x - other.x, 2) + Math.pow(this.y - other.y, 2)
            );
            
            this.idealDistances.set(other, distance);
            other.idealDistances.set(this, distance);
        }
    }

    /**
     * Apply a force to this particle
     */
    applyForce(fx: number, fy: number): void {
        this.forceX += fx;
        this.forceY += fy;
    }

    /**
     * Update particle physics
     */
    update(deltaTime: number, gravity: number = 0.3, damping: number = 0.95, maxSpeed: number = 4): void {
        if (this.isFixed) {
            this.vx = 0;
            this.vy = 0;
            this.forceX = 0;
            this.forceY = 0;
            return;
        }

        // Apply gravity
        this.forceY += gravity * this.mass;

        // Update velocity from forces
        this.vx += (this.forceX / this.mass) * deltaTime;
        this.vy += (this.forceY / this.mass) * deltaTime;

        // Apply damping (more aggressive)
        this.vx *= damping;
        this.vy *= damping;

        // Limit maximum speed (more restrictive)
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > maxSpeed) {
            const scale = maxSpeed / speed;
            this.vx *= scale;
            this.vy *= scale;
        }

        // Zero out very small velocities to prevent jitter (increased threshold)
        if (Math.abs(this.vx) < 0.03) this.vx = 0;
        if (Math.abs(this.vy) < 0.03) this.vy = 0;

        // Additional micro-velocity damping for stability
        if (speed < 0.5) {
            this.vx *= 0.8; // Extra damping for small movements
            this.vy *= 0.8;
        }

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Clear forces for next frame
        this.forceX = 0;
        this.forceY = 0;

        // Update visual if it exists
        if (this.graphic) {
            this.graphic.setPosition(this.x, this.y);
        }
    }

    /**
     * Set position directly (for dragging)
     */
    setPosition(x: number, y: number): void {
        this.x = x;
        this.y = y;
        if (this.graphic) {
            this.graphic.setPosition(x, y);
        }
    }

    /**
     * Get distance to another particle
     */
    distanceTo(other: SlimeParticle): number {
        return Math.sqrt(
            Math.pow(this.x - other.x, 2) + Math.pow(this.y - other.y, 2)
        );
    }

    /**
     * Create visual representation
     */
    createGraphic(scene: Phaser.Scene, color: number = 0x00ff00, alpha: number = 0.8): void {
        this.graphic = scene.add.circle(this.x, this.y, this.radius, color, alpha);
        this.graphic.setDepth(10);
    }

    /**
     * Destroy visual representation
     */
    destroyGraphic(): void {
        if (this.graphic) {
            this.graphic.destroy();
            this.graphic = undefined;
        }
    }
}
