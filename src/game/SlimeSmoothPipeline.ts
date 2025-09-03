import Phaser from "phaser";

// Simple alpha blur + threshold smoothing pipeline for the slime graphics.
export class SlimeSmoothPipeline extends Phaser.Renderer.WebGL.Pipelines
    .SinglePipeline {
    constructor(game: Phaser.Game) {
        super({
            game,
            fragShader: `
            precision mediump float;
            uniform sampler2D uMainSampler;
            varying vec2 outTexCoord;
            void main(){
                vec4 base = texture2D(uMainSampler, outTexCoord);
                float off = 1.5/1024.0; // assume width ~1024, fine for demo
                float acc = 0.0;
                for(int dx=-1; dx<=1; dx++){
                  for(int dy=-1; dy<=1; dy++){
                    acc += texture2D(uMainSampler, outTexCoord + vec2(float(dx)*off, float(dy)*off)).a;
                  }
                }
                acc /= 9.0;
                float a = smoothstep(0.10, 0.45, acc);
                // tint slightly
                vec3 col = mix(vec3(0.18,0.9,0.85), base.rgb, 0.5);
                gl_FragColor = vec4(col, a * base.a);
            }
            `,
        });
    }
}

export default SlimeSmoothPipeline;
