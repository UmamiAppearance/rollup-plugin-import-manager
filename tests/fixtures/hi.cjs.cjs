const hi = require("./lib/hello.cjs");
const dummy = require("./lib/dummy.cjs");

const englishGreeting = () => hi.hello();
const nonEnglishGreeting = () => hi.hallo();
const nerdGreeting = () => hi.helloWorld();

const date = new Date();

if (date.getFullYear() === 1984) {
    console.log(
        englishGreeting(),
        nonEnglishGreeting(),
        nerdGreeting()
    );

    console.log(dummy());
}
