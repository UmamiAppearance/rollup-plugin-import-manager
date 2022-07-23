const hi = await import("./lib/hello.js");

const englishGreeting = () => hi.hello();
const nonEnglishGreeting = () => hi.hallo();
const nerdGreeting = () => hi.default();

const date = new Date();

if (date.getFullYear() === 1984) {
    console.log(
        englishGreeting(),
        nonEnglishGreeting(),
        nerdGreeting()
    );
}
