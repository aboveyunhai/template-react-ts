import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import * as Phaser from "phaser";
import { Preloader } from "./scenes/Preloader";

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 512,
    height: 384,
    parent: "game-container",
    // backgroundColor: "#000000",
    physics: {
        default: "matter",
        matter: {
            debug: true,
        },
    },
    scene: [Boot, Preloader, MainGame],
};

const StartGame = (parent: string) => {
    return new Phaser.Game({ ...config, parent });
};

export default StartGame;

// class Example extends Phaser.Scene {
//     cloth: MatterJS.CompositeType;
//     constructor() {
//         super();
//     }

//     preload() {
//         this.load.setBaseURL("https://cdn.phaserfiles.com/v385");
//         this.load.image("ball", "assets/sprites/crate32.png");
//         this.load.spritesheet("balls", "assets/sprites/balls.png", {
//             frameWidth: 17,
//             frameHeight: 17,
//         });
//     }

//     create() {
//         this.matter.world.setBounds();
//         this.matter.add.mouseSpring();

//         const group = this.matter.world.nextGroup(true);

//         const particleOptions = {
//             friction: 0.00001,
//             collisionFilter: { group: group },
//             render: { visible: false },
//         };
//         const constraintOptions = { stiffness: 0.06 };

//         // softBody: function (x, y, columns, rows, columnGap, rowGap, crossBrace, particleRadius, particleOptions, constraintOptions)

//         this.cloth = this.matter.add.softBody(
//             200,
//             140,
//             20,
//             12,
//             5,
//             5,
//             false,
//             8,
//             particleOptions,
//             constraintOptions
//         );

//         for (let i = 0; i < this.cloth.bodies.length; i++) {
//             const body = this.cloth.bodies[i];

//             if (i < 20) {
//                 body.isStatic = true;
//             }
//         }

//         this.matter.add.circle(300, 500, 80, {
//             isStatic: true,
//             chamfer: { radius: 20 },
//         });
//         this.matter.add.rectangle(500, 480, 80, 80, { isStatic: true });
//         this.matter.add.rectangle(400, 609, 800, 50, { isStatic: true });
//     }
// }

// const config = {
//     type: Phaser.AUTO,
//     width: 800,
//     height: 600,
//     backgroundColor: "#000000",
//     parent: "phaser-example",
//     physics: {
//         default: "matter",
//         matter: {
//             debug: true,
//             debugBodyColor: 0xffffff,
//         },
//     },
//     scene: [Example],
// };

// const game = new Phaser.Game(config);

// export default game;
