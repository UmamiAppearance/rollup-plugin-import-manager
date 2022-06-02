const imports = `import name from "module-name";
import * as name from "module-name";
import { member } from "module-name";
import { member as alias } from "module-name";
import { member1 , member2 } from "module-name";
import { member1 , member2 as alias2 , [...] } from "module-name";
import defaultMember, { member [ , [...] ] } from "module-name";
import defaultMember, * as alias from "module-name";
import defaultMember from "module-name";
import "module-name";
const x = import("./module-path");


code 1
code 2
/* NO */
code 3
/*
NO
*/ code4
code 5
/* NO */ code 6 /* NO */
code 7
code 8 /*
NO */code 9

`


const manager = {
    codeArray: imports.split("\n"),
    comments: {},
    importsLines: {}
}



// test if another comment starts and stop
// processing in that case
const testFollowUpComment = (line, lIndex, start, end) => {
    if (line.slice(start, end).match(/(\/\/|\/\*)/)) {
        throw new Error(`File cannot be processed. Unclear comment structure at line '${lIndex+1}'`);
    }
}

const getMLC = (line, mlc) => {
    let subLine = "";
    if (!mlc) {
        const match = line.match(/\/\*/);
        if (match) {
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), true);
            line = line.slice(0, match.index);
        }
    }
    
    else {
        const match = line.match(/\*\//);
        if (match) {
            [ subLine, mlc ] = getMLC(line.slice(match.index+2), false);
        }
        line = "";
    }

    line += subLine;

    return [line, mlc];
}

let mlc = false;
manager.codeArray.forEach((line, i) => {
    
    // remove all strings to prevent 
    // false positives
    // eg const foo = "http://.." 
    // or console.log("import bar")
    let cleanedLine = line.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, "");
    
    // remove single line comments
    cleanedLine = cleanedLine.replace(/\/\/.*/, "");


    [ cleanedLine, mlc ] = getMLC(cleanedLine, mlc);
    // look for the beginning of multi line comments
    
/*
    // match single line comments
    if (slcMatch) {
        const contentBefore = cleanedLine.slice(0, slcMatch.index);

        // if the comment is the start of the line,
        // there is nothing to worry about
        if (!contentBefore.trim()) {
            manager.comments[i] = { ignore: true };
        }

        else {
            
            // if it is an actual comment with content before
            // store the start position to allow the analysis
            // of the code before the comment

            manager.comments[i] = {
                ignore: false,
                start: 0,
                end: slcMatch.index
            }

        }
    }
    
    else if (!mlc) {*/
        //const mlcStart = cleanedLine.match(/\/\*/);
        /*
        if (mlcStart) {
            
            // also test here if there is code before the
            // comment to worry about
            if (!line.slice(0, line.index).trim()) {
                manager.comments[i] = { ignore: true };
            }

            // test for a false positive otherwise
            else  {
                
                start = 0;
                end = mlcStart.index;

                manager.comments[i] = {
                    ignore: false,
                    start,
                    end
                };
            }
            
            // test if the comment is actually across
            // multiple lines, in other words test if*/
            // it /* ends */ directly
/*
            const matchEnd = line.match(/\*\//);
            mlc = !(matchEnd);

            // stop processing if there is any other 
            // comment following
            if (matchEnd) {
                testFollowUpComment(line, i, start, end);
            }
        }
    }

    else if (mlc) {
        const mlcEnd = line.match(/\*\//);

        if (mlcEnd) {
            mlc = false;

            let start = mlcEnd.index+2;
            end = -1

            // test if there is code after the comment to worry about
            if (!line.slice(start).trim()) {
                manager.comments[i] = { ignore: true };
            }
            
            else {   
                testFollowUpComment(line, i, start, end);         
                manager.comments[i] = {
                    ignore: false,
                    start,
                    end
                };
            }

        }

        else {
            manager.comments[i] = { ignore: true };
        }
    }*/
    console.log(cleanedLine);
});

