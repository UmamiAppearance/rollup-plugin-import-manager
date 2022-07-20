import test from "ava";
import { parse } from "acorn";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { DebuggingError, MatchError } from "../src/errors.js";


const PARSER_OPTIONS = {
    ecmaVersion: "latest",
    sourceType: "module"
};

test("select module module by name", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.js",
            plugins: [
                importManager({
                    units: {
                        file: "**/hi.js",
                        module: "hello",
                        actions: "debug"
                    }
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.js");
});


test("select module module by hash", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.js",
            plugins: [
                importManager({
                    units: {
                        file: "**/hi.js",
                        hash: 3790884003,
                        actions: "debug"
                    }
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.js");
});


test("select module module by id", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.js",
            plugins: [
                importManager({
                    warnings: false,
                    units: {
                        file: "**/hi.js",
                        id: 1000,
                        actions: "debug"
                    }
                })
            ]
        }); 

    }, {instanceOf: DebuggingError});

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.js");
});

test("replace", async (t) => {
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
                        rename: "hallo",
                        keepAlias: true
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const parsedCode = parse(output.at(0).code, PARSER_OPTIONS);
    
    const replaced = parsedCode.body.at(0).declarations.at(0).init.body.value;

    t.is(replaced, "hallo!");
});





