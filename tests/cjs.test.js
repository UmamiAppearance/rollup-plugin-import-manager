import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { DebuggingError } from "../src/errors.js";


test("selecting unit by module name", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.cjs.cjs",
            plugins: [
                importManager({
                    units: {
                        file: "**/hi.cjs.cjs",
                        module: "hello",
                        actions: "debug"
                    }
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.cjs");
});


test("selecting unit by hash", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.cjs.cjs",
            plugins: [
                importManager({
                    units: {
                        file: "**/hi.cjs.cjs",
                        hash: 421604043,
                        actions: "debug"
                    }
                })
            ]
        }); 
    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.cjs");
});


test("selecting unit by id", async (t) => {
    
    const debug = await t.throwsAsync(() => {
        return rollup({
            input: "./tests/fixtures/hi.cjs.cjs",
            plugins: [
                importManager({
                    warnings: false,
                    units: {
                        file: "**/hi.cjs.cjs",
                        id: 3000,
                        actions: "debug"
                    }
                })
            ]
        }); 

    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.cjs");
});


test("removing import statement", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    module: "hello",
                    actions: "remove"
                }
            })
        ]
    });

    t.truthy(bundle.watchFiles.length === 1);
});


test("changing a module (renaming)", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    module: "hello",
                    actions: {
                        select: "module",
                        rename: "./lib/hello-clone.cjs"
                    }
                }
            })
        ]
    });

    const importVal = bundle.cache.modules.at(0).ast    // parse tree
        .body.at(0).declarations.at(0)                  // first declaration
        .init.arguments.at(0).value;                    // first arguments value

    t.is(importVal, "./lib/hello-clone.cjs");
});


test("changing a module (renaming) with 'modType': raw", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    module: "hello",
                    actions: {
                        select: "module",
                        rename: "'./lib/hello-clone.cjs'",
                        modType: "raw"
                    }
                }
            })
        ]
    });

    const importVal = bundle.cache.modules.at(0).ast    // parse tree
        .body.at(0).declarations.at(0)                  // first declaration
        .init.arguments.at(0).value;                    // first arguments value

    t.is(importVal, "./lib/hello-clone.cjs");
});


test("creating an import statement", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    createModule: "./lib/create.js",
                    type: "cjs",
                    const: "create"
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(0).code;
    const node = bundle
        .cache.modules.at(0).ast    // parse tree
        .body.at(1);                // first import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "const create = require(\"./lib/create.js\");"
    );
});


test("appending an import statement after a specific module", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    createModule: "./lib/create.js",
                    type: "cjs",
                    var: "create",
                    append: {
                        module: "hello"
                    }
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(0).code;
    const node = bundle
        .cache.modules.at(0).ast    // parse tree
        .body.at(1);                // second import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "var create = require(\"./lib/create.js\");"
    );
});


test("prepending a manual created statement before a specific module, selected via hash", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.cjs.cjs",
                    addCode: "const create = require(\"./lib/create.js\");\n",
                    prepend: {
                        hash: 421604043
                    }
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(0).code;
    const astBody = bundle.cache.modules.at(0).ast.body;

    const nodeStatement = astBody.at(0);
    const importStatement = code.slice(nodeStatement.start, nodeStatement.end);

    t.is(
        importStatement,
        "const create = require(\"./lib/create.js\");"
    );
});


test("replacing a statement with a manual created statement, selected via id", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.cjs.cjs",
        plugins: [
            importManager({
                warnings: false,
                units: {
                    file: "**/hi.cjs.cjs",
                    addCode: "var hi = require(\"./lib/create.js\");\n",
                    replace: {
                        id: 3000
                    }
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(0).code;
    const astBody = bundle.cache.modules.at(0).ast.body;

    const nodeStatement = astBody.at(0);
    const importStatement = code.slice(nodeStatement.start, nodeStatement.end);

    t.is(
        importStatement,
        "var hi = require(\"./lib/create.js\");"
    );
});
