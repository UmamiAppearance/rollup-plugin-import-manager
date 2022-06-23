import Diff from "diff";
import { blue, bold, red, green, gray } from "colorette";


/**
 * Adds an angle bracket to each line of a
 * text section.
 * @param {string} angle - '>' or '<'
 * @param {string} txt - The text section.
 * @returns {string} - The given text section with an angle bracket and a space in front of each line. 
 */
const addAngles = (angle, txt) => {
    const txtArr = txt.split("\n");
    let lastChar = "";
    if (txt.at(-1) === "\n") {
        lastChar = "\n";
        txtArr.pop();
    }
    let output = txtArr.map(line => `${angle} ${line}`).join("\n");
    output += lastChar;
    return output;
};

/**
 * Prints an output in the mould of GNU diff when
 * called with no parameters other than the files.
 * But more picturesque, thanks to red and green
 * colors...
 * Also possible is a "file" mode. This variant
 * shows the whole file with added and removed
 * lines.
 * @param {string} source - The original code.
 * @param {string} code - The modified code.
 * @param {string} [diffOption] - As passed by the user. If the value is 'file' also unchanged code is printed.  
 */
const showDiff = (filename, source, code, diffOption) => {
    const fileMode = diffOption == "file";
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
                msg = green(addAngles(">", part.value));
            } else if (part.removed) {
                msg = red(addAngles("<", part.value));
            } else {
                msg = part.value;
            }
            process.stdout.write(msg);
        });
        process.stdout.write("\n");
    
    }
        
    else {
        const diff = Diff.structuredPatch("", "", source, code, "", "", {
            context: 0
        });
        
        for (const part of diff.hunks) {

            // add
            if (part.oldLines === 0) {
                let info = `${part.oldStart}a${part.newStart}`;
                if (part.newLines > 1) {
                    info += `,${part.newStart+part.newLines-1}`;
                }
                console.log(bold(info));
                part.lines.forEach(line => console.log(green(`> ${line.slice(1)}`)));
            }
            
            // delete
            else if (part.newLines === 0) {
                let info = String(part.oldStart);
                if (part.oldLines > 1) {
                    info += `,${part.oldStart+part.oldLines-1}`;
                }
                info += `d${part.newLines}`;
                console.log(bold(info));
                part.lines.forEach(line => console.log(red(`< ${line.slice(1)}`)));
            }
            
            // change
            else {
                let info = String(part.oldStart);
                if (part.oldLines > 1) {
                    info += `,${part.oldStart+part.oldLines-1}`;
                }
                info += `c${part.newStart}`;
                if (part.newLines > 1) {
                    info += `,${part.newStart+part.newLines-1}`;
                }
                console.log(bold(info));
                
                let plus = false;
                part.lines.forEach((line, i) => {
                    if (plus) {
                        console.log(green(`> ${line.slice(1)}`));
                    } else {
                        console.log(red(`< ${line.slice(1)}`));
                        if (part.lines[i+1].at(0) === "+") {
                            console.log("---");
                            plus = true;
                        }
                    }
                });
            }
        }
    }
     
    console.log(gray("<<< END\n"));
};

export default showDiff;
