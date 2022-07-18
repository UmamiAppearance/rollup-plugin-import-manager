import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { parse } from "acorn";

const PARSER_OPTIONS = {
    ecmaVersion: "latest",
    sourceType: "module"
};

test("select module module by name", async (t) => {
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "member",
                        name: "hello",
                        rename: "helloWorld",
                        keepAlias: true
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const parsedCode = parse(output.at(0).code, PARSER_OPTIONS);
    
    const replaced = parsedCode.body.at(0).declarations.at(0).init.body.value;

    t.is(replaced, "hello world");
});
