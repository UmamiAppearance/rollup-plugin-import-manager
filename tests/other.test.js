import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { DebuggingError, MatchError } from "../src/errors.js";


test("selecting unit (by module name) without file attribute", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.es6.js",
            plugins: [
                importManager({
                    units: {
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


test("testing match error", async (t) => {
    
    await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.es6.js",
            plugins: [
                importManager({
                    units: {
                        file: "**/hi.es6.js",
                        module: "none"
                    }
                })
            ]
        }); 
    }, { instanceOf: MatchError });
});


test("testing absence of match error if no file attribute passed", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.dynamic.js",
        plugins: [
            importManager({
                units: {
                    module: "none"
                }
            })
        ]
    });

    t.truthy(bundle);
});

