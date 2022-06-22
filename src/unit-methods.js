import { DebuggingError, MatchError } from "./errors.js";

export default class ImportManagerUnitMethods {

    /**
     * Creates methods for unit manipulation to
     * be attached to a requested unit.
     * @param {Object} unit - The unit a user requests 
     * @param {*} es6StrToObj - Method to analyze a 
     */
    constructor(unit, es6StrToObj) {
        this.unit = unit;

        // After a change in the code of a es6 unit is made
        // it gets analyzed again, which is very verbose,
        // but prevents errors. The "MagicString" does not
        // contain multiple changes at a time. The analysis
        // function is the same as for the initial file
        // analyses and gets handed over by the main class.

        this.updateUnit = (memberPart=null) => {

            if (memberPart === null) {
                const memberPartStart = this.unit.defaultMembers.start || this.unit.members.start;
                const memberPartEnd = this.unit.members.end || this.unit.defaultMembers.end;
                memberPart = this.unit.code.slice(memberPartStart, memberPartEnd);
            }

            const unit = es6StrToObj(
                this.unit.code.toString(),
                this.unit.start,
                this.unit.end,
                this.unit.code.toString(),
                memberPart,
                this.unit.code.slice(this.unit.module.start, this.unit.module.end)
            );
            
            // copy all other updated properties
            Object.assign(this.unit, unit);
        }
    }


    /**
     * Makes sure, that the processed unit is of type 'es6'. 
     */
    #ES6only() {
        if (this.unit.type !== "es6") {
            throw new Error("This method is only available for ES6 imports.");
        }
    }


    /**
     * Changes the module part of a import statement.
     * @param {string} name - The new module part/path.
     * @param {*} modType - Module type (sting|literal).
     */
    renameModule(name, modType) {
        if (modType === "string") {
            const q = this.unit.module.quotes;
            name = q + name + q;
        } else if (modType !== "literal") {
            throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'literal'.`);
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);
        if (this.unit.type === "es6") {
            this.updateUnit();
        }
    }


    /**
     * Adds non default members to the import statement.
     * @param {string[]} names - A list of members to add. 
     */
    addMembers(names) {
        this.#ES6only();

        let start; 
        let memStr;
        let memberPart = null;
        
        // handle the case if members already exist
        if (this.unit.members.count > 0) {
            start = this.unit.members.entities.at(-1).absEnd;
            memStr = this.unit.members.separator 
                   + names.join(this.unit.members.separator);
        }

        // handle the case if members do not exist, 
        // and also no default members
        else if (this.unit.defaultMembers.count === 0) {
            start = this.unit.module.start;
            memStr = "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            memberPart = memStr;
            memStr += " from ";
        }

        // handle the case if members do not exist, 
        // but default members
        else {
            start = this.unit.defaultMembers.end;
            memStr = this.unit.defaultMembers.separator
                   + "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
        }

        this.unit.code.appendRight(start, memStr);
        this.updateUnit(memberPart);
    }


    /**
     * Adds default members to the import statement.
     * @param {string[]} names - A list of default members to add.
     */
    addDefaultMembers(names) {
        this.#ES6only();

        let start; 
        let defStr;
        let memberPart = null;

        // handle the case if default members already exist
        if (this.unit.defaultMembers.count > 0) {
            start = this.unit.defaultMembers.entities.at(-1).absEnd;
            defStr = this.unit.defaultMembers.separator 
                   + names.join(this.unit.defaultMembers.separator);
        }

        // handle the case if default members do not exist, 
        // and also no non default members
        else if (this.unit.members.count === 0) {
            start = this.unit.module.start;
            defStr = names.join(this.unit.members.separator);
            memberPart = defStr;
            defStr += " from ";
        }

        // handle the case if default members do not exist, 
        // but non default members
        else {
            start = this.unit.members.start;
            defStr = names.join(this.unit.defaultMembers.separator)
                   + this.unit.members.separator;
        }
        
        this.unit.code.appendRight(start, defStr);
        this.updateUnit();
    }

    #findMember(memberType, name) {
        if (!name) {
            throw new Error(`${memberType} name must be set.`);
        }
        const filtered = this.unit[memberType+"s"].entities.filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }


    removeMember(memberType, name) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);

        if (this.unit[memberType+"s"].count === 1) {
            this.removeMembers(memberType+"s");
        } 

        else {
            let start;
            let end;
            
            if (member.next) {
                start = member.start;
                end = member.next;
            } else if (member.last) {
                start = member.last;
                end = member.absEnd;
            } else {
                start = member.start;
                end = member.absEnd;
            }

            this.unit.code.remove(start, end);   
            this.updateUnit();

        }
    }

    removeMembers(membersType) {
        this.#ES6only();

        const members = this.unit[membersType];
        const others = this.unit[membersType === "members" ? "defaultMembers" : "members"];

        let memberPart = null;
        if (others.count > 0) {
            
            const start = (membersType === "members") 
                        ? this.unit.defaultMembers.entities.at(-1).end
                        : members.start;

            this.unit.code.remove(start, members.end);
        }

        else {
            this.unit.code.remove(members.start, this.unit.module.start);
            memberPart = "";
        }

        this.updateUnit(memberPart);
    }

    renameMember(memberType, name, newName, keepAlias) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);
        let end;

        if (keepAlias) {
            end = member.end;
        } else {
            end = member.absEnd;
        }
        this.unit.code.overwrite(member.start, end, newName);
        this.updateUnit();
    }

    setAlias(memberType, name, set) {
        const aliasStr = set ? `${name} as ${set}` : name;
        this.renameMember(memberType, name, aliasStr, false);
        this.updateUnit();
    }

    makeUntraceable() {
        this.unit.id = `(deleted) ${this.unit.id}`;
        this.unit.hash = `(deleted) ${this.unit.hash}`;
        this.unit.module.name = `(deleted) ${this.unit.module.name}`;
    }

    /**
     * Debugging method to stop the building process
     * and list this unit properties.
     */
    log() {
        const unit = { ...this.unit };
        delete unit.methods;
        unit.code = [ unit.code.toString() ];
        throw new DebuggingError(JSON.stringify(unit, null, 4), "unit");
    }
}
