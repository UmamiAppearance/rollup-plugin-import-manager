# rollup-plugin-import-manager

A Rollup plugin which makes it possible to manipulate import statement. Deleting, adding, manipulating the members. It is made for ES6 Import Statements. But for commonjs and dynamic imports at least it is possible to change the imported module.

## Table of Contents
  - [Install](#install)
  - [How it works](#how-it-works)
  - [Usage](#usage)
  - [Options](#options)
    - [`include`](#include)
    - [`exclude`](#exclude)
    - [`showDiff`](#showdiff)
    - [`debug`](#debug)
    - [`units`](#units)
      - [`module`](#module-option-for-units)
      - [`hash`](#hash-option-for-units)
      - [`id`](#id-option-for-units)
      - [`file`](#file-option-for-units)
      - [`type`](#type-option-for-units)
      - [`createModule`](#createmodule-option-for-units)
      - [`insert`](#insert-option-for-units)
      - [`append`](#append-option-for-units)
      - [`prepend`](#prepend-option-for-units)
      - [`replace`](#replace-option-for-units)
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
  - [Examples](#examples)
    - [Creating an Import Statement](#creating-an-import-statement)
      - [Creating an Import Statement, appended after another statement](#creating-an-import-statement-appended-after-another-statement)
      - [Creating an Import Statement, prepended before another statement](#creating-an-import-statement-prepended-before-another-statement)
      - [Creating an Import Statement by replacing another statement](#creating-an-import-statement-by-replacing-another-statement)
    - [Removing an Import Statement](#removing-an-import-statement)
      - [Shorthand Method](#shorthand-method)
    - [Changing the module](#changing-the-module)
    - [Addressing the (default) members](#addressing-the-default-members)
      - [Adding a defaultMember](#adding-a-defaultmember)
      - [Removing a member](#removing-a-member)
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
**rollup-plugin-import-manager** analyzes each file (which is uses for the rollup building process) for import statements. Those are converted into unit objects, which the user can interact with. Also the creation of new units &rarr; import statements is possible. 


## Usage

Create a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files) and import the plugin.

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

A [debugging](#debugging) method. If set to anything other than the string `"file"` a console output of [diff](https://github.com/kpdecker/jsdiff) is shown. It is modified a little and looks much like the default output of diff from the [GNU diffutils](https://www.gnu.org/software/diffutils/), with colors on top. If set to `"file"` the whole file with insertions and deletions is shown. Either way it only gets logged if there are any changes at all. If this is not the case, there is another global debugging method available:


### `debug`  
Type: `String`  
Default: `null`  

A [debugging](#debugging) method. If more than one source file is involved, this really only is useful in combination with [include](#include). It stops the building process by throwing an intentional error and lists all units of the first file, that is processed. Even more verbose information about all unit objects can be made accessible by passing the strings `verbose`, `object(s)` or `import(s)` (which one to use doesn't matter). 

### `units`
Type: `Object` | `Array[...Object]`  
Default: `null`  

This is where the plugin comes to life. Here is the place where units are getting selected, created or removed. It has several **options** by itself. Units are objects, for multiple units pass an array of objects:

---

#### `module` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

Select a unit by its module name. Each import has a name object. This is constructed from the module (path).
For relative imports the path information are getting removed. This may look like this:
```js
import foo from "./path/bar.js";
```
The internal name will be `bar.js`. And can be matched with: `module: "bar.js"`  
(The matching method is a little more generous. You can skip the extension ort even bigger parts if you like and if this doesn't lead to multiple matches).  

Absolute imports are directly taken as the name attribute. Eg:
```js
import foo from "bar";
```
The internal name will be `bar` and can be matched by that name: `module: "bar"`


#### `hash` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

Selects a unit by its hash. This is more like an emergency solution. If for any reason it is not possible to match via the module name, this is an alternative. If you ask yourself, where on earth you can figure out the hash, you can rest assured. If multiple matches are found the hashes are logged to the console. Also by running a global [debugging](#debug), the hash can be found.  

The hash is generated by the module name and its members and also the filename and path. If the filename (or path) or any of the other properties are changing so is the hash. The build will fail in this case, so no need to worry to overlook it. The matching via module name should nevertheless be preferred.

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

The first ES6 Import statement of a file will have the Id `1000`, the second `1001` and so forth. For a quick test you can select via Id (if the [filename](#file) is specified). But actually this is only an internal method to locate the statements. Testing is the only other reason to use it. If one statement is added before the one to match, the Id will change, and there is a good change to not even realize that. You have been warned (and you will get warned again by the plugin if you decide to use it). 

If the id option is set, [hash](#hash-option-for-units) and [module](#module-option-for-units) will get ignored.


#### `file` <samp>[option for units]</samp>
Type: `String`  
Default: `null`  

A [minimatch pattern](https://github.com/isaacs/minimatch), which specifies the file where the unit is located.  

It is always a good idea to set it, even if the files are already limited by include or exclude. The reason for this is, that a the unit is expected to be in the specified file if the value is set and an error is thrown if it doesn't match. Otherwise it will simply be ignored, if a match is not there.  

Also for unit creation this is almost always critical. If there are multiple source files, and no file is specified, the fresh import statement will get created in any file, that is processed (and this probably not what you want and also will most likely lead to errors).  

However, it is not mandatory.


#### `type` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

A possibility to specify the unit type. Valid parameters are:
 * `es6`
 * `cjs`
 * `dynamic`

This _can_ be helpful if there are overlapping matches across the types. For example if es6 and dynamic import share the same module name. But there are actually few situations where it is necessary to specify the type, to be honest. But the option is there.


#### `createModule` <samp>[option for units]</samp>
Type: `String`  
Default: `null`

Creates a new module. Every selection method ([id](#id), [hash](#hash), [module](#module)) will get ignored if this key is passed. For the value set the module (path).  
Eg: `createModule: "./path/to/my-module.js"`

#### `insert` <samp>[option for units]</samp>
Type: `String`  
Default: `"bottom"`

Additional parameter for [`createModule`](#createModule-options-for-units). If set to bottom, the file is analyzed and the import statement is appended after the last found es6 import statement (which is the default behavior if not set). Setting it top top will append the statement on top of the file, directly after the the description if present (this is th default if no other es import statement was found).


#### `append` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createModule-options-for-units). Instead of inserting a fresh statement at the top or bottom of the other statements, it is also possible to append it after another import statement. This works by passing a [`unit`](#units) as a value. See it in action [here](#examples). 


#### `prepend` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createModule-options-for-units). Instead of inserting a fresh statement at the top or bottom of the other statements, it is also possible to prepend it before another import statement. This works by passing a [`unit`](#units) as a value. See it in action [here](#examples). 


#### `replace` <samp>[option for units]</samp>
Type: `Object`  
Default: `null`

Additional parameter for [`createModule`](#createModule-options-for-units). Instead of somehow adding it around another unit, this keyword replaces the according import statement, which is also passed as a [`unit`](#units) object. See it in action [here](#examples). 


#### `actions` <samp>[option for units]</samp>
Type: `Object | `Array[...Object]`  
Default: `null`  

This is the place where the actual manipulation of a unit (and ultimately statement) taken place. Several actions/**options** can be passed, for a singular option, use an object for multiple an array of objects:

---

##### `debug` <samp>[option for actions]</samp>
Type: `Any`  
Default: `null`  

A [debugging](#debugging) method for a specific unit. This also throws an intentional debugging error, which stops the building process. Verbose information about the specific unit are logged to the console. The value is irrelevant. If this is the only action it can be passed as a string: `actions: "debug"`


##### `select` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

Select the part you like to modify. This can be specific part (which also needs the option [name](#name-option-for-actions) to be passed):
 * `defaultMember`
 * `member`
 * `module`  
  

Or the groups:
 * `defaultMembers`
 * `members`
  
Common JS and dynamic imports only have the `module` available to select.


##### `name` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

For the selection of a specific part (`defaultMember` or `member`) the name needs to be specified. The name is directly related to the name of a member or default member (without its alias if present).   
A member part of `{memberA as aliasA, memberB}` can be selected with `name: "memberA"` or `name: "memberB"`.


##### `alias` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

An option to target an alias of a [selected](#select-option-for-actions) `defaultMember` or `member`. If a value is set, this will change or initially set the alias to the this value. Aliases can also be [removed](#remove-option-for-actions), in this case the value for alias be be ignored.


##### `rename` <samp>[option for actions]</samp>
Type: `String`  
Default: `null`  

This option is used to rename a [selected](#select-option-for-actions) specific part (`defaultMember`, `member`, `module`). The value is the new name of the selected part.


##### `modType` <samp>[option for actions]</samp>
Type: `String`  
Default: `"string"|"literal"`  

If [renaming](#rename-option-for-actions) is done with modType `string` there are quotation marks set around the input by default, mode `literal` is not doing that. This can be useful for replacing the module by anything other than a string (which is only valid for cjs and dynamic imports). By default the modType is defined by the existing statement. If it is not a string, type literal is assumed (those are rare occasions).


##### `keepAlias` <samp>[option for actions]</samp>
Type: `Boolean`  
Default: `false`  

This is an extra option to [rename](#rename-option-for-actions) a (default) members. If true, the alias will kept untouched, otherwise it gets overwritten in the renaming process, wether a new alias is set or not.


##### `remove` <samp>[option for actions]</samp>
Type: `Any`  
Default: `null`  

When no part was selected, this removes the entire unit &rarr; import statement. The value is irrelevant. If this is the only action it can be passed as a string: `actions: "remove"`. If a part is [selected](#select-option-for-actions) (`defaultMembers`, `members`, `module` or [`alias`](#alias-option-for-actions)) only the according part is getting removed.


##### `add` <samp>[option for actions]</samp>
Type: `String | `Array[...String]`
Default: `null`  

An additional parameter for `defaultMembers` or `members`. It adds one or multiple (default) members to the existing ones. The group has to be [selected](#select-option-for-actions).


## Examples

### Creating an Import Statement
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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
Without specifying [`insert`](#insert-option-for-units) or [`append`](#append-option-for-units)/[`prepend`](#prepend-option-for-units) the following import statement is getting inserted after the last import statement.
```js
import bar, { baz as qux } from "./path/to/foo.js";
```

#### Creating an Import Statement, appended after another statement:
Example: 
```js
import { foo } from "bar";
```

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

Leeds to:
```js
import { foo } from "bar";
import * as qux from "./path/to/baz.js";
```

#### Creating an Import Statement, prepended before another statement:
Example:
```js
import { foo } from "bar";
```

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            createModule: "./path/to/baz.js", 
            actions: {
                "select": "defaultMembers",
                "add": "* as qux"
            },
            prepend: {
                module: "bar"
            }
        }
    })
]
```  

#### Creating an Import Statement by replacing another statement:
Example:
```js
import { foo } from "bar";
```

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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


Leeds to:
```js
import * as qux from "./path/to/baz.js";
```



### Removing an Import Statement
If we take the example from before:
```js
import { foo } from "bar";
import * as qux from "./path/to/baz.js";
```

Module _"bar"_ can be removed like this:
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

#### Shorthand Method
The above can be shortened by a lot as the removal is the only action and the value is not relevant:
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "bar",
            actions: "remove"
        }
    })
]
```

### Changing the module
In this example there is a relative path that should be changed to a non relative module.
```js
import foo from "./path/to/bar.js";
```

This can be achieved like this:
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "bar.js",
            actions: {
                select: "module",
                rename: "bar"
            }
        }
    })
]
```

Result:
```js
import foo from "bar";
```

### Addressing the (default) members
`defaultMembers` and `members` are using the exact same methods. It is only important to keep in mind to address default members with `select: "defaultMembers"` or for a specific one `select: "defaultMember"`; for members `select: "members"` and `select: "member"`. 

#### Adding a defaultMember
Example:
```js
import foo from "bar";
```  

A default Member can be added like this:
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "bar",
            actions: {
                select: "defaultMembers",
                add: "* as baz"
            }
        }
    })
]
```

Result:
```js
import foo, * as baz from "bar";
```

Adding multiple members, again for the same example:
```js
import foo from "bar";
```  

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

Result:
```js
import foo, { baz, qux } from "bar";
```

#### Removing a member
```js
import { foo, bar, baz } from "qux";
```  

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "qux",
            actions: {
                select: "member",
                name: "bar,
                remove: null
            }
        }
    })
]
```

Result:
```js
import { foo, baz } from "qux";
```  

#### Changing a defaultMember name
Example:
```js
import foo from "bar";
```  

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

##### Renaming but keeping the alias
Example:
```js
import { foo as bar } from "baz";
```

By default the alias gets overwritten, but this can be prevented.
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "bar",
            actions: {
                select: "member",
                name: "foo",
                rename: "qux"
                keepAlias: true
            }
        }
    })
]
```  

Result:
```js
import { qux as bar } from "baz";
```

##### Addressing an alias
Aliases can also be addressed (_set_, _renamed_ and _removed_). All possibilities demonstrated at once via [chaining](#chaining).

Example:
```js
import { foo as bar, baz as qux, quux } from "quuz";
```  

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "bar",
            actions: [
                {
                    select: "member",
                    name: "foo",
                    alias: null,
                    remove: null // optional **
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

// ** remove can be set, but if the
//    alias is null, setting remove
//    is redundant
//    (the option to pass remove is
//    only added to keep the methods
//    consistent)
```  

Result:
```js
import { foo, baz as corge, quux as grault } from "quuz";
```

## General Hints

### Chaining
It is possible to address every part of a statement in one go. The order doesn't matter. But one part should not selected twice, which might produce unwanted results. To address every part of a [`unit`](#units) with its [`actions`](#actions-option-for-units) can be as complex as follows.

Example Statement:
```js
import foo, { bar } from "baz";
```

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

Result:
```js
import qux, { bar as quux, quuz, corge } from "grault";
```

This is in no way an efficient, but an example to show the complexity modifications are allowed to have. 

### Array and Object shortening
As a general rule all arrays can be unpacked if only one member is inside. Objects with meaningless values, can be passed as a string, if syntactically allowed. An example is shown [here](#shorthand-method)



## Debugging

### Show Diff
A general hint while creating a `rollup.config.js` [configuration file](https://www.rollupjs.org/guide/en/#configuration-files): it is useful to enable [`diff`](#show-diff) logging:

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

```js
plugins: [
    importManager({
        include: "index.js"
        debug: null,
        units: {
            //...
        }
    })
]
```
Or more verbose:

```js
plugins: [
    importManager({
        include: "index.js"
        debug: "verbose",
        units: {
            //...
        }
    })
]
```

In both cases the [`include`](#include) keyword is also passed. Otherwise the debug key would make the build process stop at the very first file it touches (if there is only one file anyway it is not necessary to pass it).

### Debugging Units
Also a single unit can be debugged. The keyword can be added to the existing list in an [actions](#actions-option-for-units) object.

```js
plugins: [
    importManager({
        units: {
            file: "index.js",
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

Or as a shorthand, if it is the only option:
```js
plugins: [
    importManager({
        units: {
            file: "index.js",
            module: "foo",
            actions: "debug"
        }
    })
]
```

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2022, UmamiAppearance

