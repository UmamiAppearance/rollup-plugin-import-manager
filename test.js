const imports = `import name from "module-name";
import * as name from "module-name";import { member } from "module-name";
import { member as alias } from "module-name";
import { member1 , member2 } from "module-name";
import { member1, member2 as alias2, member3 as alias3 } from "module-name";
import defaultMember, { member, member2 } from "module-name";
import defaultMember, * as alias from "module-name"
import defaultMember from "module-name";
/* jdwjd
oh boy */ import "module-name";

// goodbye

code 1
code 2
/* NO */ // ciao
code 3
/*
NO
*/ code4
code 5
/* NO */ code 6 /* NO */ code + // nope
code 7
code 8 /*
NO */code 9
/* sdjiw */const x = import("./module-path");
// woaannsjfnfknjkews
`

const MagicString = require("magic-string")


const manager = {
    codeArray: imports.split("\n"),
    imports: []
}


const replaceStrings = line => {
    const strCollection = line.toString().matchAll(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
    for (;;) {
        const next = strCollection.next();
        if (next.done) {
            break;
        }
        const match = next.value; 
        line.overwrite(match.index, match.index+match[0].length, "-".repeat(match[0].length));
    }
}

const handleSLC = (purgedLine, ncLine) => {
    const line = purgedLine.toString();
    const match = line.match(/\/\/.*/);
    if (match) {
        const len = match[0].length;
        purgedLine.overwrite(match.index, match.index+len, "-".repeat(len));
        ncLine.overwrite(match.index, match.index+len, "-".repeat(len));
    }
}

// recursive multiline match
const handleMLC = (purgedLine, ncLine, mlc) => {

    const inner = (pl, ncl, mlc) => {
        let plSub = "";
        let nclSub = "";

        if (!mlc) {
            const match = pl.match(/\/\*/);
            if (match) {
                const l = match.index;
                [ plSub, nclSub, mlc ] = inner(pl.slice(l), ncl.slice(l), true);
                pl = pl.slice(0, l);
                ncl = ncl.slice(0, l);
                //console.log("sliceA", pl);
            }
        }
        
        else {
            const match = pl.match(/\*\//);
            let l = pl.length;
            if (match) {
                l = match.index+2;
                [ plSub, nclSub, mlc ] = inner(pl.slice(l), ncl.slice(l), false);
            }
            pl = "-".repeat(l);
            ncl = "-".repeat(l);
        }

        pl += plSub;
        ncl += nclSub;

        return [pl, ncl, mlc];
    }

    let pl = purgedLine.toString();
    let ncl = ncLine.toString();
    let len = pl.length;

    if (len) {
        [ pl, ncl, mlc ] = inner(pl, ncl, mlc);
        purgedLine.overwrite(0, len, pl);
        ncLine.overwrite(0, len, ncl)
    }
    
    return mlc;
}

let mlc = false;
manager.codeArray.forEach((line, i) => {

    // no comments, no strings
    let purgedLine = new MagicString(line);

    // no comments line
    let ncLine  = new MagicString(line);
    
    // remove all strings 
    replaceStrings(purgedLine);

    // remove single line comments
    handleSLC(purgedLine, ncLine);
    
    // remove multi line comments
    mlc = handleMLC(purgedLine, ncLine, mlc);
    
    //console.log("line", i+1, "hasMLC", hasMLC)
    console.log(i+1, ":", ncLine.toString());
    
    if (purgedLine.toString().match(/(import)/)) {
        // cf. https://gist.github.com/manekinekko/7e58a17bc62a9be47172
        const importCollection = ncLine.toString().matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
        for (;;) {
            const next = importCollection.next();
            if (next.done) {
                break;
            }
            const match = next.value;
            //console.log(match);
        }

        const imp = {
            index: i,
            line: new MagicString(line),
        }
        manager.imports.push(imp);
        //console.log(imp.line.toString());
    }
});

//console.log(manager.imports);

