# rollup-plugin-import-manager

A Rollup plugin which makes it possible to manipulate import statement. Deleting, adding, manipulating the members. It is made for ES6 Import Statements. But for commonjs and dynamic imports at least it is possible to change the imported module.

## Install
Using npm:
```console
npm install rollup-plugin-import-manager --save-dev
```

## How it works
**rollup-plugin-import-manager** analyzes each file (which is uses for the rollup building process) for import statements. Those are converted into unit objects, which the user can interact with. Also the creation of new unites &rarr; import statements is possible. 



## Usage

Create a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files) and import the plugin, eg:

```js
import { importManager } from "rollup-plugin-import-manager";

export default {
    input: 'src/index.js',
    output: {   
        format: "es",
        name: "myBuild",
        file: "./dist/build.js",
    },
    plugins: [
        importManager({
            units: [
                "file": "index.js",
                "module": "my-module.js",
                "actions": [
                    // ...
                ]
            ]
        })
    ]
}
```

Then call `rollup` either via the [CLI](https://www.rollupjs.org/guide/en/#command-line-reference) or the [API](https://www.rollupjs.org/guide/en/#javascript-api).


## Options

### `units`

Type: `Array[...Object]`  
Default: `null`  

This is where the plugin comes to live. See LINK.

### `include`  

Type: `String` | `Array[...String]`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should operate on. By default all files are targeted. Each unit has the possibility to target a specific file. See LINK

### `exclude`  

Type: `String` | `Array[...String]`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should _ignore_. By default no files are ignored.

### `showDiff`  
Type: `String`
Default: `null`  

A debugging method. If set to anything other than the string `file` an console output of [diff](https://github.com/kpdecker/jsdiff) is shown. It is modified a little and looks much like the default output of diff from the [GNU diffutils](https://www.gnu.org/software/diffutils/), with colors on top. If set to file the whole file with insertions and deletions is shown. Either way it only gets logged if there are any changes at all. If this is the case the is another global debugging method available.

### `debug`  
Type: `String`  
Default: `null`  

If more than one source file is involved, this really only is useful in combination with [include](#include). It stops the building process by throwing an intentional error and lists all units of the file. Even more verbose information about all units objects can be made accessible by passing the strings `verbose`, `object(s)` or `import(s)` (which one to use doesn't matter). 

