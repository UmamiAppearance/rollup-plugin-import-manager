const hi = require("./lib/hello.cjs")

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
}
