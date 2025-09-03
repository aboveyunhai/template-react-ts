import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { SlimeNew } from "../SlimeNew";

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;
    player!: SlimeNew;
    // containerRect!: Phaser.Geom.Rectangle;
    // containerGraphics!: Phaser.GameObjects.Graphics;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super("Game");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x000000);

        // this.background = this.add.image(512, 384, "background");
        // this.background.setAlpha(0.5);

        // this.gameText = this.add
        //     .text(512, 40, "Slime Soft Body Demo", {
        //         fontFamily: "Arial Black",
        //         fontSize: 32,
        //         color: "#ffffff",
        //         stroke: "#000000",
        //         strokeThickness: 6,
        //         align: "center",
        //     })
        //     .setOrigin(0.5)
        //     .setDepth(100);

        // create player soft body (Matter.js)
        this.player = new SlimeNew(this, 400, 300);

        // add a static ground at the bottom to keep player from free-falling
        const groundY = 720; // near bottom of 768 height
        const _ground = this.matter.add.rectangle(512, groundY, 1024, 96, {
            isStatic: true,
            friction: 0.8,
        });
        (_ground as any).__isHelper = true;
        // optionally visualize ground
        const g = this.add.graphics();
        g.fillStyle(0x333333, 1);
        g.fillRect(0, groundY - 48, 1024, 96);

        this.cursors = this.input.keyboard!.createCursorKeys();

        // (Removed slime input + obstacles; using Matter soft body Player instead)

        EventBus.emit("current-scene-ready", this);
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update(_time: number) {
        this.player.update(this.cursors);
    }
}
