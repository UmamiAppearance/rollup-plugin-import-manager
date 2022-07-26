import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";

//const consoleLog = console.log.bind(console);

test.before(t => {
    t.context.data = [];
    console.log = (...args) => t.context.data.push(args);
});

test.beforeEach(t => {
    t.context.data.length = 0;
});


test.serial("showDiff method (default)", async (t) => {

    await rollup({
        input: "./tests/fixtures/hi.dynamic.js",
        plugins: [
            importManager({
                showDiff: null,
                units: {
                    addCode: "import { hej } from './lib/create.js';",
                    replace: {
                        module: "hello"
                    }
                }
            })
        ]
    }); 

    t.context.data.shift();
    
    t.truthy(
        t.context.data.filter(l => l.indexOf("(plugin ImportManager) diff for file" > -1)).length
    );

    t.truthy(
        t.context.data.filter(l => l.indexOf("const hi = await import(\"./lib/hello.js\");" > -1)).length
    );

    t.truthy(
        t.context.data.filter(l => l.indexOf("import { hej } from './lib/create.js';" > -1)).length
    );
});


test.serial("showDiff method (file)", async (t) => {

    await rollup({
        input: "./tests/fixtures/hi.dynamic.js",
        plugins: [
            importManager({
                showDiff: "file",
                units: {
                    addCode: "import { hej } from './lib/create.js';",
                    replace: {
                        module: "hello"
                    }
                }
            })
        ]
    }); 

    t.context.data.shift();
    
    t.truthy(
        t.context.data.filter(l => l.indexOf("(plugin ImportManager) diff for file" > -1)).length
    );

    t.truthy(
        t.context.data.filter(l => l.indexOf("const hi = await import(\"./lib/hello.js\");" > -1)).length
    );

    t.truthy(
        t.context.data.filter(l => l.indexOf("import { hej } from './lib/create.js';" > -1)).length
    );

    t.truthy(
        t.context.data.filter(l => l.indexOf("date.getFullYear === 1984" > -1)).length
    );
});
