import { Scene } from "phaser";

export class Preloader extends Scene {
    constructor() {
        super("Preloader");
    }

    init() {
        // Progress bar outline
        this.add
            .rectangle(this.scale.width / 2, this.scale.height / 2, 100, 32)
            .setStrokeStyle(1, 0xffffff);
        // Progress bar itself
        const bar = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            4,
            28,
            0xffffff
        );
        this.load.on("progress", (progress: number) => {
            bar.width = 4 + 460 * progress;
        });
    }

    preload() {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath("assets");

        this.load.image("logo", "logo.png");
        this.load.image("star", "star.png");
    }

    create() {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start("Game");
    }
}
