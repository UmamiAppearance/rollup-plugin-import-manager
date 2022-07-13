import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { parse } from "acorn";

console.log(process.cwd());

test("hello", async (t) => {
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                showDiff: null,
                //debug: "verbose",
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "member",
                        name: "hello",
                        rename: "helloWorld",
                        keepAlias: true,
                        //debug: null
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const parsedCode = parse(output.at(0).code, {
        ecmaVersion: "latest",
        sourceType: "module"
    });
    
    const replaced = parsedCode.body.at(0).declarations.at(0).init.body.value;

    t.is(replaced, "hello world");
});
