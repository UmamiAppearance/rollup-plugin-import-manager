# rollup-plugin-import-manager

[![License](https://img.shields.io/github/license/UmamiAppearance/rollup-plugin-import-manager?color=009911&style=for-the-badge)](./LICENSE)
[![npm](https://img.shields.io/npm/v/rollup-plugin-import-manager?color=009911&style=for-the-badge)](https://www.npmjs.com/package/rollup-plugin-import-manager)

A Rollup plugin which makes it possible to manipulate import statements. Features are deleting, adding, changing the members and modules and much more. Supports ES6 Import Statements, CommonJS and Dynamic Imports.

## Table of Contents
  - [Install](#install)
  - [How it works](#how-it-works)
  - [Usage](#usage)
  - [Options](#options)
    - [`include`](#include)
    - [`exclude`](#exclude)
    - [`showDiff`](#showdiff)
    - [`debug`](#debug)
    - [`warnings`](#warnings)
    - [`units`](#units)
      - [`module`](#module-option-for-units)
      - [`hash`](#hash-option-for-units)
      - [`id`](#id-option-for-units)
      - [`file`](#file-option-for-units)
      - [`type`](#type-option-for-units)
      - [`createModule`](#createmodule-option-for-units)
      - [`addCode`](#addcode-option-for-units)
      - [`insert`](#insert-option-for-units)
      - [`append`](#append-option-for-units)
      - [`prepend`](#prepend-option-for-units)
      - [`replace`](#replace-option-for-units)
      - [`const`](#const-option-for-units)
      - [`let`](#let-option-for-units)
      - [`var`](#var-option-for-units)
      - [`global`](#global-option-for-units)
      - [`actions`](#actions-option-for-units)
        - [`debug`](#debug-option-for-actions)
        - [`select`](#select-option-for-actions)
        - [`name`](#name-option-for-actions)
        - [`alias`](#alias-option-for-actions)
        - [`rename`](#rename-option-for-actions)
        - [`modType`](#modtype-option-for-actions)
        - [`keepAlias`](#keepalias-option-for-actions)
        - [`remove`](#remove-option-for-actions)
        - [`add`](#add-option-for-actions)
        - [`cut`](#cut-option-for-actions)
  - [Examples](#examples)
    - [Creating an Import Statement](#creating-an-import-statement)
      - [Basic ES6 Statement via createModule](#basic-es6-statement-via-createmodule)
      - [Basic CJS Statement via createModule](#basic-cjs-statement-via-createmodule)
      - [Basic Dynamic Import Statement via createModule](#basic-dynamic-import-statement-via-createmodule)
      - [Manual Statement creation via addCode](#manual-statement-creation-via-addcode) 
      - [Creating an Import Statement, appended after another statement](#creating-an-import-statement-appended-after-another-statement)
      - [Creating an Import Statement, prepended before another statement](#creating-an-import-statement-prepended-before-another-statement)
      - [Creating an Import Statement by replacing another statement](#creating-an-import-statement-by-replacing-another-statement)
    - [Moving an Import Statement (cut and paste)](#moving-an-import-statement-cut-and-paste)
    - [Removing an Import Statement](#removing-an-import-statement)
      - [Shorthand Method](#shorthand-method)
    - [Changing the module](#changing-the-module)
    - [Addressing the (default) members](#addressing-the-default-members)
      - [Adding a defaultMember](#adding-a-defaultmember)
      - [Removing a member](#removing-a-member)
      - [Removing a group of members](#removing-a-group-of-members)
      - [Changing a defaultMember name](#changing-a-defaultmember-name)
        - [Renaming but keeping the alias](#renaming-but-keeping-the-alias)
        - [Addressing an alias](#addressing-an-alias)
  - [General Hints](#general-hints)
    - [Chaining](#chaining)
    - [Array and Object shortening](#array-and-object-shortening)
  - [Debugging](#debugging)
    - [Show Diff](#show-diff)
    - [Debugging Files](#debugging-files)
    - [Debugging Units](#debugging-units)
  - [License](#license)


## Install
Using npm:
```console
npm install rollup-plugin-import-manager --save-dev
```

## How it works
**rollup-plugin-import-manager** analyzes each file (which is used for the rollup building process) for import statements. Those are collected as so called unit objects, on which the user can interact with. Also the creation of new units &rarr; import statements is possible.  
  
_(The actual work is done by the outsourced program [ImportManager](https://github.com/UmamiAppearance/ImportManager) which can by used independently from this rollup-plugin.)_


## Usage
Create a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files) and import the plugin.

```js
import { importManager } from "rollup-plugin-import-manager";

export default {
    input: "src/index.js",
    output: {   
        format: "es",
        name: "myBuild",
        file: "./dist/build.js",
    },
    plugins: [
        importManager({
            units: [
                {
                    file: "**/my-file.js",
                    module: "my-module",
                    actions: [
                        // ...
                    ]
                }
            ]
        })
    ]
}
```

Then call `rollup` either via the [CLI](https://www.rollupjs.org/guide/en/#command-line-reference) or the [API](https://www.rollupjs.org/guide/en/#javascript-api).


## Options

### `include`  
Type: `String` | `Array[...String]`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should operate on. By default all files are targeted. On top of that each unit has the possibility to [target a specific file](#file-option-for-units).


### `exclude`  
Type: `String` | `Array[...String]`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), or array of patterns, which specifies the files in the build the plugin should _ignore_. By default no files are ignored.


### `showDiff`  
Type: `String`  
Default: `null`  

A [debugging](#debugging) method. If set to anything other than the string `"file"` a console output of [diff](https://github.com/kpdecker/jsdiff) is shown. It is modified a little and looks much like the default output of diff from the [GNU diffutils](https://www.gnu.org/software/diffutils/), with colors on top. If set to `"file"` the whole file with insertions and deletions is shown. Either way it only gets logged if there are any changes at all. If this is not the case, there is another (now following) global debugging method available.


### `debug`  
Type: `String`  
Default: `null`  

A [debugging](#debugging) method. If more than one source file is involved, this really only is useful in combination with [include](#include). It stops the building process by throwing an intentional error and lists all units of the first file, that is getting processed. Even more verbose information about all unit objects can be made accessible by passing the strings `verbose`, `object(s)` or `import(s)` (which one to use doesn't matter). 


### `warnings`
Type: `Boolean`  
Default: `true`  

Set to `false` to prevent displaying warning messages.


### `units`
Type: `Object` | `Array[...Object]`  
Default: `null`  

This is where the plugin comes to life. Here is the place where units are getting selected, created or removed. It has several **options** by itself. Units are objects, for multiple units pass an array of objects:

---

#### `module` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

Selects a unit by its module name. Each import has a name object. This is constructed from the module.
Path information are getting removed. Consider this basic es6 import statement:
```js
import foo from "./path/bar.js";
```
The corresponding unit assigns the module name `bar.js` which can be matched with: `module: "bar.js"`  
(The matching method is actually a little more generous. You can skip the extension or even bigger parts if you like and if this doesn't lead to multiple matches).  

Absolute imports are directly assigned as the name attribute. So, the following example can be matched with `module: "bar"`
```js
import foo from "bar";
```

Also see this [example](#changing-the-module) of matching a module and changing it.


#### `hash` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

Selects a unit by its hash. If - for any reason - it is not possible to match via the module name, this is an alternative. If for instance multiple matches are found, by [selecting via module](#module-option-for-units), an error is thrown and the corresponding hashes are logged to the console. Also by running a global [debugging](#debug), the hash can be found.  

The hash is generated by the module name, its members and also the filename. If the filename or any of the other properties are changing so is the hash. So, if a module is selected via hash and any of the properties are changed, the build will fail afterwards as the hash is no longer existent. This is why the matching via module name should be preferred.

If the hash option is set, the [module](#module-option-for-units) option will get ignored.


#### `id` <samp>[option for units]</samp>
Type: `Number`  
Default: `null`  

Internally every unit gets an Id. There are different scopes for the generation:

| type    | scope  |
| ------- | ------ | 
| es6     | `1000` |
| dynamic | `2000` |
| cjs     | `3000` |

The first ES6 Import statement of a file will have the Id `1000`, the second `1001` and so forth. For a quick test, you can select via Id (if the [filename](#file) is specified). But actually this is only an internal method to locate the statements. Testing is the only other reason to use it. If the order or number of import statements changes, this will directly affect the Ids. This selection method should therefore never been used in production.

If the Id option is set, [hash](#hash-option-for-units) and [module](#module-option-for-units) will get ignored.


#### `file` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), which specifies the file where the unit is located.  

It is always a good idea to set it, even if the files are already limited by include or exclude. The reason for this is, that a the unit is expected to be in the specified file, if the value is set and an error is thrown if it doesn't match. Otherwise it will simply be ignored, if a match is not there.  

Also for unit creation this is almost always critical. If there are multiple source files, and no file is specified, the fresh import statement will get created in any file, that is processed (and this is most probably not what you want).  

However, it is not mandatory to set it.


#### `type` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

A possibility to specify the unit type. Valid parameters are:
 * `es6`
 * `cjs`
 * `dynamic`

This argument is mainly necessary when [creating new units](#createmodule-option-for-units). Without members or default members the type cannot be guessed and needs to be specified (see this [example](#basic-cjs-statement-via-createmodule)). But the argument can also be helpful for selecting modules, if there are overlapping matches across the types. For example if es6 and dynamic import share the same module name.


#### `createModule` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Creates a new module. Every selection method ([id](#id-option-for-units), [hash](#hash-option-for-units), [module](#module-option-for-units)) will get ignored if this key is passed to a unit. Set the module (path) as the value (eg: `createModule: "./path/to/my-module.js"`). The fresh module can be [inserted](#insert-option-for-units) into the code, [appended](#append-option-for-units) or [prepended](#prepend-option-for-units) to another unit or it can [replace](#replace-option-for-units) one. There are [examples](#creating-an-import-statement) available for any of the three statement-types.


#### `addCode` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

This is the manual version of [`createModule`](#createmodule-option-for-units). The value can be any code, provided as a string, which gets [inserted](#insert-option-for-units) into the code, [appended](#append-option-for-units) or [prepended](#prepend-option-for-units) to another unit or it can [replace](#replace-option-for-units) one. This can typically be a manually created import statement or a small function, which replaces an import, but this is completely up to you. See this [example](#manual-statement-creation-via-addcode).


#### `insert` <samp>[option for units]</samp>
Type: `String`  
Default: `"bottom"`

Additional parameter for [`createModule`](#createmodule-option-for-units)/[`addCode`](#addcode-option-for-units). This is a very basic approach, to add the import statement. Setting it to `"top"` will append the statement on top of the file, directly after the the description if present.  

If set to `"bottom"`, the new statements gets inserted after the last found import statement same type. Dynamic imports also orient themselves to es6 imports, except none is found. If no statement is found at all it falls back to `"top"` insertion.  See the [examples](#creating-an-import-statement) for import creation.


#### `append` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units)/[`addCode`](#addcode-option-for-units). Instead of inserting a fresh statement at the top or bottom of the other statements, appending inserts it it after another import statement. This works by passing a [`unit`](#units) as a value. [Example](#creating-an-import-statement-appended-after-another-statement). 


#### `prepend` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units)/[`addCode`](#addcode-option-for-units). Instead of inserting a fresh statement at the top or bottom of the other statements, prepending inserts it it before another import statement. This works by passing a [`unit`](#units) as a value. [Example](#creating-an-import-statement-prepended-before-another-statement). 


#### `replace` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units)/[`addCode`](#addcode-option-for-units). Instead of somehow adding it around another unit, this keyword replaces the according import statement, which is also passed as a [`unit`](#units) object. [Example](#creating-an-import-statement-by-replacing-another-statement). 


#### `const` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units). Only has an effect if _cjs_ or _dynamic_ modules are getting created. `const` is the declarator type, the value is the variable name for the import.


#### `let` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units). Only has an effect if _cjs_ or _dynamic_ modules are getting created. `let` is the declarator type, the value is the variable name for the import.


#### `var` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units). Only has an effect if _cjs_ or _dynamic_ modules are getting created. `var` is the declarator type, the value is the variable name for the import.


#### `global` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Additional parameter for [`createModule`](#createmodule-option-for-units). Only has an effect if _cjs_ or _dynamic_ modules are getting created. If `global` is set, there is no declarator type and the variable should be declared before this statement. The value is the variable name for the import.


#### `actions` <samp>[option for units]</samp>  
Type: `Object` | `Array[...Object]`  
Default: `null`  

This is the place where the actual manipulation of a unit (and ultimately a statement) is taking place. Several actions/options can be passed, for a singular option, use an object for multiple an array of objects:

---

##### `debug` <samp>[option for actions]</samp>
Type: `Any`  
Default: `null`  

A [debugging](#debugging) method for a specific unit. This also throws an intentional debugging error, which stops the building process. Verbose information about the specific unit are logged to the console. The value is irrelevant. If this is the only action it can be passed as a string: `actions: "debug"`. See this [example](#debugging-units).


##### `select` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

Select the part you like to modify. This can be specific part (which also needs the option [name](#name-option-for-actions) to be passed):
 * `defaultMember` -> [example](#adding-a-defaultmember)
 * `member` -> [example](#removing-a-member)
 * `module` -> [example](#changing-the-module)
  
Or the groups ([example](#removing-a-group-of-members)):
 * `defaultMembers`
 * `members`
  
Common JS and dynamic imports only have the `module` available to select.


##### `name` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

For the selection of a specific part (`defaultMember` or `member`) the name needs to be specified. The name is directly related to the name of a member or default member (without its alias if present).   
A member part of `{ foobar as foo, baz }` can be selected with `name: "foobar"` and `name: "baz"`. See this [example](#changing-a-defaultmember-name).


##### `alias` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

An option to target an alias of a [selected](#select-option-for-actions) `defaultMember` or `member`. If a value is set, this will change or initially set the alias. Aliases for _members_ can also be [removed](#remove-option-for-actions), by using the _remove_ option (in this case the value for alias will be ignored) and/or by passing `null` as a value. [Examples](#addressing-an-alias).


##### `rename` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

This option is used to rename a [selected](#select-option-for-actions) specific part (`defaultMember`, `member`, `module`). The value is the new name of the selected part. See this [example](#changing-the-module).


##### `modType` <samp>[option for actions]</samp>
Type: `String`  
Default: `"string"|"raw"`  

If [renaming](#rename-option-for-actions) is done with modType `"string"` there are quotation marks set around the input by default, mode `"raw"` is not doing that. This can be useful for replacing the module by anything other than a string (which is only valid for _cjs_ and _dynamic_ imports). By default the `modType` is defined by the existing statement. If it is not a string, type `raw` is assumed (those are rare occasions).  


##### `keepAlias` <samp>[option for actions]</samp>
Type: `Boolean`  
Default: `false`  

This is an extra argument to [rename](#rename-option-for-actions) a (default) member. If true, the alias will kept untouched, otherwise it gets overwritten in the renaming process, wether a new alias is set or not. [Example](#renaming-but-keeping-the-alias).


##### `remove` <samp>[option for actions]</samp>
Type: `Any`  
Default: `null`  

When no part is selected, this removes the entire unit &rarr; import statement. The value is irrelevant. If this is the only action it can be passed as a string: `actions: "remove"`. If a part is [selected](#select-option-for-actions) (`defaultMembers`, `members`, `module` or [`alias`](#alias-option-for-actions)) only the according (most specific) part is getting removed. See e.g. this [example](#removing-a-member).


##### `add` <samp>[option for actions]</samp>
Type: `String` | `Array[...String]`
Default: `null`  

An additional parameter for `defaultMembers` or `members`. It adds one or multiple (default) members to the existing ones. The group has to be [selected](#select-option-for-actions) for the `add` keyword to have an effect. [Example](#adding-a-defaultmember).


##### `cut` <samp>[option for actions]</samp>
Type: `Any`  
Default: `null`  

_cut_ and _paste_ &rarr; _move_ a unit. Actually it [removes](#remove-option-for-actions) an import statement and passes its code snippet to [`addCode`](#addcode-option-for-units). Therefore a unit with this action, accepts the additional parameters ([`insert`](#insert-option-for-units), [`append`](#append-option-for-units), [`prepend`](#prepend-option-for-units), [`replace`](#replace-option-for-units)). [Example](#moving-an-import-statement-cut-and-paste).



## Examples

### Creating an Import Statement
There are a few options on how to create new import statements. The [`createModule`](#createmodule-option-for-units) is working a lot like the the methods for selecting existing statements.


#### Basic ES6 Statement via [`createModule`](#createmodule-option-for-units)

Without specifying [`insert`](#insert-option-for-units) or [`append`](#append-option-for-units)/[`prepend`](#prepend-option-for-units) the following import statement is getting inserted after the last import statement:

###### Source Code
```js
import "foobar";
import "bar as pub" from "baz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/foo.js", 
            actions: [
                {
                    "select": "defaultMembers",
                    "add": "bar"
                },
                {
                    "select": "members",
                    "add": "baz as qux"
                }
            ]
        }
    })
]
```

###### Bundle Code
```js
import "foobar";
import bar as pub from "baz";
import bar, { baz as qux } from "./path/to/foo.js"; // <--
```

___

#### Basic CJS Statement via [`createModule`](#createmodule-option-for-units)
CJS Imports are also supported. But this time the [`type`](#type-option-for-units) needs to be specified. Also a variable name has to be set. In this example the [`const`](#const-option-for-units) _foo_. (Other declaration types are: [`let`](#let-option-for-units), [`var`](#var-option-for-units) and [`global`](#global-option-for-units)).

_(This time the import should be placed at the very top of the file. Therefore `insert: "top"` gets additionally added to the config file.)_

###### Source Code
```js
/**
 * This is my description.
 */

const foobar = require("foobar");
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/foo.js", 
            type: "cjs",
            const: "foo",
            insert: "top"
        }
    })
]
```

###### Bundle Code
```js
/**
 * This is my description.
 */

const foo = require("./path/to/foo.js"); // <--
const foobar = require("foobar");
```

___

#### Basic Dynamic Import Statement via [`createModule`](#createmodule-option-for-units)
Almost exactly the same (only the [`type`](#type-option-for-units) differs) goes for dynamic imports:

###### Source Code
```js
import "foobar";
import "bar as pub" from "baz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/foo.js", 
            type: "dynamic",
            let: "foo"
        }
    })
]
```

###### Bundle Code
```js
import "foobar";
import "bar as pub" from "baz";
let foo = await import("./path/to/foo.js");  // <--
```

___

#### Manual Statement creation via [`addCode`](#addcode-option-for-units)
If this is all to much predetermination, the [`addCode`](#addcode-option-for-units) method is a very handy feature. It allows to inject a string containing the code snippet (most likely an import statement). Which is very different but behaves exactly the same in other regards ([inserting](#insert-option-for-units), [appending](#append-option-for-units)/[prepending](#prepend-option-for-units), [replacing](#replace-option-for-units)).
  
The [`addCode`](#addcode-option-for-units) value can contain any code you like. You probably should not get too creative. It is designed to add import statements or other short code chunks and it gets appended to existing statements. 

###### Source Code
```js
import "bar as pub" from "baz";
```

###### Rollup Config
```js
const customImport = `
let foobar;
import("fs").then(fs => fs.readFileSync("./path/to/foobar.txt"));
`;

plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            addCode: customImport,
        }
    })
]
```

###### Bundle Code
```js
import "bar as pub" from "baz";
let foobar;                                                                // <--
import("fs").then(fs => foobar = fs.readFileSync("./path/to/foobar.txt")); // <--
```
___

#### Creating an Import Statement, appended after another statement:
So far statements where created, but they were always appended to the import list or added on top of the file. Now it should be demonstrated how new statements can be appended to any available import statement. 

###### Source Code
```js
import { foo } from "bar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/baz.js", 
            actions: {
                "select": "defaultMembers",
                "add": "* as qux"
            },
            append: {
                module: "bar"
            }
        }
    })
]
```

###### Bundle Code
```js
import { foo } from "bar";
import * as qux from "./path/to/baz.js"; // <--
```
___

#### Creating an Import Statement, prepended before another statement:

###### Source Code
```js
import { foo } from "foobar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/baz.js", 
            actions: {
                "select": "defaultMembers",
                "add": "* as qux"
            },
            prepend: {
                module: "foobar"
            }
        }
    })
]
```

###### Bundle Code
```js
import * as qux from "./path/to/baz.js"; // <--
import { foo } from "foobar";
```
___

#### Creating an Import Statement by replacing another statement:

###### Source Code
```js
import { foo } from "bar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            createModule: "./path/to/baz.js", 
            actions: {
                "select": "defaultMembers",
                "add": "* as qux"
            },
            replace: {
                module: "bar"
            }
        }
    })
]
```

###### Bundle Code
```js
import * as qux from "./path/to/baz.js";
```
___

#### Moving an Import Statement (cut and paste):

###### Source Code
```js
import "foobar";
import { foo } from "bar";
import baz from "quz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "quz", 
            actions: "cut",
            insert: "top"
        }
    })
]
```

###### Bundle Code
```js
import baz from "quz";  // <----
import "foobar";             // |
import { foo } from "bar";   // |
// -----------------------------
```
___

### Removing an Import Statement

###### Source Code
```js
import { foo } from "bar";
import * as qux from "./path/to/baz.js";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: [
                {
                    remove: null,
                }
            ]
        }
    })
]
```

###### Bundle Code
```js
import * as qux from "./path/to/baz.js";
```

#### Shorthand Method
_The above example can be shortened by a lot as the removal is the only action and the value is not relevant._

```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: "remove"
        }
    })
]
```

___

### Changing the module
In this example there is a relative path that should be changed to a non relative module. This can be achieved like this:

###### Source Code
```js
import foo from "./path/to/bar.js";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar.js",
            actions: {
                select: "module",
                rename: "bar"
            }
        }
    })
]
```

###### Bundle Code
```js
import foo from "bar";
```
___

### Addressing the (default) members
`defaultMembers` and `members` are using the exact same methods. It is only important to keep in mind to address default members with `select: "defaultMembers"` or for a specific one `select: "defaultMember"`; for members `select: "members"` and `select: "member"`. 

#### Adding a defaultMember

###### Source Code
```js
import foo from "bar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: {
                select: "defaultMembers",
                add: "* as baz"
            }
        }
    })
]
```

###### Bundle Code
```js
import foo, * as baz from "bar";
```
___

**Adding multiple members, again for the same example:**

###### Source Code
```js
import foo from "bar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: {
                select: "members",
                add: [
                    "baz",
                    "qux"
                ]
            }
        }
    })
]
```

###### Bundle Code
```js
import foo, { baz, qux } from "bar";
```
___

#### Removing a member

###### Source Code
```js
import { foo, bar, baz } from "qux";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "qux",
            actions: {
                select: "member",
                name: "bar",
                remove: null
            }
        }
    })
]
```

###### Bundle Code
```js
import { foo, baz } from "qux";
``` 
___

#### Removing a group of members

###### Source Code
```js
import foo, { bar, baz } from "qux";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "qux",
            actions: {
                select: "members",
                remove: null
            }
        }
    })
]
```

###### Bundle Code
```js
import foo from "qux";
```
___

#### Changing a defaultMember name

###### Source Code
```js
import foo from "bar";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: {
                select: "defaultMember",
                name: "foo",
                rename: "baz"
            }
        }
    })
]
```

###### Bundle Code
```js
import baz from "bar";
```
___

##### Renaming but keeping the alias
By default the alias gets overwritten, but this can be prevented.

###### Source Code
```js
import { foo as bar } from "baz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: {
                select: "member",
                name: "foo",
                rename: "qux",
                keepAlias: true
            }
        }
    })
]
```

###### Bundle Code
```js
import { qux as bar } from "baz";
```
___

##### Addressing an alias
Aliases can also be addressed (_set_, _renamed_ and _removed_). All possibilities demonstrated at once via [chaining](#chaining).

###### Source Code
```js
import { foo as bar, baz as qux, quux } from "quuz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "bar",
            actions: [
                {
                    select: "member",
                    name: "foo",
                    alias: null,
                    remove: null // redundant **
                },
                {
                    select: "member",
                    name: "baz",
                    alias: "corge"
                },
                {
                    select: "member",
                    name: "quux",
                    alias: "grault"
                },
            ]
        }
    })
]

// ** remove can be set, but if the alias
//    is null, this is redundant
//    (the option is only there to keep the
//    method syntactically consistent)
```

###### Bundle Code
```js
import { foo, baz as corge, quux as grault } from "quuz";
```
___

## General Hints

### Chaining
It is possible to address every part of a statement in one go. The order usually doesn't matter. But one part should not be selected twice, which might produce unwanted results. To address every part of a [`unit`](#units) with its [`actions`](#actions-option-for-units) can be as complex as follows.

###### Source Code
```js
import foo, { bar } from "baz";
```

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "baz", 
            actions: [
                {
                    select: "defaultMember",
                    name: "foo",
                    remove: null
                },
                {
                    select: "defaultMembers",
                    add: "qux"
                },
                {
                    select: "member",
                    name: "bar",
                    alias: "quux"
                },
                {
                    select: "members",
                    add: [
                        "quuz",
                        "corge"
                    ] 
                },
                {
                    select: "module",
                    rename: "grault"
                }
            ]
        }
    })
]
```

###### Bundle Code
```js
import qux, { bar as quux, quuz, corge } from "grault";
```

This is in no way an efficient, but an example to show the complexity modifications are allowed to have. 

### Array and Object shortening
As a general rule, all arrays can be unpacked if only one member is inside. Objects with meaningless values, can be passed as a string, if syntactically allowed. An example is shown [here](#shorthand-method).


## Debugging

### Show Diff
A general hint while creating a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files): it is useful to enable [`diff`](#show-diff) logging to see how the source file is actually getting manipulated.

###### Rollup Config
```js
plugins: [
    importManager({
        showDiff: null,
        units: {
            //...
        }
    })
]
```

This will log the performed changes to the console.

### Debugging Files
To visualize the properties of a specific file, it can help to stop the building process and throw a `DebuggingError`.

###### Rollup Config
```js
plugins: [
    importManager({
        include: "**/my-file.js"
        debug: null,
        units: {
            //...
        }
    })
]
```
_Or more verbose:_

```js
plugins: [
    importManager({
        include: "**/my-file.js"
        debug: "verbose",
        units: {
            //...
        }
    })
]
```

In both cases the [`include`](#include) keyword is also passed. Otherwise the debug key would make the build process stop at the very first file it touches (if there is only one file involved at all, it is not necessary to pass it).

### Debugging Units
Also a single unit can be debugged. The keyword can be added to the existing list in an [actions](#actions-option-for-units) object.

###### Rollup Config
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "foo",
            actions: {
                select: "defaultMember",
                name: "foo",
                rename: "baz"
                debug: null
            }
        }
    })
]
```

_Or as a shorthand, if it is the only option:_
```js
plugins: [
    importManager({
        units: {
            file: "**/my-file.js",
            module: "foo",
            actions: "debug"
        }
    })
]
```

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2022-2023, UmamiAppearance
