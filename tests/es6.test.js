import test from "ava";
import { rollup } from "rollup";
import { importManager } from "../src/index.js";
import { DebuggingError } from "../src/errors.js";


console.log("Testing ES6 features:");

test("selecting unit by module name", async (t) => {
    
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


test("selecting unit by hash", async (t) => {
    
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


test("selecting unit by id", async (t) => {
    
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

    }, { instanceOf: DebuggingError });

    const unit = JSON.parse(debug.message);
    t.is(unit.module.name, "hello.js");
});


test("removing import statement", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
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
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "module",
                        rename: "./lib/hello-clone.js"
                    }
                }
            })
        ]
    });
     
    const modPath = Boolean(
        bundle.watchFiles.filter(f => f.indexOf("hello-clone.js") > -1).at(0)
    );

    t.truthy(modPath);
});


test("adding a member", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "members",
                        add: "bonJour"
                    }
                }
            })
        ]
    });

    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(3)           // the member at index 3
        .imported.name;             // name
    
    t.is(mod, "bonJour");
});


test("renaming a member", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "member",
                        name: "hallo",
                        rename: "bonJour"
                    }
                }
            })
        ]
    });

    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(2)           // the member at index 2
        .imported.name;             // name
    
    t.is(mod, "bonJour");
});


test("renaming a member (keeping the alias)", async (t) => {
    
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
                        rename: "bonJour",
                        keepAlias: true
                    }
                }
            })
        ]
    });

    const { output } = await bundle.generate({ format: "es" });
    const code = output.at(0).code;

    t.regex(code, /bon jour!/);
});


test("removing a member", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "member",
                        name: "hallo",
                        remove: null
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const code = output.at(0).code;

    t.notRegex(code, /hallo!/);
});


test("removing all members", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "members",
                        remove: null
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const code = output.at(0).code;

    t.notRegex(code, /hello!/);
    t.notRegex(code, /hallo!/);
});


test("adding a member alias", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "member",
                        name: "hallo",
                        alias: "hey"
                    }
                }
            })
        ]
    });
    
    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(2)           // the default member at index 2
        .local.name;                // name
    
    t.is(mod, "hey");
});


test("renaming a member alias", async (t) => {
    
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
                        alias: "hey"
                    }
                }
            })
        ]
    });
    
    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(1)           // the default member at index 2
        .local.name;                // name
    
    t.is(mod, "hey");
});


test("removing a member alias", async (t) => {
    
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
                        alias: null
                    }
                }
            })
        ]
    });
    
    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(1)           // the default member at index 2
        .local.name;                // name
    
    t.is(mod, "hello");
});


test("adding a default member (by chaining)", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: [
                        {
                            select: "members",
                            remove: null,
                        },
                        {
                            select: "defaultMembers",
                            add: "* as all"
                        }
                    ]
                }
            })
        ]
    });

    const importStatement = bundle.cache.modules.at(1).code.split("\n").at(0);
    
    t.is(
        importStatement,
        "import helloWorld, * as all from \"./lib/hello.js\";"
    );
    
});


test("renaming a default member", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "defaultMember",
                        name: "helloWorld",
                        rename: "helloEverybody"
                    }
                }
            })
        ]
    });

    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(0)           // the default member at index 0
        .local.name;                // name
    
    t.is(mod, "helloEverybody");
});


test("removing a default member (by chaining)", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: [
                        {
                            select: "members",
                            remove: null
                        },
                        {
                            select: "defaultMembers",
                            add: "* as all"
                        },
                        {
                            select: "defaultMember",
                            name: "helloWorld",
                            remove: null
                        }
                    ]
                }
            })
        ]
    });
    
    const importStatement = bundle.cache.modules.at(1).code.split("\n").at(0);

    t.is(
        importStatement,
        "import * as all from \"./lib/hello.js\";"
    );
});


test("removing all default members", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: {
                        select: "defaultMembers",
                        remove: null
                    }
                }
            })
        ]
    });
    
    const { output } = await bundle.generate({ format: "es" });
    const code = output.at(0).code;

    t.notRegex(code, /hello world!/);
    t.regex(code, /hello!/);
    t.regex(code, /hallo!/);
});


test("renaming a default member alias (by chaining)", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    module: "hello",
                    actions: [
                        {
                            select: "members",
                            remove: null
                        },
                        {
                            select: "defaultMember",
                            name: "helloWorld",
                            rename: "* as helloWorld"
                        },
                        {
                            select: "defaultMember",
                            name: "*",
                            alias: "hey"
                        }
                    ]
                }
            })
        ]
    });
    
    const mod = bundle
        .cache.modules.at(1).ast    // parse tree
        .body.at(0)                 // first import statement
        .specifiers.at(0)           // the default member at index 0
        .local.name;                // name

    t.is(mod, "hey");
});


test("creating an import statement", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    createModule: "./lib/create.js",
                    actions: [
                        {
                            select: "defaultMembers",
                            add: "salutonMondo" 
                        },
                        {
                            select: "members",
                            add: [
                                "ciao",
                                "hej",
                                "hola"
                            ]
                        }
                    ]
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(2).code;

    const node = bundle
        .cache.modules.at(2).ast    // parse tree
        .body.at(1);                // second import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "import salutonMondo, { ciao, hej, hola } from './lib/create.js';"
    );
});


test("inserting an import statement before the very first module", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    createModule: "./lib/create.js",
                    actions: {
                        select: "members",
                        add: [
                            "ciao",
                            "hola"
                        ]
                    },
                    insert: "top"
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(2).code;

    const node = bundle
        .cache.modules.at(2).ast    // parse tree
        .body.at(0);                // first import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "import { ciao, hola } from './lib/create.js';"
    );
});


test("appending an import statement after a specific module", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    createModule: "./lib/create.js",
                    actions: {
                        select: "defaultMembers",
                        add: "salutonMondo"
                    },
                    append: {
                        module: "hello"
                    }
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(2).code;

    const node = bundle
        .cache.modules.at(2).ast    // parse tree
        .body.at(1);                // second import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "import salutonMondo from './lib/create.js';"
    );
});


test("prepending a manual created statement before a specific module, selected via hash", async (t) => {
    
    const bundle = await rollup({
        input: "./tests/fixtures/hi.js",
        plugins: [
            importManager({
                units: {
                    file: "**/hi.js",
                    addCode: "import { hej } from './lib/create.js';\n",
                    prepend: {
                        hash: 3790884003
                    }
                }
            })
        ]
    });

    const code = bundle.cache.modules.at(2).code;

    const node = bundle
        .cache.modules.at(2).ast    // parse tree
        .body.at(0);                // first import statement
    

    const importStatement = code.slice(node.start, node.end);
    t.is(
        importStatement,
        "import { hej } from './lib/create.js';"
    );
});
