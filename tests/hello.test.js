import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";

console.log(process.cwd());

test("hello", async (t) => {
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                showDiff: null,
                //debug: "verbose",
                include: "**/hi.js",
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "members",
                        name: "hello",
                        rename: "helloWorld",
                        keepAlias: true,
                        debug: null
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    console.log(output);
    t.is(output, "hello");
});
