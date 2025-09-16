import Matter from "matter-js";
import Phaser from "phaser";

export class SlimeSoftBody {
    private engine: Matter.Engine;
    private world: Matter.World;
    private render: Matter.Render | null = null;
    private runner: Matter.Runner;
    private softBodies: Matter.Composite[] = [];
    private scene: Phaser.Scene;
    private graphics: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene, canvas: HTMLCanvasElement) {
        this.scene = scene;
        this.graphics = scene.add.graphics();

        // Create Matter.js engine
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;

        // Create renderer
        this.render = Matter.Render.create({
            canvas: canvas,
            engine: this.engine,
            options: {
                width: scene.scale.width,
                height: scene.scale.height,
                showAngleIndicator: false,
                wireframes: false,
                background: "transparent",
            },
        });

        // Start renderer
        Matter.Render.run(this.render);

        // Create runner
        this.runner = Matter.Runner.create();
        Matter.Runner.run(this.runner, this.engine);

        this.setupWorld();
        this.createSoftBodies();
    }

    private setupWorld(): void {
        // Add walls
        const walls = [
            // Ground
            Matter.Bodies.rectangle(
                this.scene.scale.width / 2,
                this.scene.scale.height - 25,
                this.scene.scale.width,
                50,
                { isStatic: true }
            ),
            // Left wall
            Matter.Bodies.rectangle(
                25,
                this.scene.scale.height / 2,
                50,
                this.scene.scale.height,
                { isStatic: true }
            ),
            // Right wall
            Matter.Bodies.rectangle(
                this.scene.scale.width - 25,
                this.scene.scale.height / 2,
                50,
                this.scene.scale.height,
                { isStatic: true }
            ),
            // Top wall
            Matter.Bodies.rectangle(
                this.scene.scale.width / 2,
                25,
                this.scene.scale.width,
                50,
                { isStatic: true }
            ),
        ];

        Matter.Composite.add(this.world, walls);
    }

    private createSoftBodies(): void {
        const particleOptions = {
            friction: 0.05,
            frictionStatic: 0.1,
            render: {
                visible: true,
                fillStyle: "#3dd9d5",
            },
        };

        // Create slime-shaped soft body
        const slimeSoftBody = this.createSlimeSoftbody();

        // Create other soft bodies similar to the Matter.js example
        const softBody2 = this.createSoftBody(
            600,
            200,
            4,
            3,
            0,
            0,
            true,
            6,
            particleOptions
        );
        const softBody3 = this.createSoftBody(
            150,
            300,
            3,
            3,
            0,
            0,
            true,
            5,
            particleOptions
        );

        this.softBodies.push(slimeSoftBody, softBody2, softBody3);
        Matter.Composite.add(this.world, this.softBodies);

        // Add mouse control
        if (this.render && this.render.canvas) {
            const mouse = Matter.Mouse.create(this.render.canvas);
            const mouseConstraint = Matter.MouseConstraint.create(this.engine, {
                mouse: mouse,
                constraint: {
                    stiffness: 0.9,
                    render: {
                        visible: false,
                    },
                },
            });

            Matter.Composite.add(this.world, mouseConstraint);
            this.render.mouse = mouse;
        }
    }

    /**
     * Creates a simple soft body like object - based on Matter.js example
     */
    private createSoftBody(
        xx: number,
        yy: number,
        columns: number,
        rows: number,
        columnGap: number,
        rowGap: number,
        crossBrace: boolean,
        particleRadius: number,
        particleOptions: any,
        constraintOptions?: any
    ): Matter.Composite {
        const defaultParticleOptions = {
            inertia: Infinity,
            ...particleOptions,
        };
        const defaultConstraintOptions = {
            stiffness: 0.2,
            render: { type: "line", anchors: false },
            ...constraintOptions,
        };

        // Create grid of particles
        const softBody = Matter.Composites.stack(
            xx,
            yy,
            columns,
            rows,
            columnGap,
            rowGap,
            (x: number, y: number) => {
                return Matter.Bodies.circle(
                    x,
                    y,
                    particleRadius,
                    defaultParticleOptions
                );
            }
        );

        // Connect particles with constraints (mesh)
        Matter.Composites.mesh(
            softBody,
            columns,
            rows,
            crossBrace,
            defaultConstraintOptions
        );

        softBody.label = "Soft Body";

        return softBody;
    }

    private createSlimeSoftbody(): Matter.Composite {
        const bodies: Matter.Body[] = [];
        const constraints: Matter.Constraint[] = [];

        // Large circles in the center (inner core)
        const largeCenterPositions = [
            // { x: 400, y: 200 },
            { x: 430, y: 180 },
            { x: 370, y: 180 },
            { x: 400, y: 160 },
        ];

        const largeParticleRadius = 8;
        const largeParticleOptions = {
            friction: 0.05,
            frictionStatic: 0.1,
            inertia: Infinity,
            render: {
                visible: false,
                fillStyle: "#3dd9d5",
            },
        };

        // Create large center particles
        largeCenterPositions.forEach((pos) => {
            const body = Matter.Bodies.circle(
                pos.x,
                pos.y,
                largeParticleRadius,
                largeParticleOptions
            );
            bodies.push(body);
        });

        // Small circles around the outside
        const smallParticleRadius = 8;
        const smallParticleOptions = {
            friction: 0.05,
            frictionStatic: 0.1,
            inertia: Infinity,
            render: {
                visible: false,
                fillStyle: "#2ac7c4",
            },
        };

        // Create outer ring of smaller particles in a semicircle
        const outerRadius = 60;
        const numOuterParticles = 10;
        for (let i = 0; i < numOuterParticles; i++) {
            const angle = Math.PI + (i / (numOuterParticles - 1)) * Math.PI; // Semicircle from π to 2π
            const x = 400 + Math.cos(angle) * outerRadius;
            const y = 180 + Math.sin(angle) * outerRadius * 0.6; // Slightly flattened

            const body = Matter.Bodies.circle(
                x,
                y,
                smallParticleRadius,
                smallParticleOptions
            );
            bodies.push(body);
        }

        // Create constraints - connect center particles to each other
        for (let i = 0; i < largeCenterPositions.length; i++) {
            for (let j = i + 1; j < largeCenterPositions.length; j++) {
                const bodyA = bodies[i];
                const bodyB = bodies[j];
                const distance = Math.sqrt(
                    Math.pow(bodyA.position.x - bodyB.position.x, 2) +
                        Math.pow(bodyA.position.y - bodyB.position.y, 2)
                );

                const constraint = Matter.Constraint.create({
                    bodyA: bodyA,
                    bodyB: bodyB,
                    length: distance,
                    stiffness: 0.4,
                    render: {
                        type: "line",
                        anchors: false,
                        lineWidth: 2,
                    },
                });
                constraints.push(constraint);
            }
        }

        // Connect outer particles to center particles
        const centerStartIndex = 0;
        const outerStartIndex = largeCenterPositions.length;

        for (let i = outerStartIndex; i < bodies.length; i++) {
            // Connect each outer particle to the nearest center particles
            for (
                let j = centerStartIndex;
                j < largeCenterPositions.length;
                j++
            ) {
                const outerBody = bodies[i];
                const centerBody = bodies[j];
                const distance = Math.sqrt(
                    Math.pow(outerBody.position.x - centerBody.position.x, 2) +
                        Math.pow(
                            outerBody.position.y - centerBody.position.y,
                            2
                        )
                );

                const constraint = Matter.Constraint.create({
                    bodyA: outerBody,
                    bodyB: centerBody,
                    length: distance,
                    stiffness: 0.3,
                    render: {
                        type: "line",
                        anchors: false,
                        lineWidth: 1,
                    },
                });
                constraints.push(constraint);
            }
        }

        // Connect adjacent outer particles to each other
        for (let i = outerStartIndex; i < bodies.length; i++) {
            const nextIndex = i + 1 < bodies.length ? i + 1 : outerStartIndex;
            if (nextIndex !== i) {
                const bodyA = bodies[i];
                const bodyB = bodies[nextIndex];
                const distance = Math.sqrt(
                    Math.pow(bodyA.position.x - bodyB.position.x, 2) +
                        Math.pow(bodyA.position.y - bodyB.position.y, 2)
                );

                const constraint = Matter.Constraint.create({
                    bodyA: bodyA,
                    bodyB: bodyB,
                    length: distance,
                    stiffness: 0.25,
                    render: {
                        type: "line",
                        anchors: false,
                        lineWidth: 1,
                    },
                });
                constraints.push(constraint);
            }
        }

        // Create the composite
        const slimeSoftBody = Matter.Composite.create({
            bodies: bodies,
            constraints: constraints,
            label: "Slime Soft Body",
        });

        return slimeSoftBody;
    }

    public handleInput(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
        const force = 0.01;

        // Apply forces to all soft bodies for movement
        if (cursors.left?.isDown) {
            this.softBodies.forEach((softBody) => {
                softBody.bodies.forEach((body) => {
                    Matter.Body.applyForce(body, body.position, {
                        x: -force,
                        y: 0,
                    });
                });
            });
        }

        if (cursors.right?.isDown) {
            this.softBodies.forEach((softBody) => {
                softBody.bodies.forEach((body) => {
                    Matter.Body.applyForce(body, body.position, {
                        x: force,
                        y: 0,
                    });
                });
            });
        }

        if (cursors.up?.isDown || cursors.space?.isDown) {
            this.softBodies.forEach((softBody) => {
                softBody.bodies.forEach((body) => {
                    Matter.Body.applyForce(body, body.position, {
                        x: 0,
                        y: -force * 2,
                    });
                });
            });
        }
    }

    public update(): void {
        // Matter.js handles physics automatically through the runner
        // Custom rendering updates can be added here if needed
    }

    public destroy(): void {
        if (this.render) {
            Matter.Render.stop(this.render);
        }
        Matter.Runner.stop(this.runner);
        Matter.Engine.clear(this.engine);
        this.graphics.destroy();
    }
}
