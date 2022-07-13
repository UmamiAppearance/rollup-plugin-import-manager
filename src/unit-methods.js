import { DebuggingError, MatchError } from "./errors.js";

/**
 * Creates methods for unit manipulation to
 * be attached to a requested unit.
 */
export default class ImportManagerUnitMethods {

    /**
     * Stores the handed over unit and creates
     * an update method.
     * @param {Object} unit - The unit a user requests 
     * @param {*} es6NodeToUnit - Method to analyze a 
     */
    constructor(unit, es6NodeToUnit) {
        this.unit = unit;

        // After a change in the code of a es6 unit is made
        // it gets analyzed again, which is very verbose,
        // but prevents errors. The "MagicString" does not
        // contain multiple changes at a time. The analysis
        // function is the same as for the initial file
        // analyses and gets handed over by the main class.

        this.updateUnit = () => {

            const unit = es6NodeToUnit(
                this.unit.code.toString(),
                this.unit.start,
                this.unit.end
            );

            Object.assign(this.unit, unit);

        };
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
     * @param {*} modType - Module type (literal|raw).
     */
    renameModule(name, modType) {
        if (modType === "string") {
            if (!this.unit.module.quotes) {
                this.unit.module.quotes = "\"";
            }
            const q = this.unit.module.quotes;
            name = q + name + q;
        } else if (modType !== "raw") {
            throw new TypeError(`Unknown modType '${modType}'. Valid types are 'string' and 'raw'.`);
        }
        
        this.unit.code.overwrite(this.unit.module.start, this.unit.module.end, name);

        if (this.unit.type === "es6") {
            this.updateUnit();
        }
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
            this.unit.code.appendRight(start, defStr);
        }

        // handle the case if default members do not exist, 
        // and also no non default members (the addition
        // needs to be appended left, otherwise is
        // interferes with the module part)
        else if (this.unit.members.count === 0) {
            start = this.unit.module.start;
            defStr = names.join(this.unit.members.separator);
            memberPart = defStr;
            defStr += " from ";
            this.unit.code.appendLeft(start, defStr);
        }

        // handle the case if default members do not exist, 
        // but non default members
        else {
            start = this.unit.members.start;
            defStr = names.join(this.unit.defaultMembers.separator)
                   + this.unit.members.separator;
            this.unit.code.appendRight(start, defStr);
        }
        
        this.updateUnit(memberPart);
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
            this.unit.code.appendRight(start, memStr);
        }

        // handle the case if members do not exist, 
        // and also no default members (the addition
        // needs to be appended left, otherwise is
        // interferes with the module part)
        else if (this.unit.defaultMembers.count === 0) {
            start = this.unit.module.start;
            memStr = "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            memberPart = memStr;
            memStr += " from ";
            this.unit.code.appendLeft(start, memStr);
        }

        // handle the case if members do not exist, 
        // but default members
        else {
            start = this.unit.defaultMembers.end;
            memStr = this.unit.defaultMembers.separator
                   + "{ "
                   + names.join(this.unit.members.separator)
                   + " }";
            this.unit.code.appendRight(start, memStr);
        }

        this.updateUnit(memberPart);
    }


    /**
     * Internal helper method to get the member type.
     * The user input distinguishes between member/defaultMember
     * and the plural versions of them. To prevent confusion in the
     * process of selecting the different styles in the unit, this
     * methods adds an "s" to the given string if missing and selects
     * the requested type.
     * @param {*} memberType 
     * @returns 
     */
    #getType(memberType) {
        if (memberType.at(-1) !== "s") {
            memberType += "s";
        }
        return this.unit[memberType];
    }


    /**
     * Internal helper method to find a specific member
     * or default member.
     * @param {string} memberType - member/defaultMember. 
     * @param {string} name - (default) member name. 
     * @returns {Object} - (default) member object.
     */
    #findMember(memberType, name) {
        if (!name) {
            throw new Error(`${memberType} name must be set.`);
        }
        const filtered = this.#getType(memberType).entities.filter(m => m.name === name);
        if (filtered.length !== 1) {
            throw new MatchError(`Unable to locate ${memberType} with name '${name}'`);
        }
        return filtered[0];
    }


    /**
     * Removes a (default) member.
     * @param {string} memberType - member|defaultMember
     * @param {string} name - Name of the (default) member 
     */
    removeMember(memberType, name) {
        this.#ES6only();

        const member = this.#findMember(memberType, name);

        if (this.#getType(memberType).count === 1) {
            this.removeMembers(memberType);
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


    /**
     * Removes an entire group of members or default members.
     * @param {string} membersType - member(s)|defaultMember(s) 
     */
    removeMembers(membersType) {
        this.#ES6only();

        const isDefault = membersType.indexOf("default") > -1;

        const members = this.#getType(membersType);
        const others = this.#getType(isDefault ? "members" : "defaultMembers");

        let memberPart = null;
        if (others.count > 0) {
            
            const start = !isDefault 
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


    /**
     * Renames a single (default) member. The alias
     * can be kept or overwritten. 
     * @param {string} memberType - member|defaultMember 
     * @param {string} name - The (default) member to rename.
     * @param {string} newName - The new name of the (default) member.
     * @param {boolean} keepAlias - True if the alias shall be untouched. 
     */
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


    /**
     * Changes the alias. Changing can be renaming
     * setting it initially or removing. 
     * @param {string} memberType - member|defaultMember
     * @param {string} name - (default) member name
     * @param {string} [set] - A new name or nothing for removal
     */
    setAlias(memberType, name, set) {
        const aliasStr = set ? `${name} as ${set}` : name;
        this.renameMember(memberType, name, aliasStr, false);
        this.updateUnit();
    }


    /**
     * Method to call after a unit was completely removed
     * or replaced, to prevent matching it again afterwards.
     */
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
