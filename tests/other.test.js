import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { DebuggingError, MatchError } from "../ImportManager/errors.js";


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


test("debugging a file (default method)", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.es6.js",
            plugins: [
                importManager({
                    debug: null
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const msg = debug.message;
    t.true(msg.indexOf("3541821124") > -1);

});


test("debugging a file (verbose method)", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.es6.js",
            plugins: [
                importManager({
                    debug: "verbose"
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const es6Imports = JSON.parse(debug.message).es6.units;
    t.is(es6Imports.at(0).hash, "3541821124");
    
});


test("testing include/exclude keyword", async (t) => {
    

    const plain = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.dynamic.js",
            plugins: [
                importManager({
                    debug: "verbose"
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const include = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.dynamic.js",
            plugins: [
                importManager({
                    include: "**/hello.js",
                    debug: "verbose"
                })
            ]
        });
    }, { instanceOf: DebuggingError });

    
    const exclude = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.dynamic.js",
            plugins: [
                importManager({
                    exclude: "**/hi.dynamic.js",
                    debug: "verbose"
                })
            ]
        });
    }, { instanceOf: DebuggingError });

    const plainDynImports = JSON.parse(plain.message).dynamic;
    const includeDynImports = JSON.parse(include.message).dynamic;
    const excludeDynImports = JSON.parse(exclude.message).dynamic;

    t.is(plainDynImports.count, 1);
    t.is(includeDynImports.count, 0);
    t.is(excludeDynImports.count, 0);
});

