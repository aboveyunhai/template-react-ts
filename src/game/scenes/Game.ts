import { EventBus } from "../EventBus";
import { Scene } from "phaser";
import { Slime } from "../soft-body-proc-anim-main/slime";
import { createSeawheatBackground } from "../seawheat";

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    seawheatBg?: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    slimeGraphics: Phaser.GameObjects.Graphics | undefined;
    slime: Slime | undefined;

    constructor() {
        super("Game");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor("#000000");

        // Static pixel-art styled background (non-interactive)
        this.seawheatBg = createSeawheatBackground(this, {
            depth: -100,
            alpha: 0.35,
        });

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

        // Enable Matter world bounds so future physics bodies can collide with edges
        this.matter.world.setBounds(0, 0, this.scale.width, this.scale.height);

        this.slimeGraphics = this.add.graphics();
        this.slime = new Slime(this, new Phaser.Math.Vector2(400, 300));

        const circleGraphics = this.add.graphics();
        circleGraphics.fillStyle(0x888888, 1);
        circleGraphics.fillCircle(600, 400, 30);

        // Add a matching Matter static circle so the soft-body points can
        // collide against it using Matter.Query in Blob.ts
        this.matter.add.circle(600, 400, 30, { isStatic: true });

        this.cursors = this.input.keyboard!.createCursorKeys();
        EventBus.emit("current-scene-ready", this);
    }

    changeScene() {
        this.scene.start("GameOver");
    }

    update(_time: number) {
        if (this.slime && this.slimeGraphics) {
            this.slime.update();
            this.slimeGraphics.clear();
            this.slime.render(this.slimeGraphics);
        }
    }
}
