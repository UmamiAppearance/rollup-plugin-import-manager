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
const x = import(module-path);


// bluh
 code

      // bla

code
code

/* bub */ code

hfe

code /* 
jwdjijdw
*/
`


const manager = {
    codeArray: imports.split("\n"),
    comments: {},
    limitations: {},
    importsLines: {}
}



// test if another comment starts and stop
// processing in that case
const testFollowUpComment = (line, lIndex, start, end) => {
    if (line.slice(start, end).match(/(\/\/|\/\*)/)) {
        throw new Error(`File cannot be processed. Unclear comment structure at line '${lIndex+1}'`);
    }
}


let mlc = false;
manager.codeArray.forEach((line, i) => {
    const slcMatch = line.match(/\/\//);
    if (slcMatch) {
        const contentBefore = line.slice(0, slcMatch.index);
        if (!contentBefore.trim()) {
            manager.comments[i] = true;
        }

        else {
            //
        }
    }
    
    else if (!mlc) {
        const match = line.match(/\/\*/);
        
        if (match) {
            
            let start, end;
            // test if there is code before the comment to worry about
            if (line.slice(0, line.index).trim()) {
                manager.comments[i] = true;
                
                start = 0;
                end = match.index;

                manager.limitations[i] = { start, end };
            }
            
            // test if the comment is actually across
            // multiple line, in other words test if it
            // ends directly

            const matchEnd = line.match(/\*\//);
            mlc = !(matchEnd);

            if (matchEnd) {
                testFollowUpComment(line, i, start, end);
            }
        }
    }

    else if (mlc) {
        const matchEnd = line.match(/\*\//);

        if (matchEnd) {

            let start, end;

            // test if there is code after the comment to worry about
            if (line.slice(line.index+2).trim()) {
                manager.comments[i] = true;

                start = matchEnd.index+2;
                end = -1;
                
                manager.limitations[i] = { start, end };
            }

            mlc = false;

            testFollowUpComment(line, i, start, end);
        }

        else {
            manager.comments[i] = true;
        }
    }
});

console.log(manager);

