import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";

test("hello", async (t) => {
    const bundle = await rollup({
        input: "./fixtures/hi.js",
        plugins: [
            importManager({
                file: "hi.js",
                module: "hello",
                actions: {
                    select: "members",
                    name: "hello",
                    rename: "helloWorld",
                    keepAlias: true
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    t.is(output, "hello");
});
