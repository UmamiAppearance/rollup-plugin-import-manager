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
/* NO */ code 6 /* NO */ code +
code 7
code 8 /*
NO */code 9
/* sdjiw */const x = import("./module-path");

`

const MagicString = require("magic-string")


const manager = {
    codeArray: imports.split("\n"),
    imports: []
}



// test if another comment starts and stop
// processing in that case
const testFollowUpComment = (line, lIndex, start, end) => {
    if (line.slice(start, end).match(/(\/\/|\/\*)/)) {
        throw new Error(`File cannot be processed. Unclear comment structure at line '${lIndex+1}'`);
    }
}

const removeStrings = line => line.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, "");

handleSLC = (line) => {
    const cleanedLine = line.replace(/\/\/.*/, "");
    const match = line !== cleanedLine;
    return [cleanedLine, match];
}

// recursive multiline match
const getMLC = (line, mlc, modified=false) => {
    let subLine = "";

    if (!mlc) {
        const match = line.match(/\/\*/);
        if (match) {
            modified = true;
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), true);
            line = line.slice(0, match.index);
        }
    }
    
    else {
        const match = line.match(/\*\//);
        if (match) {
            modified = true;
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), false);
        }
        line = "";
    }

    line += subLine;

    return [line, mlc, modified];
}

let mlc = false;
manager.codeArray.forEach((line, i) => {
    
    // remove all strings 
    let cleanedLine = removeStrings(line);

    // remove single line comments
    let hasSLC;
    [ cleanedLine, hasSLC ] = handleSLC(cleanedLine);
    
    // remove multi line comments
    let hasMLC;
    [ cleanedLine, mlc, hasMLC ] = getMLC(cleanedLine, mlc);
    
    //console.log("line", i+1, "hasSLC", hasSLC, "hasMLC", hasMLC)
    console.log(i+1, ":", cleanedLine);

    if (cleanedLine.match(/(import)/)) {
        // cf. 
        const importCollection = line.matchAll(/import(?:["'\s]*([\w*{}\n, ]+)from\s*)?["'\s]*([@\w/_-]+)["'\s]*;?/g);
        for (;;) {
            const next = importCollection.next();
            if (next.done) {
                break;
            }
            const match = next.value;
            console.log(match);
        }

        const imp = {
            index: i,
            line: new MagicString(line),
            hasMLC,
            hasSLC
        }
        manager.imports.push(imp);
        //console.log(imp.line.toString());
    }
});

//console.log(manager.imports);

