import Diff from "diff";
import { blue, bold, red, green, gray } from "colorette";


/**
 * Adds an angle bracket to each line.
 * @param {string} sign - '>' or '<'
 * @param {string} txt - The text section.
 * @returns {string} - The given text section with an angle bracket and a space in front of each line. 
 */
const addSign = (sign, txt) => {
    const txtArr = txt.split("\n");
    let lastChar = "";
    if (txt.at(-1) === "\n") {
        lastChar = "\n";
        txtArr.pop();
    }
    let output = txtArr.map(line => sign+line).join("\n");
    output += lastChar;
    return output;
}

/**
 * Prints an output in the mould of GNU diff when
 * called no parameters other than the files. But
 * with colors.
 * @param {string} source - The original code.
 * @param {string} code - The modified code.
 * @param {*} [diffOption] - As passed by the user. If the value is 'all' also unchanged code is printed.  
 */
const showDiff = (filename, source, code, diffOption) => {
    const fileMode = diffOption == "file"
    console.log(code);

    console.log(bold(blue(
        `(plugin ImportManager) diff for file '${filename}':`
    )));
    
    console.log(gray("BEGIN >>>"));

    if (fileMode) {
        const diff = Diff.diffLines(source, code);
        
        diff.forEach((part) => {
            let msg;
            if (part.added) {
                msg = green(addSign("+", part.value));
            } else if (part.removed) {
                msg = red(addSign("-", part.value));
            } else {
                msg = part.value;
            }
            process.stdout.write(msg);
        });
    
    }
        
    else {
        const diff = Diff.structuredPatch("", "", source, code, "", "", {
            context: 0
        });
        console.log(diff);
        for (const part of diff.hunks) {

            let add = false;
            let del = false;
            let change = false;
            const content = part.lines;

            if (part.oldLines === 0) {
                add = true;
            } else {
                del = part.newLines === 0;
                change = !del;
            }

            let info = "";
            if (add) {
                info += `${part.oldStart}a${part.newStart}`;
                if (part.newLines > 1) {
                    info += `,${part.newStart+part.newLines-1}`;
                }
                console.log(bold(info));
                content.forEach(line => console.log(green(line)));
            } else if (del) {
                info += part.oldStart;
                if (part.oldLines > 1) {
                    info += `,${part.oldStart+part.oldLines-1}`;
                }
                info += `d${part.newLines}`;

                console.log(bold(info));
                content.forEach(line => console.log(red(line)));
            } else {
                let plus = false;
                content.forEach((line, i) => {
                    if (plus) {
                        console.log(green(line));
                    } else {
                        console.log(red(line));
                        if (content[i+1].at(0) === "+") {
                            console.log("---");
                            plus = true;
                        }
                    }
                });
            }


            /*
            console.log({
                add,
                del,
                change,
                text: content
            });
            */
        }
    }
     
    console.log(gray("\n<<< END\n"));
}

export default showDiff;
